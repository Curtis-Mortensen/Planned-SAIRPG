import { geolocation } from "@vercel/functions";
import {
  convertToModelMessages,
  createUIMessageStream,
  JsonToSseTransformStream,
  smoothStream,
  stepCountIs,
  streamText,
} from "ai";
import { after } from "next/server";
import {
  createResumableStreamContext,
  type ResumableStreamContext,
} from "resumable-stream";
import { auth, type UserType } from "@/app/(auth)/auth";
import { entitlementsByUserType } from "@/lib/ai/entitlements";
import { type RequestHints, systemPrompt } from "@/lib/ai/prompts";
import { getLanguageModel } from "@/lib/ai/providers";
import { createDocument } from "@/lib/ai/tools/create-document";
import { getWeather } from "@/lib/ai/tools/get-weather";
import { requestSuggestions } from "@/lib/ai/tools/request-suggestions";
import { updateDocument } from "@/lib/ai/tools/update-document";
import { isProductionEnvironment } from "@/lib/constants";
import {
  createStreamId,
  deleteChatById,
  getChatById,
  getMessageCountByUserId,
  getMessagesByChatId,
  getUserById,
  saveChat,
  saveMessages,
  updateChatTitleById,
  updateMessage,
  createEventLog,
  createGameSession,
  getGameSessions,
} from "@/lib/db/queries";
import type { DBMessage } from "@/lib/db/schema";
import { ChatSDKError } from "@/lib/errors";
import type { ChatMessage } from "@/lib/types";
import { convertToUIMessages, generateUUID } from "@/lib/utils";
import { generateTitleFromUserMessage } from "../../actions";
import { calculateCost } from "@/lib/ai/cost";
import { type PostRequestBody, postRequestBodySchema } from "./schema";

export const maxDuration = 60;

let globalStreamContext: ResumableStreamContext | null | undefined = undefined;
let streamContextInitialized = false;

export function getStreamContext() {
  // Only try to initialize once
  if (!streamContextInitialized) {
    streamContextInitialized = true;
    try {
      globalStreamContext = createResumableStreamContext({
        waitUntil: after,
      });
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      const errorCode = error?.code || "";
      
      // Handle various error cases where resumable streams can't be initialized
      if (
        errorMessage.includes("REDIS_URL") ||
        errorMessage.includes("KV_URL") ||
        errorCode === "ERR_INVALID_URL" ||
        errorMessage.includes("Invalid URL")
      ) {
        console.log(
          " > Resumable streams are disabled due to missing or invalid REDIS_URL/KV_URL"
        );
      } else {
        console.error("Failed to create resumable stream context:", error);
      }
      // Set to null to indicate initialization was attempted but failed
      globalStreamContext = null;
    }
  }

  return globalStreamContext ?? null;
}

export async function POST(request: Request) {
  let requestBody: PostRequestBody;

  try {
    const json = await request.json();
    requestBody = postRequestBodySchema.parse(json);
  } catch (_) {
    return new ChatSDKError("bad_request:api").toResponse();
  }

  try {
    const { id, message, messages, selectedChatModel, selectedVisibilityType } =
      requestBody;

    const session = await auth();

    if (!session?.user) {
      return new ChatSDKError("unauthorized:chat").toResponse();
    }

    // Verify user exists in database (protects against stale JWT tokens)
    const existingUser = await getUserById(session.user.id);
    if (!existingUser) {
      return new ChatSDKError(
        "not_found:database",
        "User not found in database. Please refresh the page to sign in again."
      ).toResponse();
    }

    const userType: UserType = session.user.type;

    const messageCount = await getMessageCountByUserId({
      id: session.user.id,
      differenceInHours: 24,
    });

    if (messageCount > entitlementsByUserType[userType].maxMessagesPerDay) {
      return new ChatSDKError("rate_limit:chat").toResponse();
    }

    // Check if this is a tool approval flow (all messages sent)
    const isToolApprovalFlow = Boolean(messages);

    const chat = await getChatById({ id });
    let messagesFromDb: DBMessage[] = [];
    let titlePromise: Promise<string> | null = null;

    if (chat) {
      if (chat.userId !== session.user.id) {
        return new ChatSDKError("forbidden:chat").toResponse();
      }
      // Only fetch messages if chat already exists and not tool approval
      if (!isToolApprovalFlow) {
        messagesFromDb = await getMessagesByChatId({ id });
      }
    } else if (message?.role === "user") {
      // Save chat immediately with placeholder title
      await saveChat({
        id,
        userId: session.user.id,
        title: "New chat",
        visibility: selectedVisibilityType,
      });

      // Start title generation in parallel (don't await)
      titlePromise = generateTitleFromUserMessage({ message });
    }

    // Use all messages for tool approval, otherwise DB messages + new message
    const uiMessages = isToolApprovalFlow
      ? (messages as ChatMessage[])
      : [...convertToUIMessages(messagesFromDb), message as ChatMessage];

    const { longitude, latitude, city, country } = geolocation(request);

    const requestHints: RequestHints = {
      longitude,
      latitude,
      city,
      country,
    };

    // Only save user messages to the database (not tool approval responses)
    if (message?.role === "user") {
      await saveMessages({
        messages: [
          {
            chatId: id,
            id: message.id,
            role: "user",
            parts: message.parts,
            attachments: [],
            createdAt: new Date(),
          },
        ],
      });
    }

    // Generate system prompt BEFORE the logging try block so it's always available for streamText
    const sysPrompt = systemPrompt({ selectedChatModel, requestHints });

    // --- SAIRPG LOGGING INTEGRATION ---
    // Event logging is non-blocking - if it fails, we log the error but continue with chat
    // Declare these outside try block so they're accessible in onFinish callback
    let sessionId: string | undefined;
    let branchId: string | undefined;
    
    try {
      // 1. Get or create active game session
      const gameSessions = await getGameSessions({ userId: session.user.id });
      let gameSession = gameSessions.find(s => s.isActive);
      
      if (!gameSession) {
        const newSession = await createGameSession({
          userId: session.user.id,
          title: "New Adventure",
        });
        gameSession = newSession;
      }

      sessionId = gameSession.id;
      // Use the session's current branch or a fallback if somehow null (shouldn't happen with proper schema/defaults)
      branchId = gameSession.branchId || generateUUID();

      // 2. Log System Prompt (skip for tool approval flow as we only care about the initial generation or updated generation)
      
      await createEventLog({
        sessionId,
        branchId,
        sequenceNum: Date.now().toString(), // Using timestamp as detailed sequence for now
        eventType: "system_prompt",
        moduleName: "system",
        actor: "system",
        payload: { 
          prompt: sysPrompt,
          chatId: id 
        },
      });

      // 3. Log User Message as Player Action
      // We only log this if it's a new user message
      if (message?.role === "user") {
        const userText = message.parts
          .filter(p => p.type === "text")
          .map(p => (p as { text: string }).text)
          .join(" ");

        await createEventLog({
          sessionId,
          branchId,
          sequenceNum: Date.now().toString(),
          eventType: "player_action",
          moduleName: "player",
          actor: "player",
          payload: { 
            message: userText,
            chatId: id,
            messageId: message.id 
          },
          cost: calculateCost({ 
            model: selectedChatModel, 
            tokensIn: userText.length / 4, // Rough estimate if not available
            tokensOut: 0
          }).toString()
        });
      }
    } catch (error) {
      // Log error but don't fail the chat request
      console.error("Failed to log event:", error);
    }
    // --- END SAIRPG LOGGING INTEGRATION ---

    const streamId = generateUUID();
    await createStreamId({ streamId, chatId: id });

    const stream = createUIMessageStream({
      // Pass original messages for tool approval continuation
      originalMessages: isToolApprovalFlow ? uiMessages : undefined,
      execute: async ({ writer: dataStream }) => {
        // Handle title generation in parallel
        if (titlePromise) {
          titlePromise.then((title) => {
            updateChatTitleById({ chatId: id, title });
            dataStream.write({ type: "data-chat-title", data: title });
          });
        }

        const isReasoningModel =
          selectedChatModel.includes("reasoning") ||
          selectedChatModel.includes("thinking");

        const result = streamText({
          model: getLanguageModel(selectedChatModel),
          system: sysPrompt,
          messages: await convertToModelMessages(uiMessages),
          stopWhen: stepCountIs(5),
          experimental_activeTools: isReasoningModel
            ? []
            : [
                "getWeather",
                "createDocument",
                "updateDocument",
                "requestSuggestions",
              ],
          experimental_transform: isReasoningModel
            ? undefined
            : smoothStream({ chunking: "word" }),
          providerOptions: isReasoningModel
            ? {
                anthropic: {
                  thinking: { type: "enabled", budgetTokens: 10_000 },
                },
              }
            : undefined,
          tools: {
            getWeather,
            createDocument: createDocument({ session, dataStream }),
            updateDocument: updateDocument({ session, dataStream }),
            requestSuggestions: requestSuggestions({
              session,
              dataStream,
            }),
          },
          experimental_telemetry: {
            isEnabled: isProductionEnvironment,
            functionId: "stream-text",
          },
        });

        result.consumeStream();

        dataStream.merge(
          result.toUIMessageStream({
            sendReasoning: true,
          })
        );
      },
      generateId: generateUUID,
      onFinish: async ({ messages: finishedMessages }) => {
        if (isToolApprovalFlow) {
          // For tool approval, update existing messages (tool state changed) and save new ones
          for (const finishedMsg of finishedMessages) {
            const existingMsg = uiMessages.find((m) => m.id === finishedMsg.id);
            if (existingMsg) {
              // Update existing message with new parts (tool state changed)
              await updateMessage({
                id: finishedMsg.id,
                parts: finishedMsg.parts,
              });
            } else {
              // Save new message
              await saveMessages({
                messages: [
                  {
                    id: finishedMsg.id,
                    role: finishedMsg.role,
                    parts: finishedMsg.parts,
                    createdAt: new Date(),
                    attachments: [],
                    chatId: id,
                  },
                ],
              });
            }
          }
        } else if (finishedMessages.length > 0) {
          // Normal flow - save all finished messages
          await saveMessages({
            messages: finishedMessages.map((currentMessage) => ({
              id: currentMessage.id,
              role: currentMessage.role,
              parts: currentMessage.parts,
              createdAt: new Date(),
              attachments: [],
              chatId: id,
            })),
          });

          // --- SAIRPG LOGGING INTEGRATION ---
          // 4. Log AI Response as Narrator Response
          // Only log the assistant's final response
          if (sessionId && branchId) {
            try {
              const assistantMessages = finishedMessages.filter(m => m.role === "assistant");
              for (const msg of assistantMessages) {
                const assistantText = msg.parts
                  .filter(p => p.type === "text")
                  .map(p => (p as { text: string }).text)
                  .join(" ");

                if (assistantText) {
                   // Re-fetch active session just in case, but using captured variables is fine for now
                   // In a real app we might want to ensure we're on the latest branch if it changed during generation
                   await createEventLog({
                     sessionId,
                     branchId,
                     sequenceNum: Date.now().toString(),
                     eventType: "narrator_response",
                     moduleName: "narrator",
                     actor: "narrator",
                     payload: { 
                       message: assistantText,
                       chatId: id,
                       messageId: msg.id
                     },
                     cost: calculateCost({ 
                       model: selectedChatModel, 
                       tokensIn: 0, 
                       tokensOut: assistantText.length / 4 // Rough estimate till we get usage
                     }).toString()
                   });
                }
              }
            } catch (error) {
              // Log error but don't fail the chat request
              console.error("Failed to log narrator response event:", error);
            }
          }
           // --- END SAIRPG LOGGING INTEGRATION ---
        }
      },
      onError: () => {
        return "Oops, an error occurred!";
      },
    });

    const streamContext = getStreamContext();

    if (streamContext) {
      try {
        const resumableStream = await streamContext.resumableStream(
          streamId,
          () => stream.pipeThrough(new JsonToSseTransformStream())
        );
        if (resumableStream) {
          return new Response(resumableStream);
        }
      } catch (error) {
        console.error("Failed to create resumable stream:", error);
      }
    }

    return new Response(stream.pipeThrough(new JsonToSseTransformStream()));
  } catch (error) {
    const vercelId = request.headers.get("x-vercel-id");

    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }

    // Check for Vercel AI Gateway credit card error
    if (
      error instanceof Error &&
      error.message?.includes(
        "AI Gateway requires a valid credit card on file to service requests"
      )
    ) {
      return new ChatSDKError("bad_request:activate_gateway").toResponse();
    }

    console.error("Unhandled error in chat API:", error, { vercelId });
    return new ChatSDKError("offline:chat").toResponse();
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return new ChatSDKError("bad_request:api").toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  const chat = await getChatById({ id });

  if (chat?.userId !== session.user.id) {
    return new ChatSDKError("forbidden:chat").toResponse();
  }

  const deletedChat = await deleteChatById({ id });

  return Response.json(deletedChat, { status: 200 });
}
