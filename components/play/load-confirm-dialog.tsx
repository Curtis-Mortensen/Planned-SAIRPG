"use client";

import { useState, useEffect } from "react";
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
import { prepareSaveLoadAction, loadSaveAction } from "@/app/actions/saves";
import { getSessionStatsAction } from "@/app/actions/turns";
import { toast } from "@/components/toast";
import { useRouter } from "next/navigation";

interface LoadConfirmDialogProps {
  chatId: string;
}

export function LoadConfirmDialog({ chatId }: LoadConfirmDialogProps) {
  const router = useRouter();
  const loadConfirmDialogOpen = useGameStore((s) => s.loadConfirmDialogOpen);
  const setLoadConfirmDialogOpen = useGameStore(
    (s) => s.setLoadConfirmDialogOpen
  );
  const pendingLoadSaveId = useGameStore((s) => s.pendingLoadSaveId);
  const setPendingLoadSaveId = useGameStore((s) => s.setPendingLoadSaveId);
  const [loadData, setLoadData] = useState<{
    saveName: string;
    saveTurnNumber: number;
    currentTurnNumber: number;
    willLoseProgress: boolean;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch load data when dialog opens
  useEffect(() => {
    if (loadConfirmDialogOpen && pendingLoadSaveId) {
      Promise.all([
        prepareSaveLoadAction(pendingLoadSaveId),
        getSessionStatsAction(chatId),
      ])
        .then(([prepareResult, stats]) => {
          setLoadData({
            saveName: prepareResult.save.name,
            saveTurnNumber: Number.parseInt(prepareResult.save.turnNumber, 10),
            currentTurnNumber: stats.turnNumber,
            willLoseProgress: prepareResult.willLoseProgress,
          });
        })
        .catch((error) => {
          console.error("Failed to prepare load:", error);
          toast({
            type: "error",
            description: "Failed to prepare save load",
          });
          setLoadConfirmDialogOpen(false);
        });
    } else {
      setLoadData(null);
    }
  }, [loadConfirmDialogOpen, pendingLoadSaveId, chatId, setLoadConfirmDialogOpen]);

  const handleLoad = async (saveCurrentFirst: boolean) => {
    if (!pendingLoadSaveId || isLoading) return;

    setIsLoading(true);
    try {
      const result = await loadSaveAction({
        saveId: pendingLoadSaveId,
        saveCurrentFirst,
        currentSaveName: saveCurrentFirst
          ? `Turn ${loadData?.currentTurnNumber ?? 0}`
          : undefined,
      });

      if (result.success) {
        toast({
          type: "success",
          description: "Game loaded successfully",
        });
        setLoadConfirmDialogOpen(false);
        setPendingLoadSaveId(null);
        // Navigate to new chatId if provided
        if (result.newChatId) {
          router.push(`/play/${result.newChatId}`);
        } else {
          // Fallback to refresh if no newChatId
          router.refresh();
        }
      } else {
        toast({
          type: "error",
          description: result.error ?? "Failed to load game",
        });
      }
    } catch (error) {
      toast({
        type: "error",
        description: error instanceof Error ? error.message : "Failed to load game",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setLoadConfirmDialogOpen(false);
    setPendingLoadSaveId(null);
  };

  if (!loadData) {
    return null;
  }

  return (
    <Dialog
      open={loadConfirmDialogOpen}
      onOpenChange={setLoadConfirmDialogOpen}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Load Save?</DialogTitle>
          <DialogDescription>
            Loading &quot;{loadData.saveName}&quot; will revert to turn{" "}
            {loadData.saveTurnNumber}. Current progress (turn{" "}
            {loadData.currentTurnNumber}) will be lost unless saved.
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
            onClick={() => handleLoad(false)}
            variant="outline"
            type="button"
            disabled={isLoading}
            className="w-full sm:w-auto"
          >
            Load Without Saving
          </Button>
          <Button
            onClick={() => handleLoad(true)}
            disabled={isLoading}
            type="button"
            className="w-full sm:w-auto"
          >
            {isLoading ? "Loading..." : "Save & Load"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

