"use client";

import { Button } from "@/components/ui/button";
import { useGameStore } from "@/lib/stores/game-store";
import { BookOpen } from "lucide-react";

export function NarratorButton() {
  const openNarratorPromptEditor = useGameStore(
    (s) => s.openNarratorPromptEditor
  );

  return (
    <Button
      data-testid="narrator-button"
      onClick={openNarratorPromptEditor}
      variant="outline"
      className="gap-2"
    >
      <BookOpen aria-hidden="true" className="size-4" />
      <span>Narrator</span>
    </Button>
  );
}



