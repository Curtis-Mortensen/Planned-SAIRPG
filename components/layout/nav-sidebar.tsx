"use client";

import { Gamepad2 } from "lucide-react";
import Link from "next/link";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { NAVIGATION_ITEMS } from "@/lib/constants/navigation";
import { NavItem } from "./nav-item";

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
          <Link
            className="flex items-center gap-2 px-2 py-4 transition-colors hover:opacity-80"
            href="/play"
            onClick={() => setOpenMobile(false)}
          >
            <Gamepad2
              aria-hidden="true"
              className="size-6 shrink-0 text-primary"
            />
            <span className="font-semibold text-lg group-data-[collapsible=icon]:hidden">
              SAIRPG
            </span>
          </Link>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu>
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
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
