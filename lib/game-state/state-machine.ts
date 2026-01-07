import type { GamePhase, GameStateContext } from "./types";
import { VALID_TRANSITIONS, BLOCKING_PHASES } from "./types";

/**
 * Validates that a phase transition is allowed
 */
export function isValidTransition(from: GamePhase, to: GamePhase): boolean {
  const allowed = VALID_TRANSITIONS[from];
  return allowed.includes(to);
}

/**
 * Determines if the current phase blocks new player input
 */
export function isPhaseBlocking(phase: GamePhase): boolean {
  return BLOCKING_PHASES.includes(phase);
}

/**
 * Determines if meta events should be generated for this action
 * Returns false when we're already inside an event or combat
 */
export function shouldGenerateMetaEvents(context: GameStateContext): boolean {
  // Don't generate new meta events while resolving existing ones
  if (context.isInMetaEvent) return false;
  if (context.isInCombat) return false;
  
  // Only generate during the proposal phase
  return context.currentPhase === "meta_proposal";
}

/**
 * Gets the next phase after the current one completes
 * This is the "happy path" - specific conditions may override
 */
export function getNextPhase(
  currentPhase: GamePhase,
  context: {
    validationPassed?: boolean;
    hasTriggeredEvents?: boolean;
    allEventsResolved?: boolean;
    combatEnded?: boolean;
    reviewOutcome?: "confirm" | "regenerate";  // For meta_review phase
  }
): GamePhase {
  switch (currentPhase) {
    case "idle":
      return "validating";
      
    case "validating":
      return context.validationPassed ? "meta_proposal" : "idle";
      
    case "meta_proposal":
      return "meta_review";
      
    case "meta_review":
      // Handle regenerate vs confirm
      if (context.reviewOutcome === "regenerate") {
        return "meta_proposal";
      }
      // After player confirms, roll for probability
      return "probability_roll";
      
    case "probability_roll":
      // If any events triggered, go to event resolution
      // Otherwise skip straight to action resolution
      return context.hasTriggeredEvents ? "in_meta_event" : "resolving_action";
      
    case "in_meta_event":
      // If all events resolved, resolve the original action
      // Otherwise stay in event resolution (use getNextUnresolvedEvent() to find next)
      return context.allEventsResolved ? "resolving_action" : "in_meta_event";
      
    case "in_combat":
      // After combat ends, check if more events or resolve action
      if (context.combatEnded) {
        return context.allEventsResolved ? "resolving_action" : "in_meta_event";
      }
      return "in_combat";
      
    case "resolving_action":
      // Action complete, back to idle
      return "idle";
      
    default:
      return "idle";
  }
}

/**
 * Creates a fresh context for a new game/session
 */
export function createInitialContext(gameId: string, chatId: string): GameStateContext {
  return {
    gameId,
    chatId,
    currentPhase: "idle",
    pendingActionId: null,
    isInMetaEvent: false,
    isInCombat: false,
  };
}
