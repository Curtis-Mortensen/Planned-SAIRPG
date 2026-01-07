"use client";

import { memo } from "react";
import { ContextPanelToggle } from "@/components/play/context-panel-toggle";
import { SaveButton } from "@/components/play/save-button";
import { Button } from "@/components/ui/button";
import { PlusIcon } from "./icons";
import { VisibilitySelector, type VisibilityType } from "./visibility-selector";
import { useGameStore } from "@/lib/stores/game-store";

function PureChatHeader({
  chatId,
  selectedVisibilityType,
  isReadonly,
}: {
  chatId: string;
  selectedVisibilityType: VisibilityType;
  isReadonly: boolean;
}) {
  const setNewGameConfirmDialogOpen = useGameStore((s) => s.setNewGameConfirmDialogOpen);

  return (
    <header className="sticky top-0 flex items-center gap-2 bg-background px-2 py-1.5 md:px-2">
      <ContextPanelToggle />

      <Button
        className="order-2 ml-auto h-8 px-2 md:order-1 md:ml-0 md:h-fit md:px-2"
        onClick={() => {
          // Show confirmation dialog (we're already on a play page with a chatId)
          setNewGameConfirmDialogOpen(true);
        }}
        variant="outline"
      >
        <PlusIcon />
        <span>New Game</span>
      </Button>

      {!isReadonly && (
        <VisibilitySelector
          chatId={chatId}
          className="order-1 md:order-2"
          selectedVisibilityType={selectedVisibilityType}
        />
      )}

      {!isReadonly && (
        <div className="order-3 ml-auto hidden md:flex">
          <SaveButton chatId={chatId} />
        </div>
      )}
    </header>
  );
}

export const ChatHeader = memo(PureChatHeader, (prevProps, nextProps) => {
  return (
    prevProps.chatId === nextProps.chatId &&
    prevProps.selectedVisibilityType === nextProps.selectedVisibilityType &&
    prevProps.isReadonly === nextProps.isReadonly
  );
});
