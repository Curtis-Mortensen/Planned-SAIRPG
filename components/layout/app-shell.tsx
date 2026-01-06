"use client";

import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { NavSidebar } from "./nav-sidebar";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <SidebarProvider defaultOpen={true}>
      <NavSidebar />
      <SidebarInset>
        <div className="flex h-14 items-center border-b px-4 md:hidden">
          <SidebarTrigger
            className="md:hidden"
            data-testid="mobile-menu-trigger"
          />
        </div>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}

