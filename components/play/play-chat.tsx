"use client";

import { Chat } from "@/components/chat";
import type { ChatMessage, VisibilityType } from "@/lib/types";
import { ContextPanel } from "./context-panel";

interface PlayChatProps {
  id: string;
  initialMessages: ChatMessage[];
  initialChatModel: string;
  initialVisibilityType: VisibilityType;
  isReadonly: boolean;
  autoResume: boolean;
}

export function PlayChat({
  id,
  initialMessages,
  initialChatModel,
  initialVisibilityType,
  isReadonly,
  autoResume,
}: PlayChatProps) {
  return (
    <ContextPanel chatId={id}>
      <Chat
        autoResume={autoResume}
        id={id}
        initialChatModel={initialChatModel}
        initialMessages={initialMessages}
        initialVisibilityType={initialVisibilityType}
        isReadonly={isReadonly}
      />
    </ContextPanel>
  );
}
