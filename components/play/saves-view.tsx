"use client";

import { useState, useRef, useEffect } from "react";
import useSWR from "swr";
import { Trash2, Clock, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSavesAction, deleteSaveAction, updateSaveNameAction } from "@/app/actions/saves";
import { useGameStore } from "@/lib/stores/game-store";
import { toast } from "@/components/toast";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface SavesViewProps {
  chatId: string;
}

export function SavesView({ chatId }: SavesViewProps) {
  const setLoadConfirmDialogOpen = useGameStore(
    (s) => s.setLoadConfirmDialogOpen
  );
  const setPendingLoadSaveId = useGameStore((s) => s.setPendingLoadSaveId);

  const { data: saves, mutate } = useSWR(
    ["saves", chatId],
    ([_, id]) => getSavesAction(id),
    {
      refreshInterval: 10000, // Refresh every 10 seconds
    }
  );

  const [editingSaveId, setEditingSaveId] = useState<string | null>(null);
  const [editName, setEditName] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleLoadClick = (saveId: string) => {
    setPendingLoadSaveId(saveId);
    setLoadConfirmDialogOpen(true);
  };

  const handleDelete = async (saveId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (
      !confirm("Are you sure you want to delete this save? This cannot be undone.")
    ) {
      return;
    }

    try {
      const result = await deleteSaveAction(saveId);
      if (result.success) {
        toast({
          type: "success",
          description: "Save deleted successfully",
        });
        mutate();
      } else {
        toast({
          type: "error",
          description: "Failed to delete save",
        });
      }
    } catch (error) {
      toast({
        type: "error",
        description: error instanceof Error ? error.message : "Failed to delete save",
      });
    }
  };

  const handleEdit = (saveId: string, currentName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingSaveId(saveId);
    setEditName(currentName);
  };

  const handleCancelEdit = () => {
    setEditingSaveId(null);
    setEditName("");
  };

  const handleSaveEdit = async (saveId: string) => {
    if (!editName.trim()) {
      toast({
        type: "error",
        description: "Save name cannot be empty",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await updateSaveNameAction({
        saveId,
        name: editName.trim(),
      });
      if (result.success) {
        toast({
          type: "success",
          description: "Save name updated successfully",
        });
        setEditingSaveId(null);
        setEditName("");
        mutate();
      } else {
        toast({
          type: "error",
          description: result.error || "Failed to update save name",
        });
      }
    } catch (error) {
      toast({
        type: "error",
        description: error instanceof Error ? error.message : "Failed to update save name",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Focus input when editing starts
  useEffect(() => {
    if (editingSaveId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingSaveId]);

  if (!saves || saves.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-sm text-muted-foreground">No saves yet</p>
        <p className="mt-2 text-xs text-muted-foreground">
          Save your game to return to it later
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {saves.map((save) => (
        <div
          key={save.id}
          role="button"
          tabIndex={0}
          onClick={() => {
            if (editingSaveId !== save.id) {
              handleLoadClick(save.id);
            }
          }}
          onKeyDown={(e) => {
            if (editingSaveId !== save.id && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault();
              handleLoadClick(save.id);
            }
          }}
          className={cn(
            "group flex w-full cursor-pointer items-center justify-between rounded-lg border p-3 text-left transition-colors",
            "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            editingSaveId === save.id && "cursor-default"
          )}
        >
          <div className="flex-1 min-w-0">
            {editingSaveId === save.id ? (
              <div className="flex flex-col gap-2">
                <Input
                  ref={inputRef}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleSaveEdit(save.id);
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      handleCancelEdit();
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="h-8 text-sm"
                  disabled={isSubmitting}
                />
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCancelEdit();
                    }}
                    disabled={isSubmitting}
                    type="button"
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSaveEdit(save.id);
                    }}
                    disabled={isSubmitting}
                    type="button"
                  >
                    {isSubmitting ? "Saving..." : "Save"}
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="group/name flex items-center gap-1.5">
                  <span className="truncate font-medium text-sm">{save.name}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 opacity-0 transition-opacity group-hover/name:opacity-100"
                    onClick={(e) => handleEdit(save.id, save.name, e)}
                    type="button"
                  >
                    <Pencil
                      aria-hidden="true"
                      className="size-3"
                    />
                    <span className="sr-only">Edit save name</span>
                  </Button>
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Turn {save.turnNumber}</span>
                  <span>•</span>
                  <div className="flex items-center gap-1">
                    <Clock className="size-3" />
                    <span>
                      {format(new Date(save.createdAt), "MMM d, yyyy • h:mm a")}
                    </span>
                  </div>
                </div>
                {save.description && (
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {save.description}
                  </p>
                )}
              </>
            )}
          </div>
          {editingSaveId !== save.id && (
            <div className="ml-2 flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={(e) => handleDelete(save.id, e)}
                type="button"
              >
                <Trash2
                  aria-hidden="true"
                  className="size-4"
                />
                <span className="sr-only">Delete save</span>
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

