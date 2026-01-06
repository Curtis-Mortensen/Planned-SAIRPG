"use client";

import { Chat } from "@/components/chat";
import type { ChatMessage, VisibilityType } from "@/lib/types";
import { ContextSidebar } from "./context-sidebar";

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
    <ContextSidebar chatId={id}>
      <Chat
        autoResume={autoResume}
        id={id}
        initialChatModel={initialChatModel}
        initialMessages={initialMessages}
        initialVisibilityType={initialVisibilityType}
        isReadonly={isReadonly}
      />
    </ContextSidebar>
  );
}

