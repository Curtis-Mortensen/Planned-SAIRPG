import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/app/(auth)/auth";
import { PlayChat } from "@/components/play/play-chat";
import { DataStreamHandler } from "@/components/data-stream-handler";
import { DEFAULT_CHAT_MODEL } from "@/lib/ai/models";
import { getChatById, getMessagesByChatId, getPromptByModule, getGameByChatId, setActiveGame, createGame, createEvent, saveChat, getUserById } from "@/lib/db/queries";
import { convertToUIMessages, generateUUID } from "@/lib/utils";
import { createSystemMessage } from "@/lib/system-messages";
import type { ChatMessage } from "@/lib/types";
import { asNarratorSettings } from "@/lib/types";

export default function PlaySessionPage(props: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<div className="flex h-dvh" />}>
      <GameSessionPage params={props.params} />
    </Suspense>
  );
}

async function GameSessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const chat = await getChatById({ id });

  const session = await auth();

  if (!session) {
    redirect("/api/auth/guest");
  }

  // Verify user exists in database (handles stale session after DB reset)
  const existingUser = await getUserById(session.user.id);
  if (!existingUser) {
    // User ID from session doesn't exist in database - force re-authentication
    redirect("/api/auth/guest?force=true");
  }

  // Check if this is a new game (no chat OR chat exists but has no messages)
  // This handles the case where createGameAction creates an empty chat
  const messagesFromDb = chat ? await getMessagesByChatId({ id }) : [];
  const isNewGame = !chat || messagesFromDb.length === 0;

  // Load or create game
  let game = null;
  if (session?.user) {
    game = await getGameByChatId(id);
    if (!game) {
      if (!chat) {
        await saveChat({
          id,
          userId: session.user.id,
          title: "New Adventure",
          visibility: "private",
        });
      }
      game = await createGame({
        userId: session.user.id,
        title: chat?.title || "New Adventure",
        chatId: id,
      });
    } else if (!game.isActive) {
      await setActiveGame({
        userId: session.user.id,
        gameId: game.id,
      });
    }
  }

  if (isNewGame) {
    const cookieStore = await cookies();
    const chatModelFromCookie = cookieStore.get("chat-model");

    // Fetch the opening scene and lore from narrator prompt
    let initialMessages: ChatMessage[] = [];
    try {
      const narratorPrompt = await getPromptByModule("narrator");
      const narratorSettings = asNarratorSettings(narratorPrompt?.settings);
      let openingSceneText = "";
      let hasLore = false;
      
      if (narratorSettings.openingScene) {
        openingSceneText = narratorSettings.openingScene;
      } else {
        // Fallback to default if not in DB
        const { NARRATOR_DEFAULT_SETTINGS } = await import("@/lib/db/prompts/narrator-default");
        openingSceneText = NARRATOR_DEFAULT_SETTINGS.openingScene || "";
      }
      
      // Check if lore exists
      let loreText = "";
      if (narratorSettings.lore) {
        hasLore = true;
        loreText = narratorSettings.lore;
      } else {
        // Check default lore
        const { NARRATOR_DEFAULT_LORE } = await import("@/lib/db/prompts/narrator-default");
        hasLore = Boolean(NARRATOR_DEFAULT_LORE);
        loreText = NARRATOR_DEFAULT_LORE || "";
      }

      // Build initial messages: system message first (if lore exists), then opening scene
      if (hasLore) {
        initialMessages.push(createSystemMessage("world_lore_loaded"));
        
        // Log lore loading event if game exists
        if (game) {
          try {
            await createEvent({
              gameId: game.id,
              sequenceNum: Date.now().toString(),
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
            // Log error but don't fail the page render
            console.error("Failed to log lore loaded event:", error);
          }
        }
      }
      
      if (openingSceneText) {
        initialMessages.push({
          id: generateUUID(),
          role: "assistant",
          parts: [
            {
              type: "text",
              text: openingSceneText,
            },
          ],
          metadata: {
            createdAt: new Date().toISOString(),
          },
        });
      }
    } catch (error) {
      console.error("Failed to fetch opening scene:", error);
      // Continue with empty messages if fetch fails
    }

    return (
      <>
        <PlayChat
          autoResume={false}
          id={id}
          gameId={game?.id ?? ""}
          initialChatModel={chatModelFromCookie?.value ?? DEFAULT_CHAT_MODEL}
          initialMessages={initialMessages}
          initialVisibilityType="private"
          isReadonly={false}
        />
        <DataStreamHandler />
      </>
    );
  }

  // Existing chat with messages - verify access
  if (chat.visibility === "private") {
    if (!session.user) {
      return notFound();
    }

    if (session.user.id !== chat.userId) {
      return notFound();
    }
  }

  const uiMessages = convertToUIMessages(messagesFromDb);

  const cookieStore = await cookies();
  const chatModelFromCookie = cookieStore.get("chat-model");

  return (
    <>
      <PlayChat
        autoResume={true}
        id={chat.id}
        gameId={game?.id ?? ""}
        initialChatModel={chatModelFromCookie?.value ?? DEFAULT_CHAT_MODEL}
        initialMessages={uiMessages}
        initialVisibilityType={chat.visibility}
        isReadonly={session?.user?.id !== chat.userId}
      />
      <DataStreamHandler />
    </>
  );
}

