"use client";

import { useTheme } from "next-themes";

import { useGameStore } from "@/lib/stores/game-store";
import { CostStats } from "./cost-stats";
import { cn } from "@/lib/utils";

interface ContextPanelProps {
  chatId: string;
  children: React.ReactNode;
}

export function ContextPanel({ chatId, children }: ContextPanelProps) {
  const contextPaneOpen = useGameStore((s) => s.contextPaneOpen);
  const { theme, setTheme } = useTheme();

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
          <span className="text-sm font-semibold">Context</span>
          <div className="flex gap-1">
            <button
              onClick={() => setTheme("light")}
              className={cn(
                "h-4 w-4 rounded-full border border-zinc-500 bg-white",
                theme === "light" && "ring-2 ring-primary"
              )}
              title="Light Mode"
            />
            <button
               onClick={() => setTheme("dark")}
               className={cn(
                 "h-4 w-4 rounded-full border border-zinc-500 bg-neutral-900",
                 theme === "dark" && "ring-2 ring-primary"
               )}
               title="Dark Mode"
             />
             <button
               onClick={() => setTheme("blue")}
               className={cn(
                 "h-4 w-4 rounded-full border border-zinc-200 bg-blue-900",
                 theme === "blue" && "ring-2 ring-primary"
               )}
               title="Blue Mode"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <CostStats chatId={chatId} />
        </div>
      </aside>
      <div className="flex flex-1 flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
}
