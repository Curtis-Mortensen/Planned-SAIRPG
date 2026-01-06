import { Inngest } from 'inngest';

/**
 * Inngest client for orchestrating game loop workflows.
 * Manages complex sequences: Input Validation → Constraints → Meta → Interaction → Narrator
 */
export const inngest = new Inngest({
  id: 'sairpg-game-engine',
  name: 'SAIRPG Game Engine',
  retryFn: async (attempt: number) => ({
    delay: Math.pow(2, attempt) * 1000, // exponential backoff
    maxAttempts: 3,
  }),
});

/**
 * Event types for the game loop.
 * These are emitted by the client and processed by Inngest functions.
 */
export const GameEvents = {
  // Player submits an action (e.g., "I attack the goblin")
  PLAYER_ACTION_SUBMITTED: 'game/action.submitted',
  
  // Workflow starts processing the action
  TURN_STARTED: 'game/turn.started',
  
  // Input validation completed
  VALIDATION_COMPLETED: 'game/validation.completed',
  
  // All constraint modules completed
  CONSTRAINTS_COMPLETED: 'game/constraints.completed',
  
  // Meta modules completed (nesting decisions, etc)
  META_COMPLETED: 'game/meta.completed',
  
  // Interaction modules completed
  INTERACTION_COMPLETED: 'game/interaction.completed',
  
  // Narrator module completed (final output generated)
  NARRATOR_COMPLETED: 'game/narrator.completed',
  
  // Turn finished and output sent to player
  TURN_COMPLETED: 'game/turn.completed',
  
  // Turn failed and error returned
  TURN_FAILED: 'game/turn.failed',
};

/**
 * Event payload types for Inngest
 */
export interface PlayerActionEvent {
  sessionId: string;
  userId: string;
  playerInput: string;
  context?: Record<string, unknown>;
}

export interface TurnStartedEvent {
  sessionId: string;
  userId: string;
  turnId: string;
  playerInput: string;
}

export interface ValidationCompletedEvent {
  sessionId: string;
  turnId: string;
  isValid: boolean;
  clarificationNeeded?: string;
}

export interface ConstraintsCompletedEvent {
  sessionId: string;
  turnId: string;
  constraints: Record<string, unknown>;
}

export interface MetaCompletedEvent {
  sessionId: string;
  turnId: string;
  nestingDecision?: 'push' | 'pop' | 'continue';
  metaSignals: Record<string, unknown>;
}

export interface InteractionCompletedEvent {
  sessionId: string;
  turnId: string;
  npcReactions: Record<string, unknown>;
}

export interface NarratorCompletedEvent {
  sessionId: string;
  turnId: string;
  narrative: string;
  signals: Record<string, unknown>;
}
