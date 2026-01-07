"use client";

import { useState, useEffect } from "react";
import { mutate } from "swr";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSessionStatsAction } from "@/app/actions/turns";
import { saveGameAction } from "@/app/actions/saves";
import { toast } from "@/components/toast";

interface SaveDialogProps {
  chatId: string;
}

export function SaveDialog({ chatId }: SaveDialogProps) {
  const saveDialogOpen = useGameStore((s) => s.saveDialogOpen);
  const setSaveDialogOpen = useGameStore((s) => s.setSaveDialogOpen);
  const [saveName, setSaveName] = useState("");
  const [currentTurnNumber, setCurrentTurnNumber] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

  // Fetch current turn number when dialog opens
  useEffect(() => {
    if (saveDialogOpen) {
      getSessionStatsAction(chatId).then((stats) => {
        setCurrentTurnNumber(stats.turnNumber);
        setSaveName(`Turn ${stats.turnNumber}`);
      });
    } else {
      // Reset when dialog closes
      setSaveName("");
      setCurrentTurnNumber(0);
    }
  }, [saveDialogOpen, chatId]);

  const handleSave = async () => {
    if (isSaving) return;

    setIsSaving(true);
    try {
      const result = await saveGameAction({
        chatId,
        name: saveName.trim() || undefined,
      });

      if (result.success) {
        // Invalidate the saves cache to immediately refresh the saves view
        mutate(["saves", chatId]);
        
        toast({
          type: "success",
          description: "Game saved successfully",
        });
        setSaveDialogOpen(false);
      } else {
        toast({
          type: "error",
          description: result.error ?? "Failed to save game",
        });
      }
    } catch (error) {
      toast({
        type: "error",
        description: error instanceof Error ? error.message : "Failed to save game",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog
      open={saveDialogOpen}
      onOpenChange={setSaveDialogOpen}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save Game</DialogTitle>
          <DialogDescription>
            Save your current progress to return to later.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="save-name">Save Name</Label>
            <Input
              id="save-name"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="Enter save name (optional)"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isSaving) {
                  handleSave();
                }
              }}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={() => setSaveDialogOpen(false)}
            variant="outline"
            type="button"
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving}
            type="button"
          >
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

