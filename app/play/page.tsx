import { cookies } from "next/headers";
import { Suspense } from "react";
import { PlayChat } from "@/components/play/play-chat";
import { DataStreamHandler } from "@/components/data-stream-handler";
import { DEFAULT_CHAT_MODEL } from "@/lib/ai/models";
import { generateUUID } from "@/lib/utils";

export default function PlayPage() {
  return (
    <Suspense fallback={<div className="flex h-dvh" />}>
      <NewGamePage />
    </Suspense>
  );
}

async function NewGamePage() {
  const cookieStore = await cookies();
  const modelIdFromCookie = cookieStore.get("chat-model");
  const id = generateUUID();

  return (
    <>
      <PlayChat
        autoResume={false}
        id={id}
        initialChatModel={modelIdFromCookie?.value ?? DEFAULT_CHAT_MODEL}
        initialMessages={[]}
        initialVisibilityType="private"
        isReadonly={false}
      />
      <DataStreamHandler />
    </>
  );
}

