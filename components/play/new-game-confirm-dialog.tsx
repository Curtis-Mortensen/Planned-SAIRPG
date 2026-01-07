"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useGameStore } from "@/lib/stores/game-store";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { saveGameAction, isCurrentStateSavedAction } from "@/app/actions/saves";
import { createGameAction } from "@/app/actions/games";
import { toast } from "@/components/toast";

interface NewGameConfirmDialogProps {
  chatId?: string;
}

export function NewGameConfirmDialog({ chatId }: NewGameConfirmDialogProps) {
  const currentChatId = useGameStore((s) => s.currentChatId);
  // Use prop chatId if provided, otherwise fall back to store's currentChatId
  const activeChatId = chatId ?? currentChatId;
  const router = useRouter();
  const newGameConfirmDialogOpen = useGameStore((s) => s.newGameConfirmDialogOpen);
  const setNewGameConfirmDialogOpen = useGameStore((s) => s.setNewGameConfirmDialogOpen);
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingSaveState, setIsCheckingSaveState] = useState(false);
  const [isAlreadySaved, setIsAlreadySaved] = useState(false);

  const startNewGame = useCallback(async () => {
    setIsLoading(true);
    try {
      // Create new game via createGameAction
      const result = await createGameAction({});
      if (result.success && result.chatId) {
        // Clear cached input for fresh start
        localStorage.removeItem("input");
        // Clear last-play-id cookie to prevent cycling
        document.cookie = "last-play-id=; path=/; max-age=0";
        // Navigate to new game's chat
        router.push(`/play/${result.chatId}`);
      } else {
        toast({
          type: "error",
          description: result.error || "Failed to create new game",
        });
        setIsLoading(false);
      }
    } catch (error) {
      toast({
        type: "error",
        description: error instanceof Error ? error.message : "Failed to create new game",
      });
      setIsLoading(false);
    }
  }, [router]);

  // Check if current state is already saved when dialog opens
  useEffect(() => {
    if (newGameConfirmDialogOpen && activeChatId) {
      setIsCheckingSaveState(true);
      isCurrentStateSavedAction(activeChatId)
        .then((isSaved) => {
          setIsAlreadySaved(isSaved);
          // If already saved, skip the dialog and start new game directly
          if (isSaved) {
            setNewGameConfirmDialogOpen(false);
            startNewGame();
          }
        })
        .finally(() => {
          setIsCheckingSaveState(false);
        });
    }
  }, [newGameConfirmDialogOpen, activeChatId, setNewGameConfirmDialogOpen, startNewGame]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!newGameConfirmDialogOpen) {
      setIsLoading(false);
      setIsAlreadySaved(false);
    }
  }, [newGameConfirmDialogOpen]);

  const handleDiscard = async () => {
    setNewGameConfirmDialogOpen(false);
    await startNewGame();
  };

  const handleSaveAndStart = async () => {
    if (!activeChatId) {
      // No active chat, just start new game
      handleDiscard();
      return;
    }

    setIsLoading(true);
    try {
      const result = await saveGameAction({
        chatId: activeChatId,
      });
      if (result.success) {
        toast({
          type: "success",
          description: "Game saved successfully",
        });
        setNewGameConfirmDialogOpen(false);
        await startNewGame();
      } else {
        toast({
          type: "error",
          description: result.error ?? "Failed to save game",
        });
        setIsLoading(false);
      }
    } catch (error) {
      toast({
        type: "error",
        description: error instanceof Error ? error.message : "Failed to save game",
      });
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setNewGameConfirmDialogOpen(false);
  };

  // Don't show dialog while checking if already saved (prevents brief flash)
  if (isCheckingSaveState || isAlreadySaved) {
    return null;
  }

  return (
    <Dialog
      open={newGameConfirmDialogOpen}
      onOpenChange={setNewGameConfirmDialogOpen}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start New Game?</DialogTitle>
          <DialogDescription>
            Starting a new game will end your current session. Would you like to
            save your progress first?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button
            onClick={handleCancel}
            variant="outline"
            type="button"
            disabled={isLoading}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            onClick={handleDiscard}
            variant="outline"
            type="button"
            disabled={isLoading}
            className="w-full sm:w-auto"
          >
            Discard & Start New
          </Button>
          <Button
            onClick={handleSaveAndStart}
            disabled={isLoading || !activeChatId}
            type="button"
            className="w-full sm:w-auto"
          >
            {isLoading ? "Saving..." : "Save & Start New"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

