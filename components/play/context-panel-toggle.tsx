"use client";

import { PanelRight } from "lucide-react";
import { useEffect } from "react";
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

  // #region agent log
  useEffect(() => {
    fetch('http://127.0.0.1:7242/ingest/46496f1f-bdea-4b20-8099-d4bdc456fe12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'context-panel-toggle.tsx:15',message:'ContextPanelToggle render',data:{contextPaneOpen},timestamp:Date.now(),sessionId:'debug-session',runId:'initial',hypothesisId:'D'})}).catch(()=>{});
  }, [contextPaneOpen]);
  // #endregion

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          className="h-8 px-2 md:h-fit md:px-2"
          data-testid="context-panel-toggle-button"
          onClick={() => {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/46496f1f-bdea-4b20-8099-d4bdc456fe12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'context-panel-toggle.tsx:22',message:'Button onClick triggered',data:{contextPaneOpenBefore:contextPaneOpen},timestamp:Date.now(),sessionId:'debug-session',runId:'initial',hypothesisId:'C'})}).catch(()=>{});
            // #endregion
            toggleContextPane();
          }}
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
