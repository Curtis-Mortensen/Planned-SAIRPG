/**
 * Game Phase State Machine Types
 * 
 * These types define the core state machine that orchestrates
 * player actions through validation, meta events, and resolution.
 */

// The phases a player action can be in
export const GAME_PHASES = [
  "idle",
  "validating",
  "meta_proposal",
  "meta_review", 
  "probability_roll",
  "in_meta_event",
  "in_combat",
  "resolving_action",
] as const;

export type GamePhase = (typeof GAME_PHASES)[number];

// Which phases block new player input
export const BLOCKING_PHASES: readonly GamePhase[] = [
  "validating",
  "meta_proposal",
  "probability_roll",
] as const;

// Which phases allow player input (but route it differently)
export const INPUT_ALLOWED_PHASES: readonly GamePhase[] = [
  "idle",
  "meta_review",        // Accept/reject buttons, not free text
  "in_meta_event",      // Player can respond within event
  "in_combat",          // Combat actions
  "resolving_action",   // Original action resolving
] as const;

// Meta event types
export const META_EVENT_TYPES = [
  "encounter",    // Meeting someone/something
  "discovery",    // Finding something
  "hazard",       // Danger or obstacle
  "opportunity",  // Chance for benefit
] as const;

export type MetaEventType = (typeof META_EVENT_TYPES)[number];

// Severity levels
export const SEVERITY_LEVELS = ["minor", "moderate", "major"] as const;
export type SeverityLevel = (typeof SEVERITY_LEVELS)[number];

// Player decisions on proposed events
export const PLAYER_DECISIONS = ["accepted", "rejected"] as const;
export type PlayerDecision = (typeof PLAYER_DECISIONS)[number];

// Valid phase transitions (from -> to[])
export const VALID_TRANSITIONS: Record<GamePhase, readonly GamePhase[]> = {
  idle: ["validating"],
  validating: ["idle", "meta_proposal"],  // idle if validation fails
  meta_proposal: ["meta_review"],
  meta_review: ["meta_proposal", "probability_roll"],  // proposal if regenerate
  probability_roll: ["in_meta_event", "resolving_action"],  // resolving if no events triggered
  in_meta_event: ["in_meta_event", "in_combat", "resolving_action"],  // loop through events
  in_combat: ["in_meta_event", "resolving_action"],  // back to event or done
  resolving_action: ["idle"],  // cycle complete
} as const;

// The context needed to determine behavior
export interface GameStateContext {
  gameId: string;
  chatId: string;
  currentPhase: GamePhase;
  pendingActionId: string | null;
  isInMetaEvent: boolean;
  isInCombat: boolean;
}
