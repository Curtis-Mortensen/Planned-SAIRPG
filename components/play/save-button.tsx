"use client";

import { Save } from "lucide-react";
import { useGameStore } from "@/lib/stores/game-store";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface SaveButtonProps {
  chatId: string;
}

export function SaveButton({ chatId }: SaveButtonProps) {
  const setSaveDialogOpen = useGameStore((s) => s.setSaveDialogOpen);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          className="h-8 px-2 md:h-fit md:px-2"
          data-testid="save-button"
          onClick={() => setSaveDialogOpen(true)}
          variant="outline"
          type="button"
        >
          <Save
            aria-hidden="true"
            className="size-4"
          />
          <span className="sr-only">Save Game</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent align="start" className="hidden md:block">
        Save Game
      </TooltipContent>
    </Tooltip>
  );
}

