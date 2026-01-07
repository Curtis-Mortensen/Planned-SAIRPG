"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ContextViewId } from "@/lib/constants/navigation";
import type { GamePhase } from "@/lib/game-state/types";

/**
 * Module IDs for the main navigation areas
 */
export type ModuleId = "play" | "editor";

/**
 * View IDs for context panes and sub-views
 */
export type ViewId = "world" | "characters" | "items" | "settings";

/**
 * Context panel view IDs for the play module
 * Re-exported from navigation constants for convenience
 */
export type { ContextViewId as ContextPanelView } from "@/lib/constants/navigation";

interface GameState {
  // Sidebar state
  sidebarExpanded: boolean;
  setSidebarExpanded: (expanded: boolean) => void;
  toggleSidebar: () => void;

  // Active module tracking
  activeModule: ModuleId;
  setActiveModule: (module: ModuleId) => void;

  // Editor state
  selectedModule: string;
  setSelectedModule: (module: string) => void;
  rightPanelTab: "prompt-editor" | "event-log";
  setRightPanelTab: (tab: "prompt-editor" | "event-log") => void;
  openNarratorPromptEditor: () => void;

  // Context pane state (for future use in play/editor views)
  contextPaneOpen: boolean;
  setContextPaneOpen: (open: boolean) => void;
  toggleContextPane: () => void;
  activeContextView: ViewId | null;
  setActiveContextView: (view: ViewId | null) => void;

  // Context panel view management (for play module)
  contextPanelView: ContextViewId;
  setContextPanelView: (view: ContextViewId) => void;

  // Save dialog state
  saveDialogOpen: boolean;
  setSaveDialogOpen: (open: boolean) => void;

  // Load confirmation dialog state
  loadConfirmDialogOpen: boolean;
  setLoadConfirmDialogOpen: (open: boolean) => void;
  pendingLoadSaveId: string | null;
  setPendingLoadSaveId: (id: string | null) => void;

  // New game confirmation dialog state
  newGameConfirmDialogOpen: boolean;
  setNewGameConfirmDialogOpen: (open: boolean) => void;

  // Navigate home confirmation dialog state
  navigateHomeConfirmDialogOpen: boolean;
  setNavigateHomeConfirmDialogOpen: (open: boolean) => void;

  // Current session tracking
  currentChatId: string | null;
  setCurrentChatId: (id: string | null) => void;

  // Game phase state machine
  currentPhase: GamePhase;
  setCurrentPhase: (phase: GamePhase) => void;
  pendingActionId: string | null;
  setPendingActionId: (id: string | null) => void;
  isInMetaEvent: boolean;
  setIsInMetaEvent: (value: boolean) => void;
  
  // Reset phase state (e.g., when loading a different game)
  resetPhaseState: () => void;
}

export const useGameStore = create<GameState>()(
  persist(
    (set, get) => {
      return {
      // Sidebar state
      sidebarExpanded: false,
      setSidebarExpanded: (expanded) => set({ sidebarExpanded: expanded }),
      toggleSidebar: () =>
        set((state) => ({ sidebarExpanded: !state.sidebarExpanded })),

      // Active module
      activeModule: "play",
      setActiveModule: (module) => set({ activeModule: module }),

      // Editor state
      selectedModule: "narrator",
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
      setContextPaneOpen: (open) => {
        set({ contextPaneOpen: open });
      },
      toggleContextPane: () => {
        set((state) => {
          return { contextPaneOpen: !state.contextPaneOpen };
        });
      },
      activeContextView: null,
      setActiveContextView: (view) => set({ activeContextView: view }),

      // Context panel view (for play module)
      contextPanelView: "stats",
      setContextPanelView: (view) => set({ contextPanelView: view }),

      // Save dialog state
      saveDialogOpen: false,
      setSaveDialogOpen: (open) => set({ saveDialogOpen: open }),

      // Load confirmation dialog state
      loadConfirmDialogOpen: false,
      setLoadConfirmDialogOpen: (open) => set({ loadConfirmDialogOpen: open }),
      pendingLoadSaveId: null,
      setPendingLoadSaveId: (id) => set({ pendingLoadSaveId: id }),

      // New game confirmation dialog state
      newGameConfirmDialogOpen: false,
      setNewGameConfirmDialogOpen: (open) => set({ newGameConfirmDialogOpen: open }),

      // Navigate home confirmation dialog state
      navigateHomeConfirmDialogOpen: false,
      setNavigateHomeConfirmDialogOpen: (open) => set({ navigateHomeConfirmDialogOpen: open }),

      // Current session
      currentChatId: null,
      setCurrentChatId: (id) => set({ currentChatId: id }),

      // Game phase state
      currentPhase: "idle" as GamePhase,
      setCurrentPhase: (phase) => set({ currentPhase: phase }),
      pendingActionId: null,
      setPendingActionId: (id) => set({ pendingActionId: id }),
      isInMetaEvent: false,
      setIsInMetaEvent: (value) => set({ isInMetaEvent: value }),
      
      resetPhaseState: () => set({
        currentPhase: "idle" as GamePhase,
        pendingActionId: null,
        isInMetaEvent: false,
      }),
    };
    },
    {
      name: "sairpg-game-store",
      partialize: (state) => ({
        sidebarExpanded: state.sidebarExpanded,
        contextPaneOpen: state.contextPaneOpen,
        activeContextView: state.activeContextView,
        contextPanelView: state.contextPanelView,
        selectedModule: state.selectedModule,
        rightPanelTab: state.rightPanelTab,
      }),
      onRehydrateStorage: () => (state) => {
        // Storage rehydrated
      },
    }
  )
);
