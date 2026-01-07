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
import { type RequestHints, systemPrompt, buildNarratorPrompt } from "@/lib/ai/prompts";
import type { NarratorSettings } from "@/lib/ai/narrator-config";
import { getVerbosityLabel, getToneLabel, getChallengeLabel } from "@/lib/ai/narrator-config";
import { getLanguageModel } from "@/lib/ai/providers";
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
  createEvent,
  getGameByChatId,
  getActiveGame,
  getOrCreateActiveGame,
  updateGame,
  getPromptByModule,
} from "@/lib/db/queries";
import type { DBMessage } from "@/lib/db/schema";
import { ChatSDKError } from "@/lib/errors";
import { createSystemMessage } from "@/lib/system-messages";
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

    // =========================================================================
    // PHASE GATE: Check if the game is in a blocking phase
    // =========================================================================
    const game = await getGameByChatId(id);
    if (game && message?.role === "user") {
      const { getCurrentGamePhase, getActivePendingAction } = await import("@/lib/db/queries");
      const { isPhaseBlocking } = await import("@/lib/game-state/state-machine");
      const { GAME_PHASES } = await import("@/lib/game-state/types");
      
      const currentPhase = await getCurrentGamePhase(game.id);
      
      // Type guard to ensure currentPhase is a valid GamePhase
      const isValidPhase = (phase: string): phase is typeof GAME_PHASES[number] => {
        return GAME_PHASES.includes(phase as any);
      };
      
      if (isValidPhase(currentPhase) && isPhaseBlocking(currentPhase)) {
        return Response.json(
          { 
            error: true, 
            errorCode: "PHASE_BLOCKED",
            errorMessage: "Please wait while processing...",
            currentPhase,
          },
          { status: 409 } // Conflict
        );
      }

      // If in meta_review phase, don't process as normal chat
      // The review UI handles this separately
      if (currentPhase === "meta_review") {
        const activePendingAction = await getActivePendingAction(game.id);
        return Response.json(
          {
            error: true,
            errorCode: "IN_META_REVIEW",
            errorMessage: "Please review the proposed events first.",
            pendingActionId: activePendingAction?.id,
          },
          { status: 409 }
        );
      }

      // If in_meta_event, we process but with different context
      // (The narrator knows we're resolving an event, not starting fresh)
      // Store this in a variable for later use in building the narrator context
      const routeContext = {
        inMetaEvent: currentPhase === "in_meta_event",
        pendingActionId: (await getActivePendingAction(game.id))?.id ?? null,
      };
      
      // Note: routeContext will be used when building the Narrator Context
      // For now, we continue with normal processing
    }
    // =========================================================================

    // Check if this is the first user message (new game)
    const isFirstUserMessage = !isToolApprovalFlow && 
      message?.role === "user" && 
      messagesFromDb.length === 0;

    // Fetch narrator prompt for system prompt, opening scene, and lore
    let narratorPromptData: Awaited<ReturnType<typeof getPromptByModule>> = null;
    let openingSceneText = "";
    let loreText = "";
    
    try {
      narratorPromptData = await getPromptByModule("narrator");
      
      // Extract opening scene and lore if this is the first message
      if (isFirstUserMessage) {
        if (narratorPromptData?.settings?.openingScene) {
          openingSceneText = narratorPromptData.settings.openingScene as string;
        } else {
          // Fallback to default if not in DB
          const { NARRATOR_DEFAULT_SETTINGS } = await import("@/lib/db/prompts/narrator-default");
          openingSceneText = NARRATOR_DEFAULT_SETTINGS.openingScene || "";
        }
        
        if (narratorPromptData?.settings?.lore) {
          loreText = narratorPromptData.settings.lore as string;
        } else {
          // Fallback to default if not in DB
          const { NARRATOR_DEFAULT_LORE } = await import("@/lib/db/prompts/narrator-default");
          loreText = NARRATOR_DEFAULT_LORE || "";
        }
      }
    } catch (error) {
      console.error("Failed to fetch narrator prompt:", error);
      // Continue without narrator prompt - will fall back to default system prompt
    }

    // Append lore to first user message if present
    let firstUserMessage = message as ChatMessage | undefined;
    if (isFirstUserMessage && loreText && firstUserMessage?.role === "user") {
      const userText = firstUserMessage.parts
        .filter(p => p.type === "text")
        .map(p => (p as { text: string }).text)
        .join(" ");
      
      // Create a new message with lore appended
      firstUserMessage = {
        ...firstUserMessage,
        parts: [
          ...firstUserMessage.parts.filter(p => p.type !== "text"),
          {
            type: "text" as const,
            text: `${userText}\n\n---\n\n${loreText}`,
          },
        ],
      };
    }

    // Build UI messages: for tool approval use all messages, otherwise DB messages + system message (if first) + new message
    let uiMessages: ChatMessage[];
    if (isToolApprovalFlow) {
      uiMessages = messages as ChatMessage[];
    } else {
      const dbMessages = convertToUIMessages(messagesFromDb);
      
      // Add system message "World Lore Loaded" before first AI response if this is the first user message
      if (isFirstUserMessage && loreText) {
        const systemMessage = createSystemMessage("world_lore_loaded");
        
        // Find opening scene in dbMessages (first assistant message) and insert system message before it
        const openingSceneIndex = dbMessages.findIndex(
          (msg) => msg.role === "assistant" && 
          msg.parts.some(
            (part) => part.type === "text" && 
            (part as { text: string }).text === openingSceneText
          )
        );
        
        if (openingSceneIndex >= 0) {
          // Insert system message before opening scene
          const beforeOpeningScene = dbMessages.slice(0, openingSceneIndex);
          const openingSceneAndAfter = dbMessages.slice(openingSceneIndex);
          uiMessages = [...beforeOpeningScene, systemMessage, ...openingSceneAndAfter, firstUserMessage as ChatMessage];
        } else {
          // No opening scene found, add system message first
          uiMessages = [systemMessage, ...dbMessages, firstUserMessage as ChatMessage];
        }
      } else {
        uiMessages = [...dbMessages, firstUserMessage as ChatMessage];
      }
    }

    const { longitude, latitude, city, country } = geolocation(request);

    const requestHints: RequestHints = {
      longitude,
      latitude,
      city,
      country,
    };

    // Only save user messages to the database (not tool approval responses)
    if (message?.role === "user") {
      const messagesToSave = [
        {
          chatId: id,
          id: message.id,
          role: "user" as const,
          parts: message.parts,
          attachments: [],
          createdAt: new Date(),
        },
      ];

      // If this is the first user message, save the opening scene as an assistant message and system message
      if (isFirstUserMessage) {
        // Check if opening scene message doesn't already exist in DB
        if (openingSceneText) {
          const existingMessages = await getMessagesByChatId({ id });
          const hasOpeningScene = existingMessages.some(
            (msg) => msg.role === "assistant" && 
            msg.parts.some(
              (part) => part.type === "text" && 
              (part as { text: string }).text === openingSceneText
            )
          );

          if (!hasOpeningScene) {
            messagesToSave.unshift({
              chatId: id,
              id: generateUUID(),
              role: "assistant" as const,
              parts: [
                {
                  type: "text" as const,
                  text: openingSceneText,
                },
              ],
              attachments: [],
              createdAt: new Date(Date.now() - 1500), // After system message
            });
          }
        }
        
        // Save system message "World Lore Loaded" if lore exists (should appear before opening scene)
        if (loreText) {
          const existingMessages = await getMessagesByChatId({ id });
          const hasSystemMsg = existingMessages.some(
            (msg) => msg.role === "system"
          );

          if (!hasSystemMsg) {
            const sysMsg = createSystemMessage("world_lore_loaded");
            messagesToSave.unshift({
              chatId: id,
              id: sysMsg.id,
              role: "system" as const,
              parts: sysMsg.parts,
              attachments: [],
              createdAt: new Date(Date.now() - 2000), // Earliest to appear first
            });
          }
        }
      }

      await saveMessages({
        messages: messagesToSave,
      });
    }

    // Log lore loading event if lore was loaded (for first user message)
    if (isFirstUserMessage && loreText) {
      try {
        let game = await getGameByChatId(id);
        if (!game) {
          game = await getOrCreateActiveGame(session.user.id);
          if (game.chatId !== id) {
            await updateGame({ gameId: game.id, chatId: id });
            game = { ...game, chatId: id };
          }
        }
        
        await createEvent({
          gameId: game.id,
          sequenceNum: (Date.now() - 1).toString(), // Slightly before system prompt
          eventType: "lore_loaded",
          moduleName: "narrator",
          actor: "system",
          payload: {
            chatId: id,
            loreLength: loreText.length,
            hasLore: true,
          },
        });
      } catch (error) {
        // Log error but don't fail the chat request
        console.error("Failed to log lore loaded event:", error);
      }
    }

    // Generate system prompt BEFORE the logging try block so it's always available for streamText
    // Use narrator prompt with YAML configuration if available, otherwise fall back to default
    let sysPrompt: string;
    let narratorSettings: NarratorSettings | null = null;
    
    if (narratorPromptData) {
      // Build narrator system prompt with YAML personality configuration
      narratorSettings = narratorPromptData.settings as NarratorSettings;
      sysPrompt = buildNarratorPrompt({
        baseContent: narratorPromptData.content,
        settings: narratorSettings,
        requestHints,
      });
    } else {
      // Fall back to default narrator prompt if DB fetch failed
      try {
        const { NARRATOR_DEFAULT_PROMPT, NARRATOR_DEFAULT_SETTINGS, NARRATOR_DEFAULT_LORE } = 
          await import("@/lib/db/prompts/narrator-default");
        narratorSettings = {
          ...NARRATOR_DEFAULT_SETTINGS,
          lore: NARRATOR_DEFAULT_LORE,
        };
        sysPrompt = buildNarratorPrompt({
          baseContent: NARRATOR_DEFAULT_PROMPT,
          settings: narratorSettings,
          requestHints,
        });
      } catch {
        // Ultimate fallback to basic system prompt
        sysPrompt = systemPrompt({ selectedChatModel, requestHints });
      }
    }

    // --- SAIRPG LOGGING INTEGRATION ---
    // Event logging is non-blocking - if it fails, we log the error but continue with chat
    // Declare this outside try block so it's accessible in onFinish callback
    let gameId: string | undefined;
    
    try {
      // 1. Find or create game for this chat
      let game = await getGameByChatId(id);
      
      if (!game) {
        // No game exists for this chat, get or create active game
        game = await getOrCreateActiveGame(session.user.id);
        
        // Update game to use this chatId
        if (game.chatId !== id) {
          await updateGame({ gameId: game.id, chatId: id });
          game = { ...game, chatId: id };
        }
      }

      gameId = game.id;

      // 2. Log Personality Settings if narrator settings are available
      if (narratorSettings && !isToolApprovalFlow) {
        await createEvent({
          gameId,
          sequenceNum: (Date.now() - 500).toString(), // Before system prompt
          eventType: "personality_sent",
          moduleName: "narrator",
          actor: "system",
          payload: {
            verbosity: narratorSettings.verbosity ?? 3,
            verbosityLabel: getVerbosityLabel(narratorSettings.verbosity ?? 3),
            tone: narratorSettings.tone ?? 3,
            toneLabel: getToneLabel(narratorSettings.tone ?? 3),
            challenge: narratorSettings.challenge ?? 3,
            challengeLabel: getChallengeLabel(narratorSettings.challenge ?? 3),
            chatId: id,
          },
        });
      }

      // 3. Log System Prompt (skip for tool approval flow as we only care about the initial generation or updated generation)
      
      await createEvent({
        gameId,
        sequenceNum: Date.now().toString(), // Using timestamp as detailed sequence for now
        eventType: "system_prompt",
        moduleName: "system",
        actor: "system",
        payload: { 
          prompt: sysPrompt,
          chatId: id 
        },
      });

      // 4. Log User Message as Player Action
      // We only log this if it's a new user message
      if (message?.role === "user") {
        const userText = message.parts
          .filter(p => p.type === "text")
          .map(p => (p as { text: string }).text)
          .join(" ");

        await createEvent({
          gameId,
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
            // TODO: Use proper tokenizer for accurate cost calculation
            // Current rough estimate (length/4) may underestimate actual token usage
            tokensIn: userText.length / 4,
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
          experimental_activeTools: [],
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
          tools: {},
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
          if (gameId) {
            try {
              const assistantMessages = finishedMessages.filter(m => m.role === "assistant");
              for (const msg of assistantMessages) {
                const assistantText = msg.parts
                  .filter(p => p.type === "text")
                  .map(p => (p as { text: string }).text)
                  .join(" ");

                if (assistantText) {
                   await createEvent({
                     gameId,
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
                       // TODO: Use proper tokenizer for accurate cost calculation
                       // Current rough estimate (length/4) may underestimate actual token usage
                       tokensOut: assistantText.length / 4
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
