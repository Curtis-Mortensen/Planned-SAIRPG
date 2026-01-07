"use client";

import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { NavSidebar } from "./nav-sidebar";
import { NewGameConfirmDialog } from "@/components/play/new-game-confirm-dialog";
import { NavigateHomeConfirmDialog } from "@/components/play/navigate-home-confirm-dialog";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <SidebarProvider>
      <NavSidebar />
      <SidebarInset>
        <header className="flex h-14 items-center gap-2 border-b px-4 md:hidden">
          <SidebarTrigger data-testid="mobile-menu-trigger" />
          <span className="font-semibold">SAIRPG</span>
        </header>
        <div className="flex flex-1 flex-col overflow-hidden">{children}</div>
      </SidebarInset>
      <NewGameConfirmDialog />
      <NavigateHomeConfirmDialog />
    </SidebarProvider>
  );
}
