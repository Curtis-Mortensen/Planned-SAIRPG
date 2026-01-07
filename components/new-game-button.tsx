"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Globe, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGameStore } from "@/lib/stores/game-store";
import { createGameAction } from "@/app/actions/games";
import { toast } from "@/components/toast";

interface NewGameButtonProps {
  className?: string;
  size?: "default" | "sm" | "lg" | "icon";
}

export function NewGameButton({ className, size = "lg" }: NewGameButtonProps) {
  const router = useRouter();
  const currentChatId = useGameStore((s) => s.currentChatId);
  const setNewGameConfirmDialogOpen = useGameStore((s) => s.setNewGameConfirmDialogOpen);
  const [isCreating, setIsCreating] = useState(false);

  const startNewGame = useCallback(async () => {
    setIsCreating(true);
    try {
      // Create game first via server action (handles auth internally)
      const result = await createGameAction({});
      if (result.success && result.chatId) {
        // Clear cached input for fresh start
        localStorage.removeItem("input");
        // Clear last-play-id cookie to prevent cycling
        document.cookie = "last-play-id=; path=/; max-age=0";
        // Navigate to new game's chat
        router.push(`/play/${result.chatId}`);
      } else if (result.error === "Unauthorized") {
        // User not authenticated, redirect to guest auth flow then back to play
        router.push("/api/auth/guest?redirectUrl=/play?new=true");
      } else {
        toast({
          type: "error",
          description: result.error || "Failed to create new game",
        });
        setIsCreating(false);
      }
    } catch (error) {
      // Network error - might not be authenticated, try guest flow
      router.push("/api/auth/guest?redirectUrl=/play?new=true");
    }
  }, [router]);

  const handleNewGame = () => {
    // If there's an active game session, show confirmation dialog
    if (currentChatId) {
      setNewGameConfirmDialogOpen(true);
    } else {
      // No active game, create new one directly via server action
      startNewGame();
    }
  };

  return (
    <Button className={className} onClick={handleNewGame} size={size} disabled={isCreating}>
      {isCreating ? (
        <Loader2 className="mr-2 size-5 animate-spin" />
      ) : (
        <Globe className="mr-2 size-5" />
      )}
      {isCreating ? "Creating..." : "Start a New Game"}
    </Button>
  );
}

