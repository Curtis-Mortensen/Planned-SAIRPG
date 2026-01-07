"use client";

import { Home, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { NAVIGATION_ITEMS, CONTEXT_PANEL_TABS } from "@/lib/constants/navigation";
import { NavItem } from "./nav-item";
import { PanelControlItem } from "./panel-control-item";
import { useGameStore } from "@/lib/stores/game-store";

export function NavSidebar() {
  const { setOpenMobile } = useSidebar();
  const pathname = usePathname();
  const isHomeActive = pathname === "/";
  const isSettingsPage = pathname.startsWith("/settings");
  const isEditorPage = pathname.startsWith("/editor");
  const shouldHideContextActions = isSettingsPage || isEditorPage;
  const currentChatId = useGameStore((s) => s.currentChatId);
  const setNavigateHomeConfirmDialogOpen = useGameStore((s) => s.setNavigateHomeConfirmDialogOpen);

  const handleHomeClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    // If there's an active game session, show confirmation (regardless of current page)
    if (currentChatId) {
      e.preventDefault();
      setOpenMobile(false);
      setNavigateHomeConfirmDialogOpen(true);
    } else {
      // Otherwise, allow normal navigation
      setOpenMobile(false);
    }
  };

  return (
    <Sidebar
      className="w-14 min-w-14"
      collapsible="none"
      data-testid="nav-sidebar"
      side="left"
      variant="inset"
    >
      <SidebarHeader className="items-center px-0">
        <SidebarMenu className="items-center">
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="size-10 p-0 flex items-center justify-center"
              isActive={isHomeActive}
              tooltip="SAI"
            >
              <Link
                href="/"
                onClick={handleHomeClick}
              >
                <Home
                  aria-hidden="true"
                  className="size-5 shrink-0"
                />
                <span className="sr-only">SAI</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="size-10 p-0 flex items-center justify-center"
              tooltip="Settings"
            >
              <Link
                href="/settings"
                onClick={() => setOpenMobile(false)}
              >
                <Settings
                  aria-hidden="true"
                  className="size-5 shrink-0"
                />
                <span className="sr-only">Settings</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="items-center px-0">
        <SidebarMenu className="items-center gap-2">
          {NAVIGATION_ITEMS.map((item) => (
            <NavItem
              key={item.route}
              icon={item.icon}
              label={item.label}
              moduleId={item.id}
              route={item.route}
              testId={item.testId}
              onNavigate={() => setOpenMobile(false)}
            />
          ))}
        </SidebarMenu>
        {!shouldHideContextActions && (
          <>
            <div className="my-2 border-t" />
            <SidebarMenu className="items-center gap-2">
              {CONTEXT_PANEL_TABS.map((tab) => (
                <PanelControlItem
                  key={tab.id}
                  icon={tab.icon}
                  label={tab.label}
                  viewId={tab.id}
                  testId={tab.testId}
                />
              ))}
            </SidebarMenu>
          </>
        )}
      </SidebarContent>
      <SidebarFooter className="items-center px-0">
      </SidebarFooter>
    </Sidebar>
  );
}
