"use client";

import { useEffect } from "react";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { useGameStore } from "@/lib/stores/game-store";
import { NavSidebar } from "./nav-sidebar";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const sidebarExpanded = useGameStore((s) => s.sidebarExpanded);
  const setSidebarExpanded = useGameStore((s) => s.setSidebarExpanded);

  return (
    <SidebarProvider
      defaultOpen={sidebarExpanded}
      onOpenChange={setSidebarExpanded}
    >
      <NavSidebar />
      <SidebarInset>
        <header className="flex h-14 items-center gap-2 border-b px-4 md:hidden">
          <SidebarTrigger data-testid="mobile-menu-trigger" />
          <span className="font-semibold">SAIRPG</span>
        </header>
        <div className="flex flex-1 flex-col overflow-hidden">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
