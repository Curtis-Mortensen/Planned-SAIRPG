"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

interface NavItemProps {
  icon: LucideIcon;
  label: string;
  route: string;
  testId?: string;
  onNavigate?: () => void;
}

export function NavItem({
  icon: Icon,
  label,
  route,
  testId,
  onNavigate,
}: NavItemProps) {
  const pathname = usePathname();
  const { state } = useSidebar();
  const isActive = pathname === route || pathname.startsWith(`${route}/`);

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={isActive}
        tooltip={state === "collapsed" ? label : undefined}
        data-testid={testId}
      >
        <Link href={route} onClick={onNavigate}>
          <Icon />
          <span>{label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

