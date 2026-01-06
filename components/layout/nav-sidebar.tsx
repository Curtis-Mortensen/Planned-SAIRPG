"use client";

import { Settings, User } from "lucide-react";
import Link from "next/link";
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
import { NAVIGATION_ITEMS } from "@/lib/constants/navigation";
import { NavItem } from "./nav-item";

export function NavSidebar() {
  const { setOpenMobile } = useSidebar();

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
              tooltip="Profile"
            >
              <Link
                href="/settings"
                onClick={() => setOpenMobile(false)}
              >
                <User
                  aria-hidden="true"
                  className="size-5 shrink-0"
                />
                <span className="sr-only">Profile</span>
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
      </SidebarContent>
      <SidebarFooter className="items-center px-0">
        <SidebarMenu className="items-center">
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="size-10 p-0 flex items-center justify-center"
              tooltip="Settings"
            >
              <Link href="/settings" onClick={() => setOpenMobile(false)}>
                <Settings className="size-5 shrink-0" />
                <span className="sr-only">Settings</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
