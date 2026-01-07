import {
  Gamepad2,
  Settings2,
  Save,
  BarChart3,
  Globe,
  type LucideIcon,
} from "lucide-react";
import type { ModuleId } from "@/lib/stores/game-store";

export interface NavigationItem {
  id: ModuleId;
  icon: LucideIcon;
  label: string;
  route: string;
  testId: string;
  description?: string;
}

/**
 * Main navigation items for SAIRPG
 * Single source of truth for all navigation components
 */
export const NAVIGATION_ITEMS: NavigationItem[] = [
  {
    id: "play",
    icon: Gamepad2,
    label: "Play",
    route: "/play",
    testId: "nav-play",
    description: "Chat interface for game interaction",
  },
  {
    id: "editor",
    icon: Settings2,
    label: "World Editor",
    route: "/editor",
    testId: "nav-editor",
    description: "Module config, prompt editor, and event log",
  },
] as const;

/**
 * Get a navigation item by its module ID
 */
export function getNavItemById(id: ModuleId): NavigationItem | undefined {
  return NAVIGATION_ITEMS.find((item) => item.id === id);
}

/**
 * Get a navigation item by its route
 */
export function getNavItemByRoute(route: string): NavigationItem | undefined {
  return NAVIGATION_ITEMS.find(
    (item) => route === item.route || route.startsWith(`${item.route}/`)
  );
}

/**
 * Context view IDs for the context panel tabs
 */
export type ContextViewId = "stats" | "saves" | "games";

/**
 * Context panel tab configuration
 * Single source of truth for context panel navigation
 */
export interface ContextPanelTab {
  id: ContextViewId;
  icon: LucideIcon;
  label: string;
  testId: string;
  description: string;
}

export const CONTEXT_PANEL_TABS: readonly ContextPanelTab[] = [
  {
    id: "stats",
    icon: BarChart3,
    label: "Stats",
    testId: "context-stats",
    description: "View game statistics and costs",
  },
  {
    id: "saves",
    icon: Save,
    label: "Saves",
    testId: "context-saves",
    description: "Manage save games",
  },
  {
    id: "games",
    icon: Globe,
    label: "Games",
    testId: "context-games",
    description: "Manage game files",
  },
] as const;

/**
 * Get a context panel tab by its ID
 */
export function getContextTabById(
  id: ContextViewId
): ContextPanelTab | undefined {
  return CONTEXT_PANEL_TABS.find((tab) => tab.id === id);
}

