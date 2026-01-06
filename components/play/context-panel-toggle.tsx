"use client";

import { PanelRight } from "lucide-react";
import { useGameStore } from "@/lib/stores/game-store";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function ContextPanelToggle() {
  const contextPaneOpen = useGameStore((s) => s.contextPaneOpen);
  const toggleContextPane = useGameStore((s) => s.toggleContextPane);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          className="h-8 px-2 md:h-fit md:px-2"
          data-testid="context-panel-toggle-button"
          onClick={toggleContextPane}
          variant="outline"
          type="button"
        >
          <PanelRight
            aria-hidden="true"
            className="size-4"
          />
          <span className="sr-only">Toggle Context Panel</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent align="start" className="hidden md:block">
        {contextPaneOpen ? "Hide Context" : "Show Context"}
      </TooltipContent>
    </Tooltip>
  );
}
