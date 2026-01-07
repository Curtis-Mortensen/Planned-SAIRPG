"use client";

import { Chat } from "@/components/chat";
import { useEffect } from "react";
import type { ChatMessage } from "@/lib/types";
import type { VisibilityType } from "@/components/visibility-selector";
import { ContextPanel } from "./context-panel";
import { useGameStore } from "@/lib/stores/game-store";

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
  const setCurrentChatId = useGameStore((s) => s.setCurrentChatId);

  useEffect(() => {
    document.cookie = `last-play-id=${id}; path=/`;
    setCurrentChatId(id);

    // Clear currentChatId when unmounting (leaving play page)
    return () => {
      setCurrentChatId(null);
    };
  }, [id, setCurrentChatId]);

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
