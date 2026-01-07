"use client";

import { useState, useEffect, useCallback } from "react";
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
import { toast } from "@/components/toast";

interface NavigateHomeConfirmDialogProps {
  chatId?: string;
}

export function NavigateHomeConfirmDialog({ chatId }: NavigateHomeConfirmDialogProps) {
  const currentChatId = useGameStore((s) => s.currentChatId);
  // Use prop chatId if provided, otherwise fall back to store's currentChatId
  const activeChatId = chatId ?? currentChatId;
  const navigateHomeConfirmDialogOpen = useGameStore((s) => s.navigateHomeConfirmDialogOpen);
  const setNavigateHomeConfirmDialogOpen = useGameStore((s) => s.setNavigateHomeConfirmDialogOpen);
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingSaveState, setIsCheckingSaveState] = useState(false);
  const [isAlreadySaved, setIsAlreadySaved] = useState(false);

  const navigateHome = useCallback(() => {
    // Use window.location for reliable navigation
    window.location.href = "/";
  }, []);

  // Check if current state is already saved when dialog opens
  useEffect(() => {
    if (navigateHomeConfirmDialogOpen && activeChatId) {
      setIsCheckingSaveState(true);
      isCurrentStateSavedAction(activeChatId)
        .then((isSaved) => {
          setIsAlreadySaved(isSaved);
          // If already saved, skip the dialog and navigate home directly
          if (isSaved) {
            setNavigateHomeConfirmDialogOpen(false);
            navigateHome();
          }
        })
        .finally(() => {
          setIsCheckingSaveState(false);
        });
    }
  }, [navigateHomeConfirmDialogOpen, activeChatId, setNavigateHomeConfirmDialogOpen, navigateHome]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!navigateHomeConfirmDialogOpen) {
      setIsLoading(false);
      setIsAlreadySaved(false);
    }
  }, [navigateHomeConfirmDialogOpen]);

  const handleDiscard = () => {
    setNavigateHomeConfirmDialogOpen(false);
    navigateHome();
  };

  const handleSaveAndNavigate = async () => {
    if (!activeChatId) {
      // No active chat, just navigate home
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
        setNavigateHomeConfirmDialogOpen(false);
        navigateHome();
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
    setNavigateHomeConfirmDialogOpen(false);
  };

  // Don't show dialog while checking if already saved (prevents brief flash)
  if (isCheckingSaveState || isAlreadySaved) {
    return null;
  }

  return (
    <Dialog
      open={navigateHomeConfirmDialogOpen}
      onOpenChange={setNavigateHomeConfirmDialogOpen}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Navigate to Home?</DialogTitle>
          <DialogDescription>
            You currently have an open game session. Would you like to save your
            progress before navigating to the home page?
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
            Discard & Go Home
          </Button>
          <Button
            onClick={handleSaveAndNavigate}
            disabled={isLoading || !activeChatId}
            type="button"
            className="w-full sm:w-auto"
          >
            {isLoading ? "Saving..." : "Save & Go Home"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

