"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Module IDs for the main navigation areas
 */
export type ModuleId = "play" | "editor";

/**
 * View IDs for context panes and sub-views
 */
export type ViewId = "world" | "characters" | "items" | "settings";

interface GameState {
  // Sidebar state
  sidebarExpanded: boolean;
  setSidebarExpanded: (expanded: boolean) => void;
  toggleSidebar: () => void;

  // Active module tracking
  activeModule: ModuleId;
  setActiveModule: (module: ModuleId) => void;

  // Editor state
  selectedModule: string | null;
  setSelectedModule: (module: string | null) => void;
  rightPanelTab: "prompt-editor" | "event-log";
  setRightPanelTab: (tab: "prompt-editor" | "event-log") => void;
  openNarratorPromptEditor: () => void;

  // Context pane state (for future use in play/editor views)
  contextPaneOpen: boolean;
  setContextPaneOpen: (open: boolean) => void;
  toggleContextPane: () => void;
  activeContextView: ViewId | null;
  setActiveContextView: (view: ViewId | null) => void;

  // Current session tracking
  currentChatId: string | null;
  setCurrentChatId: (id: string | null) => void;
}

export const useGameStore = create<GameState>()(
  persist(
    (set) => ({
      // Sidebar state
      sidebarExpanded: false,
      setSidebarExpanded: (expanded) => set({ sidebarExpanded: expanded }),
      toggleSidebar: () =>
        set((state) => ({ sidebarExpanded: !state.sidebarExpanded })),

      // Active module
      activeModule: "play",
      setActiveModule: (module) => set({ activeModule: module }),

      // Editor state
      selectedModule: null,
      setSelectedModule: (module) => set({ selectedModule: module }),
      rightPanelTab: "prompt-editor",
      setRightPanelTab: (tab) => set({ rightPanelTab: tab }),
      openNarratorPromptEditor: () =>
        set({
          selectedModule: "narrator",
          rightPanelTab: "prompt-editor",
        }),

      // Context pane
      contextPaneOpen: false,
      setContextPaneOpen: (open) => set({ contextPaneOpen: open }),
      toggleContextPane: () =>
        set((state) => ({ contextPaneOpen: !state.contextPaneOpen })),
      activeContextView: null,
      setActiveContextView: (view) => set({ activeContextView: view }),

      // Current session
      currentChatId: null,
      setCurrentChatId: (id) => set({ currentChatId: id }),
    }),
    {
      name: "sairpg-game-store",
      partialize: (state) => ({
        sidebarExpanded: state.sidebarExpanded,
        contextPaneOpen: state.contextPaneOpen,
        activeContextView: state.activeContextView,
        selectedModule: state.selectedModule,
        rightPanelTab: state.rightPanelTab,
      }),
    }
  )
);
