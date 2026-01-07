"use client";

import { Chat } from "@/components/chat";
import { useEffect, useState } from "react";
import type { ChatMessage } from "@/lib/types";
import type { VisibilityType } from "@/components/visibility-selector";
import { ContextPanel } from "./context-panel";
import { useGameStore } from "@/lib/stores/game-store";
import { useGamePhase } from "@/hooks/use-game-phase";
import { MetaEventReview } from "./meta-event-review";

interface PlayChatProps {
  id: string;
  gameId: string;
  initialMessages: ChatMessage[];
  initialChatModel: string;
  initialVisibilityType: VisibilityType;
  isReadonly: boolean;
  autoResume: boolean;
}

export function PlayChat({
  id,
  gameId,
  initialMessages,
  initialChatModel,
  initialVisibilityType,
  isReadonly,
  autoResume,
}: PlayChatProps) {
  const setCurrentChatId = useGameStore((s) => s.setCurrentChatId);

  const { currentPhase, pendingActionId, originalInput, refetch } = useGamePhase({
    gameId: gameId,
  });

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
      <div className="relative flex flex-col h-full overflow-hidden">
        <Chat
          autoResume={autoResume}
          id={id}
          initialChatModel={initialChatModel}
          initialMessages={initialMessages}
          initialVisibilityType={initialVisibilityType}
          isReadonly={isReadonly}
        />

        {/* Meta Event Review Overlay */}
        {currentPhase === "meta_review" && pendingActionId && (
          <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm overflow-auto">
            <div className="max-w-2xl w-full">
              <MetaEventReview
                pendingActionId={pendingActionId}
                originalInput={originalInput ?? "your action"}
                onComplete={() => {
                  refetch();
                }}
              />
            </div>
          </div>
        )}
      </div>
    </ContextPanel>
  );
}
