"use client";

import { RightPanel } from "@/components/editor/right-panel";
import { NarratorButton } from "@/components/editor/narrator-button";

export default function EditorPage() {
  return (
    <div className="flex flex-1">
      {/* Module Graph Area */}
      <div className="flex flex-1 flex-col gap-4 p-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-semibold text-2xl">World Editor</h1>
            <p className="mt-2 text-muted-foreground">
              Visual hub-and-spoke diagram for configuring world modules.
            </p>
          </div>
          <NarratorButton />
        </div>
        <div className="flex flex-1 items-center justify-center rounded-lg border bg-muted/30">
          <p className="text-muted-foreground">
            Module graph visualization coming soon.
          </p>
        </div>
      </div>

      {/* Right Panel */}
      <RightPanel />
    </div>
  );
}

