"use client";

import { Chat } from "@/components/chat";
import { useEffect } from "react";
import type { ChatMessage } from "@/lib/types";
import type { VisibilityType } from "@/components/visibility-selector";
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
  useEffect(() => {
    document.cookie = `last-play-id=${id}; path=/`;
  }, [id]);

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
