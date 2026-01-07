"use client";

import type { LucideIcon } from "lucide-react";
import {
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useGameStore } from "@/lib/stores/game-store";
import type { ContextViewId } from "@/lib/constants/navigation";
import { cn } from "@/lib/utils";

interface PanelControlItemProps {
  icon: LucideIcon;
  label: string;
  viewId: ContextViewId;
  testId?: string;
}

export function PanelControlItem({
  icon: Icon,
  label,
  viewId,
  testId,
}: PanelControlItemProps) {
  const contextPaneOpen = useGameStore((s) => s.contextPaneOpen);
  const contextPanelView = useGameStore((s) => s.contextPanelView);
  const setContextPanelView = useGameStore((s) => s.setContextPanelView);
  const setContextPaneOpen = useGameStore((s) => s.setContextPaneOpen);

  const isActive = contextPaneOpen && contextPanelView === viewId;

  const handleClick = () => {
    if (isActive) {
      // If clicking on the already-active item, close the panel
      setContextPaneOpen(false);
    } else {
      // Otherwise, set the view and open the panel
      setContextPanelView(viewId);
      setContextPaneOpen(true);
    }
  };

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        className={cn(
          "size-10 p-0 flex items-center justify-center",
          "text-muted-foreground/70 hover:text-muted-foreground",
          "hover:bg-sidebar-accent/50",
          isActive && "bg-sidebar-accent text-sidebar-accent-foreground"
        )}
        data-testid={testId}
        onClick={handleClick}
        tooltip={label}
        type="button"
      >
        <Icon
          aria-hidden="true"
          className="size-5 shrink-0"
        />
        <span className="sr-only">{label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

