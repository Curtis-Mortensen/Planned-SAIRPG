"use client";

import { User } from "lucide-react";
import Link from "next/link";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
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
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              tooltip="Profile"
            >
              <Link
                href="/play"
                onClick={() => setOpenMobile(false)}
              >
                <User
                  aria-hidden="true"
                  className="size-5 shrink-0"
                />
                <span>Profile</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
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
    </Sidebar>
  );
}
