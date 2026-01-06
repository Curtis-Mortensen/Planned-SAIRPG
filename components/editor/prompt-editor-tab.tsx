"use client";

import { useGameStore } from "@/lib/stores/game-store";

export function PromptEditorTab() {
  const selectedModule = useGameStore((s) => s.selectedModule);

  return (
    <div
      className="flex flex-1 flex-col p-4"
      data-testid="prompt-editor-content"
    >
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <h2 className="font-semibold text-xl">
          Prompt Editor for {selectedModule || "No Module Selected"}
        </h2>
        <p className="text-muted-foreground">
          Prompt configuration interface coming soon.
        </p>
      </div>
    </div>
  );
}


