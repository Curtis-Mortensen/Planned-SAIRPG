"use client";

import { Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGameStore } from "@/lib/stores/game-store";

interface NewGameButtonProps {
  className?: string;
  size?: "default" | "sm" | "lg" | "icon";
}

export function NewGameButton({ className, size = "lg" }: NewGameButtonProps) {
  const currentChatId = useGameStore((s) => s.currentChatId);
  const setNewGameConfirmDialogOpen = useGameStore((s) => s.setNewGameConfirmDialogOpen);

  const handleNewGame = () => {
    // If there's an active game session, show confirmation dialog
    if (currentChatId) {
      setNewGameConfirmDialogOpen(true);
    } else {
      // No active game, just start new one directly
      localStorage.removeItem("input");
      document.cookie = "last-play-id=; path=/; max-age=0";
      window.location.href = "/play?new=true";
    }
  };

  return (
    <Button className={className} onClick={handleNewGame} size={size}>
      <Globe className="mr-2 size-5" />
      Start a New Game
    </Button>
  );
}

