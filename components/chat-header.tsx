"use client";

import { useRouter } from "next/navigation";
import { memo } from "react";
import { ContextPanelToggle } from "@/components/play/context-panel-toggle";
import { Button } from "@/components/ui/button";
import { PlusIcon } from "./icons";
import { VisibilitySelector, type VisibilityType } from "./visibility-selector";

function PureChatHeader({
  chatId,
  selectedVisibilityType,
  isReadonly,
}: {
  chatId: string;
  selectedVisibilityType: VisibilityType;
  isReadonly: boolean;
}) {
  const router = useRouter();

  return (
    <header className="sticky top-0 flex items-center gap-2 bg-background px-2 py-1.5 md:px-2">
      <ContextPanelToggle />

      <Button
        className="order-2 ml-auto h-8 px-2 md:order-1 md:ml-0 md:h-fit md:px-2"
        onClick={() => {
          // Clear cached input for fresh start
          localStorage.removeItem("input");
          // Clear last-play-id cookie
          document.cookie = "last-play-id=; path=/; max-age=0";
          router.push("/play?new=true");
          router.refresh();
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
