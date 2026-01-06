"use client";

import { useGameStore } from "@/lib/stores/game-store";
import { CostStats } from "./cost-stats";
import { cn } from "@/lib/utils";

interface ContextSidebarProps {
  chatId: string;
  children: React.ReactNode;
}

export function ContextSidebar({ chatId, children }: ContextSidebarProps) {
  const contextPaneOpen = useGameStore((s) => s.contextPaneOpen);

  return (
    <div className="flex flex-1 overflow-hidden">
      <aside
        className={cn(
          "flex flex-col border-r bg-sidebar text-sidebar-foreground transition-all duration-200",
          contextPaneOpen ? "w-80" : "w-0 overflow-hidden"
        )}
        data-testid="context-sidebar"
      >
        <div className="flex h-14 items-center border-b px-4">
          <span className="text-sm font-semibold">Context</span>
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

