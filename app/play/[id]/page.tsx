import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/app/(auth)/auth";
import { PlayChat } from "@/components/play/play-chat";
import { DataStreamHandler } from "@/components/data-stream-handler";
import { DEFAULT_CHAT_MODEL } from "@/lib/ai/models";
import { getChatById, getMessagesByChatId, getPromptByModule } from "@/lib/db/queries";
import { convertToUIMessages, generateUUID } from "@/lib/utils";
import type { ChatMessage } from "@/lib/types";

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

  // If no chat exists, render a new game with opening scene
  if (!chat) {
    const cookieStore = await cookies();
    const chatModelFromCookie = cookieStore.get("chat-model");

    // Fetch the opening scene from narrator prompt
    let initialMessages: ChatMessage[] = [];
    try {
      const narratorPrompt = await getPromptByModule("narrator");
      let openingSceneText = "";
      
      if (narratorPrompt?.settings?.openingScene) {
        openingSceneText = narratorPrompt.settings.openingScene as string;
      } else {
        // Fallback to default if not in DB
        const { NARRATOR_DEFAULT_SETTINGS } = await import("@/lib/db/prompts/narrator-default");
        openingSceneText = NARRATOR_DEFAULT_SETTINGS.openingScene || "";
      }

      // Create initial assistant message with opening scene if we have one
      if (openingSceneText) {
        initialMessages = [
          {
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
          },
        ];
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
          initialChatModel={chatModelFromCookie?.value ?? DEFAULT_CHAT_MODEL}
          initialMessages={initialMessages}
          initialVisibilityType="private"
          isReadonly={false}
        />
        <DataStreamHandler />
      </>
    );
  }

  if (chat.visibility === "private") {
    if (!session.user) {
      return notFound();
    }

    if (session.user.id !== chat.userId) {
      return notFound();
    }
  }

  const messagesFromDb = await getMessagesByChatId({ id });
  const uiMessages = convertToUIMessages(messagesFromDb);

  const cookieStore = await cookies();
  const chatModelFromCookie = cookieStore.get("chat-model");

  return (
    <>
      <PlayChat
        autoResume={true}
        id={chat.id}
        initialChatModel={chatModelFromCookie?.value ?? DEFAULT_CHAT_MODEL}
        initialMessages={uiMessages}
        initialVisibilityType={chat.visibility}
        isReadonly={session?.user?.id !== chat.userId}
      />
      <DataStreamHandler />
    </>
  );
}

