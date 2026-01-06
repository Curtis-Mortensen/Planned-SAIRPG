"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import type { ModuleId } from "@/lib/stores/game-store";
import { useGameStore } from "@/lib/stores/game-store";

interface NavItemProps {
  icon: LucideIcon;
  label: string;
  route: string;
  moduleId: ModuleId;
  testId?: string;
  onNavigate?: () => void;
}

export function NavItem({
  icon: Icon,
  label,
  route,
  moduleId,
  testId,
  onNavigate,
}: NavItemProps) {
  const pathname = usePathname();
  const setActiveModule = useGameStore((s) => s.setActiveModule);

  const isActive = pathname === route || pathname.startsWith(`${route}/`);

  const handleClick = () => {
    setActiveModule(moduleId);
    onNavigate?.();
  };

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        data-testid={testId}
        isActive={isActive}
        tooltip={label}
      >
        <Link
          aria-current={isActive ? "page" : undefined}
          href={route}
          onClick={handleClick}
        >
          <Icon aria-hidden="true" />
          <span>{label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
