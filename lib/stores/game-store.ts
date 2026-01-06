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

  // Current session tracking
  currentChatId: string | null;
  setCurrentChatId: (id: string | null) => void;
}

export const useGameStore = create<GameState>()(
  persist(
    (set, get) => {
      // #region agent log
      if (typeof window !== "undefined") {
        fetch('http://127.0.0.1:7242/ingest/46496f1f-bdea-4b20-8099-d4bdc456fe12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game-store.ts:45',message:'Store initialization',data:{timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'initial',hypothesisId:'A'})}).catch(()=>{});
      }
      // #endregion
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
        // #region agent log
        if (typeof window !== "undefined") {
          const currentState = get().contextPaneOpen;
          fetch('http://127.0.0.1:7242/ingest/46496f1f-bdea-4b20-8099-d4bdc456fe12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game-store.ts:71',message:'setContextPaneOpen called',data:{from:currentState,to:open},timestamp:Date.now(),sessionId:'debug-session',runId:'initial',hypothesisId:'C'})}).catch(()=>{});
        }
        // #endregion
        set({ contextPaneOpen: open });
      },
      toggleContextPane: () => {
        // #region agent log
        if (typeof window !== "undefined") {
          const currentState = get().contextPaneOpen;
          fetch('http://127.0.0.1:7242/ingest/46496f1f-bdea-4b20-8099-d4bdc456fe12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game-store.ts:73',message:'toggleContextPane called',data:{before:currentState},timestamp:Date.now(),sessionId:'debug-session',runId:'initial',hypothesisId:'C'})}).catch(()=>{});
        }
        // #endregion
        set((state) => {
          // #region agent log
          if (typeof window !== "undefined") {
            fetch('http://127.0.0.1:7242/ingest/46496f1f-bdea-4b20-8099-d4bdc456fe12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game-store.ts:73',message:'toggleContextPane state update',data:{from:state.contextPaneOpen,to:!state.contextPaneOpen},timestamp:Date.now(),sessionId:'debug-session',runId:'initial',hypothesisId:'C'})}).catch(()=>{});
          }
          // #endregion
          return { contextPaneOpen: !state.contextPaneOpen };
        });
      },
      activeContextView: null,
      setActiveContextView: (view) => set({ activeContextView: view }),

      // Current session
      currentChatId: null,
      setCurrentChatId: (id) => set({ currentChatId: id }),
    };
    },
    {
      name: "sairpg-game-store",
      partialize: (state) => ({
        sidebarExpanded: state.sidebarExpanded,
        contextPaneOpen: state.contextPaneOpen,
        activeContextView: state.activeContextView,
        selectedModule: state.selectedModule,
        rightPanelTab: state.rightPanelTab,
      }),
      onRehydrateStorage: () => (state) => {
        // #region agent log
        if (typeof window !== "undefined" && state) {
          fetch('http://127.0.0.1:7242/ingest/46496f1f-bdea-4b20-8099-d4bdc456fe12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'game-store.ts:90',message:'onRehydrateStorage callback',data:{contextPaneOpen:state.contextPaneOpen},timestamp:Date.now(),sessionId:'debug-session',runId:'initial',hypothesisId:'B'})}).catch(()=>{});
        }
        // #endregion
      },
    }
  )
);
