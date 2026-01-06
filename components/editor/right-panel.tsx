"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useGameStore } from "@/lib/stores/game-store";
import { PromptEditorTab } from "./prompt-editor-tab";
import { EventLogTab } from "./event-log-tab";

export function RightPanel() {
  const rightPanelTab = useGameStore((s) => s.rightPanelTab);
  const setRightPanelTab = useGameStore((s) => s.setRightPanelTab);
  const selectedModule = useGameStore((s) => s.selectedModule);
  const setSelectedModule = useGameStore((s) => s.setSelectedModule);

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
        <div className="relative z-10 border-b p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1">
              <label className="text-sm font-medium">Module</label>
              <Select
                value={selectedModule || "narrator"}
                onValueChange={setSelectedModule}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select a module" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="narrator">Narrator Module</SelectItem>
                  <SelectItem value="valid-input">Valid Input Module</SelectItem>
                  <SelectItem value="meta-nesting">Meta Nesting Module</SelectItem>
                  <SelectItem value="meta-event">Meta Event Module</SelectItem>
                  <SelectItem value="time">Time Module</SelectItem>
                  <SelectItem value="npc">NPC Module</SelectItem>
                  <SelectItem value="difficulty">Difficulty Module</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <TabsList className="grid w-auto grid-cols-2">
              <TabsTrigger data-testid="tab-prompt-editor" value="prompt-editor">
                Prompt
              </TabsTrigger>
              <TabsTrigger data-testid="tab-event-log" value="event-log">
                Events
              </TabsTrigger>
            </TabsList>
          </div>
        </div>
        <TabsContent
          value="prompt-editor"
          className="m-0 flex flex-1 flex-col overflow-hidden data-[state=active]:flex"
          data-testid="prompt-editor-tab"
        >
          <PromptEditorTab />
        </TabsContent>
        <TabsContent
          value="event-log"
          className="m-0 flex flex-1 flex-col overflow-hidden data-[state=active]:flex"
          data-testid="event-log-tab"
        >
          <EventLogTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

