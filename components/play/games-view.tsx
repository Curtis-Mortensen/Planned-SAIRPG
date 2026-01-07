"use client";

import { useState, useRef, useEffect } from "react";
import useSWR from "swr";
import { Trash2, Clock, Pencil, Globe, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getGamesAction,
  deleteGameAction,
  renameGameAction,
  loadGameAction,
} from "@/app/actions/games";
import { useGameStore } from "@/lib/stores/game-store";
import { toast } from "@/components/toast";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";

interface GamesViewProps {
  currentGameId?: string;
}

export function GamesView({ currentGameId }: GamesViewProps) {
  const router = useRouter();
  const setContextPaneOpen = useGameStore((s) => s.setContextPaneOpen);

  const { data: games, mutate } = useSWR(
    "games",
    () => getGamesAction(),
    {
      refreshInterval: 10000, // Refresh every 10 seconds
    }
  );

  const [editingGameId, setEditingGameId] = useState<string | null>(null);
  const [editName, setEditName] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleLoad = async (gameId: string, chatId: string | null) => {
    if (!chatId) {
      toast({
        type: "error",
        description: "Game has no active chat",
      });
      return;
    }

    try {
      const result = await loadGameAction({ gameId });
      if (result.success && result.chatId) {
        router.push(`/play/${result.chatId}`);
        setContextPaneOpen(false);
      } else {
        toast({
          type: "error",
          description: result.error || "Failed to load game",
        });
      }
    } catch (error) {
      toast({
        type: "error",
        description: error instanceof Error ? error.message : "Failed to load game",
      });
    }
  };

  const handleDelete = async (gameId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (
      !confirm("Are you sure you want to delete this game? This will delete all saves and cannot be undone.")
    ) {
      return;
    }

    try {
      const result = await deleteGameAction({ gameId });
      if (result.success) {
        toast({
          type: "success",
          description: "Game deleted successfully",
        });
        mutate();
      } else {
        toast({
          type: "error",
          description: result.error || "Failed to delete game",
        });
      }
    } catch (error) {
      toast({
        type: "error",
        description: error instanceof Error ? error.message : "Failed to delete game",
      });
    }
  };

  const handleEdit = (gameId: string, currentName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingGameId(gameId);
    setEditName(currentName);
  };

  const handleCancelEdit = () => {
    setEditingGameId(null);
    setEditName("");
  };

  const handleSaveEdit = async (gameId: string) => {
    if (!editName.trim()) {
      toast({
        type: "error",
        description: "Game name cannot be empty",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await renameGameAction({
        gameId,
        title: editName.trim(),
      });
      if (result.success) {
        toast({
          type: "success",
          description: "Game name updated successfully",
        });
        setEditingGameId(null);
        setEditName("");
        mutate();
      } else {
        toast({
          type: "error",
          description: result.error || "Failed to update game name",
        });
      }
    } catch (error) {
      toast({
        type: "error",
        description: error instanceof Error ? error.message : "Failed to update game name",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Focus input when editing starts
  useEffect(() => {
    if (editingGameId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingGameId]);

  if (!games || games.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Globe className="size-12 text-muted-foreground mb-4" />
        <p className="text-sm text-muted-foreground">No games yet</p>
        <p className="mt-2 text-xs text-muted-foreground">
          Create a new game to start an adventure
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {games.map((game) => (
        <div
          key={game.id}
          role="button"
          tabIndex={0}
          onClick={() => {
            if (editingGameId !== game.id && game.chatId) {
              handleLoad(game.id, game.chatId);
            }
          }}
          onKeyDown={(e) => {
            if (editingGameId !== game.id && game.chatId && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault();
              handleLoad(game.id, game.chatId);
            }
          }}
          className={cn(
            "group flex w-full cursor-pointer items-center justify-between rounded-lg border p-3 text-left transition-colors",
            "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            editingGameId === game.id && "cursor-default",
            currentGameId === game.id && "ring-2 ring-primary"
          )}
        >
          <div className="flex-1 min-w-0">
            {editingGameId === game.id ? (
              <div className="flex flex-col gap-2">
                <Input
                  ref={inputRef}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleSaveEdit(game.id);
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
                      handleSaveEdit(game.id);
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
                  <span className="truncate font-medium text-sm">{game.title}</span>
                  {currentGameId === game.id && (
                    <span className="text-xs text-muted-foreground">(Active)</span>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 opacity-0 transition-opacity group-hover/name:opacity-100"
                    onClick={(e) => handleEdit(game.id, game.title, e)}
                    type="button"
                  >
                    <Pencil
                      aria-hidden="true"
                      className="size-3"
                    />
                    <span className="sr-only">Edit game name</span>
                  </Button>
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{game.saveCount} saves</span>
                  <span>•</span>
                  <div className="flex items-center gap-1">
                    <Clock className="size-3" />
                    <span>
                      {format(new Date(game.updatedAt), "MMM d, yyyy • h:mm a")}
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>
          {editingGameId !== game.id && (
            <div className="ml-2 flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              {game.chatId && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleLoad(game.id, game.chatId);
                  }}
                  type="button"
                >
                  <Play
                    aria-hidden="true"
                    className="size-4"
                  />
                  <span className="sr-only">Load game</span>
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={(e) => handleDelete(game.id, e)}
                type="button"
              >
                <Trash2
                  aria-hidden="true"
                  className="size-4"
                />
                <span className="sr-only">Delete game</span>
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

