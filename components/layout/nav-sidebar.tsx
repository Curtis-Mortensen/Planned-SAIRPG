"use client";

import { MessageSquare, Settings2, ScrollText, Sliders } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { NavItem } from "./nav-item";

const navigationItems = [
  {
    icon: MessageSquare,
    label: "Play",
    route: "/play",
    testId: "nav-play",
  },
  {
    icon: Settings2,
    label: "World Editor",
    route: "/editor",
    testId: "nav-editor",
  },
  {
    icon: ScrollText,
    label: "Event Log",
    route: "/log",
    testId: "nav-log",
  },
  {
    icon: Sliders,
    label: "Prompts",
    route: "/prompts",
    testId: "nav-prompts",
  },
] as const;

export function NavSidebar() {
  const { setOpenMobile } = useSidebar();

  return (
    <Sidebar
      collapsible="icon"
      data-testid="nav-sidebar"
      side="left"
      variant="inset"
    >
      <SidebarHeader>
        <SidebarMenu>
          <div className="flex items-center justify-center px-2 py-4">
            <span className="font-semibold text-lg group-data-[collapsible=icon]:hidden">
              SAIRPG
            </span>
            <span className="font-semibold text-lg group-data-[collapsible=icon]:block hidden">
              S
            </span>
          </div>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent data-testid="mobile-drawer">
        <SidebarMenu>
          {navigationItems.map((item) => (
            <NavItem
              key={item.route}
              icon={item.icon}
              label={item.label}
              route={item.route}
              testId={item.testId}
              onNavigate={() => setOpenMobile(false)}
            />
          ))}
        </SidebarMenu>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}

