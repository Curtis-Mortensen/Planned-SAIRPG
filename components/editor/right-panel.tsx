"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useGameStore } from "@/lib/stores/game-store";
import { PromptEditorTab } from "./prompt-editor-tab";
import { EventLogTab } from "./event-log-tab";

export function RightPanel() {
  const rightPanelTab = useGameStore((s) => s.rightPanelTab);
  const setRightPanelTab = useGameStore((s) => s.setRightPanelTab);

  return (
    <div
      className="flex w-80 flex-1 flex-col border-l bg-muted/50"
      data-testid="right-panel"
    >
      <Tabs
        value={rightPanelTab}
        onValueChange={(value: string) =>
          setRightPanelTab(value as "prompt-editor" | "event-log")
        }
        className="flex flex-1 flex-col"
      >
        <div className="border-b p-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger
              data-testid="tab-prompt-editor"
              value="prompt-editor"
            >
              Prompt Editor
            </TabsTrigger>
            <TabsTrigger data-testid="tab-event-log" value="event-log">
              Event Log
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent
          value="prompt-editor"
          className="m-0 flex flex-1 flex-col data-[state=active]:flex"
          data-testid="prompt-editor-tab"
        >
          <PromptEditorTab />
        </TabsContent>
        <TabsContent
          value="event-log"
          className="m-0 flex flex-1 flex-col data-[state=active]:flex"
          data-testid="event-log-tab"
        >
          <EventLogTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

