"use client";

import { useEffect, useCallback } from "react";
import { useGameStore } from "@/lib/stores/game-store";
import type { GamePhase } from "@/lib/game-state/types";

interface UseGamePhaseOptions {
  gameId: string | null;
  pollInterval?: number; // ms, default 2000
}

/**
 * Hook to sync game phase from server to client store
 * Polls the server for phase changes when in blocking phases
 */
export function useGamePhase({ gameId, pollInterval = 2000 }: UseGamePhaseOptions) {
  const { 
    currentPhase, 
    setCurrentPhase, 
    setPendingActionId,
    setIsInMetaEvent,
  } = useGameStore();

  const fetchPhase = useCallback(async () => {
    if (!gameId) return;
    
    try {
      const response = await fetch(`/api/game/${gameId}/phase`);
      if (!response.ok) return;
      
      const data = await response.json();
      setCurrentPhase(data.phase);
      setPendingActionId(data.pendingActionId ?? null);
      setIsInMetaEvent(data.phase === "in_meta_event");
    } catch {
      // Silently fail - will retry on next poll
    }
  }, [gameId, setCurrentPhase, setPendingActionId, setIsInMetaEvent]);

  // Initial fetch
  useEffect(() => {
    fetchPhase();
  }, [fetchPhase]);

  // Poll during blocking phases
  useEffect(() => {
    const blockingPhases: GamePhase[] = ["validating", "meta_proposal", "probability_roll"];
    
    if (!blockingPhases.includes(currentPhase)) {
      return; // No polling needed
    }

    const interval = setInterval(fetchPhase, pollInterval);
    return () => clearInterval(interval);
  }, [currentPhase, pollInterval, fetchPhase]);

  return {
    currentPhase,
    refetch: fetchPhase,
  };
}
