"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

import { useGameStore } from "@/lib/stores/game-store";
import { StatsView } from "./stats-view";
import { SavesView } from "./saves-view";
import { GamesView } from "./games-view";
import { SaveDialog } from "./save-dialog";
import { LoadConfirmDialog } from "./load-confirm-dialog";
import { NewGameConfirmDialog } from "./new-game-confirm-dialog";
import { getGameByChatIdAction } from "@/app/actions/games";
import { cn } from "@/lib/utils";
import { CONTEXT_PANEL_TABS } from "@/lib/constants/navigation";

interface ContextPanelProps {
  chatId: string;
  children: React.ReactNode;
}

export function ContextPanel({ chatId, children }: ContextPanelProps) {
  const contextPaneOpen = useGameStore((s) => s.contextPaneOpen);
  const contextPanelView = useGameStore((s) => s.contextPanelView);
  const { theme, setTheme } = useTheme();
  const [currentGameId, setCurrentGameId] = useState<string | undefined>();

  // Fetch current gameId from chatId
  useEffect(() => {
    if (chatId) {
      getGameByChatIdAction(chatId).then((game) => {
        setCurrentGameId(game?.id);
      });
    }
  }, [chatId]);

  const currentTab = CONTEXT_PANEL_TABS.find((tab) => tab.id === contextPanelView);
  const headerLabel = currentTab?.label || "Stats";

  return (
    <div className="flex flex-1 overflow-hidden">
      <aside
        className={cn(
          "flex flex-col border-r transition-all duration-200",
          contextPaneOpen ? "w-80" : "w-0 overflow-hidden"
        )}
        data-testid="context-panel"
      >
        <div className="flex h-14 items-center justify-between border-b px-4">
          <span className="text-sm font-semibold">
            {headerLabel}
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setTheme("light")}
              className={cn(
                "h-4 w-4 rounded-full border border-zinc-500 bg-white",
                theme === "light" && "ring-2 ring-primary"
              )}
              title="Light Mode"
              type="button"
            />
            <button
              onClick={() => setTheme("dark")}
              className={cn(
                "h-4 w-4 rounded-full border border-zinc-500 bg-neutral-900",
                theme === "dark" && "ring-2 ring-primary"
              )}
              title="Dark Mode"
              type="button"
            />
            <button
              onClick={() => setTheme("blue")}
              className={cn(
                "h-4 w-4 rounded-full border border-zinc-200 bg-blue-900",
                theme === "blue" && "ring-2 ring-primary"
              )}
              title="Blue Mode"
              type="button"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {contextPanelView === "stats" && <StatsView chatId={chatId} />}
          {contextPanelView === "saves" && <SavesView chatId={chatId} />}
          {contextPanelView === "games" && <GamesView currentGameId={currentGameId} />}
        </div>
      </aside>
      <div className="flex flex-1 flex-col overflow-hidden">
        {children}
        <SaveDialog chatId={chatId} />
        <LoadConfirmDialog chatId={chatId} />
        <NewGameConfirmDialog chatId={chatId} />
      </div>
    </div>
  );
}
