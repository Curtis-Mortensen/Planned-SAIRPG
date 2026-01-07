# State Machine Foundation - Implementation Spec

## Overview

This document provides implementation instructions for the **Game Phase State Machine** - the core orchestration layer that tracks where the player is in the action lifecycle. This must be built **before** the validator, meta event proposal, review UI, or probability systems.

---

## 1. Database Schema

### Migration File: `lib/db/migrations/00XX_game_phase_state_machine.sql`

```sql
-- Game Phase State Machine Tables
-- Run this migration to add pending action and meta event tracking

-- Ensure pgcrypto extension is available for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Enum types for game phases and meta event fields
CREATE TYPE "game_phase" AS ENUM (
  'idle',
  'validating', 
  'meta_proposal',
  'meta_review',
  'probability_roll',
  'in_meta_event',
  'in_combat',
  'resolving_action'
);

CREATE TYPE "meta_event_type" AS ENUM (
  'encounter',
  'discovery',
  'hazard',
  'opportunity'
);

CREATE TYPE "severity_level" AS ENUM (
  'minor',
  'moderate',
  'major'
);

CREATE TYPE "player_decision" AS ENUM (
  'accepted',
  'rejected'
);

-- Pending Actions: tracks the player's intended action through its lifecycle
-- NOTE: Removed currentEventIndex - use getNextUnresolvedEvent() instead to avoid drift
CREATE TABLE "PendingAction" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "gameId" uuid NOT NULL REFERENCES "GameSession"("id") ON DELETE CASCADE,
  "chatId" uuid NOT NULL REFERENCES "Chat"("id") ON DELETE CASCADE,
  "originalInput" text NOT NULL,
  "timeEstimate" varchar(50),
  "phase" game_phase NOT NULL DEFAULT 'validating',
  "createdAt" timestamp NOT NULL DEFAULT NOW(),
  "updatedAt" timestamp NOT NULL DEFAULT NOW(),
  "completedAt" timestamp
);

-- MetaEvent: individual events proposed/triggered for a pending action
CREATE TABLE "MetaEvent" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "pendingActionId" uuid NOT NULL REFERENCES "PendingAction"("id") ON DELETE CASCADE,
  "sequenceNum" integer NOT NULL DEFAULT 0,
  "type" meta_event_type NOT NULL,
  "title" varchar(255) NOT NULL,
  "description" text NOT NULL,
  "probability" real NOT NULL CHECK ("probability" >= 0 AND "probability" <= 1),
  "severity" severity_level NOT NULL,
  "triggersCombat" boolean NOT NULL DEFAULT false,
  "timeImpact" varchar(50),
  "playerDecision" player_decision,
  "rollResult" real CHECK ("rollResult" IS NULL OR ("rollResult" >= 0 AND "rollResult" <= 1)),
  "triggered" boolean,
  "resolvedAt" timestamp,
  "createdAt" timestamp NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX "PendingAction_gameId_idx" ON "PendingAction"("gameId");
CREATE INDEX "PendingAction_chatId_idx" ON "PendingAction"("chatId");
CREATE INDEX "PendingAction_phase_idx" ON "PendingAction"("phase");
CREATE INDEX "MetaEvent_pendingActionId_idx" ON "MetaEvent"("pendingActionId");

-- Unique constraint: only one active (non-completed) pending action per game
CREATE UNIQUE INDEX "PendingAction_active_per_game" 
  ON "PendingAction"("gameId") 
  WHERE "completedAt" IS NULL;

-- Unique constraint: prevent duplicate sequence numbers per pending action
CREATE UNIQUE INDEX "MetaEvent_sequence_unique"
  ON "MetaEvent" ("pendingActionId", "sequenceNum");
```

---

## 2. Schema Definition

### Update: `lib/db/schema.ts`

Add these table definitions after the existing tables:

```typescript
import { 
  pgTable, 
  uuid, 
  text, 
  varchar, 
  timestamp, 
  integer, 
  real, 
  boolean,
  pgEnum,
  uniqueIndex,
  index,
  check,
} from "drizzle-orm/pg-core";
import type { InferSelectModel } from "drizzle-orm";

// ... existing imports and tables ...

// =============================================================================
// GAME PHASE STATE MACHINE
// =============================================================================

export const gamePhaseEnum = pgEnum("game_phase", [
  "idle",
  "validating",
  "meta_proposal", 
  "meta_review",
  "probability_roll",
  "in_meta_event",
  "in_combat",
  "resolving_action",
]);

export const metaEventTypeEnum = pgEnum("meta_event_type", [
  "encounter",
  "discovery",
  "hazard",
  "opportunity",
]);

export const severityLevelEnum = pgEnum("severity_level", [
  "minor",
  "moderate",
  "major",
]);

export const playerDecisionEnum = pgEnum("player_decision", [
  "accepted",
  "rejected",
]);

export const pendingAction = pgTable(
  "PendingAction",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    gameId: uuid("gameId")
      .notNull()
      .references(() => gameSession.id, { onDelete: "cascade" }),
    chatId: uuid("chatId")
      .notNull()
      .references(() => chat.id, { onDelete: "cascade" }),
    originalInput: text("originalInput").notNull(),
    timeEstimate: varchar("timeEstimate", { length: 50 }),
    phase: gamePhaseEnum("phase").notNull().default("validating"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
    completedAt: timestamp("completedAt"),
  },
  (table) => [
    index("PendingAction_gameId_idx").on(table.gameId),
    index("PendingAction_chatId_idx").on(table.chatId),
    index("PendingAction_phase_idx").on(table.phase),
  ]
);

export type PendingAction = InferSelectModel<typeof pendingAction>;

export const metaEvent = pgTable(
  "MetaEvent",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    pendingActionId: uuid("pendingActionId")
      .notNull()
      .references(() => pendingAction.id, { onDelete: "cascade" }),
    sequenceNum: integer("sequenceNum").notNull().default(0),
    type: metaEventTypeEnum("type").notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description").notNull(),
    probability: real("probability").notNull(),
    severity: severityLevelEnum("severity").notNull(),
    triggersCombat: boolean("triggersCombat").notNull().default(false),
    timeImpact: varchar("timeImpact", { length: 50 }),
    playerDecision: playerDecisionEnum("playerDecision"),
    rollResult: real("rollResult"),
    triggered: boolean("triggered"),
    resolvedAt: timestamp("resolvedAt"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => [
    index("MetaEvent_pendingActionId_idx").on(table.pendingActionId),
    // Note: CHECK constraints for probability and rollResult ranges are defined in migration
    // Drizzle doesn't support CHECK constraints directly in schema definitions
  ]
);

export type MetaEvent = InferSelectModel<typeof metaEvent>;
```

---

## 3. TypeScript Types

### New File: `lib/game-state/types.ts`

```typescript
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
```

---

## 4. State Machine Logic

### New File: `lib/game-state/state-machine.ts`

```typescript
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

/**
 * Applies a phase transition, returning the new context
 * Throws if the transition is invalid
 */
export function transitionPhase(
  context: GameStateContext,
  newPhase: GamePhase
): GameStateContext {
  if (!isValidTransition(context.currentPhase, newPhase)) {
    throw new Error(
      `Invalid phase transition: ${context.currentPhase} -> ${newPhase}`
    );
  }

  return {
    ...context,
    currentPhase: newPhase,
    isInMetaEvent: newPhase === "in_meta_event",
    isInCombat: newPhase === "in_combat",
  };
}
```

---

## 5. Database Queries

### Update: `lib/db/queries.ts`

Add these functions at the end of the file:

```typescript
import { and, eq, isNull, desc, asc } from "drizzle-orm";
import { pendingAction, metaEvent } from "./schema";
import type { GamePhase } from "@/lib/game-state/types";

// =============================================================================
// PENDING ACTION QUERIES
// =============================================================================

/**
 * Get the active (non-completed) pending action for a game
 * There should only ever be one active pending action per game
 */
export async function getActivePendingAction(gameId: string) {
  const [result] = await db
    .select()
    .from(pendingAction)
    .where(
      and(
        eq(pendingAction.gameId, gameId),
        isNull(pendingAction.completedAt)
      )
    )
    .limit(1);
  return result ?? null;
}

/**
 * Get a pending action by ID
 */
export async function getPendingActionById(id: string) {
  const [result] = await db
    .select()
    .from(pendingAction)
    .where(eq(pendingAction.id, id))
    .limit(1);
  return result ?? null;
}

/**
 * Create a new pending action
 * Throws if there's already an active pending action for this game
 */
export async function createPendingAction({
  gameId,
  chatId,
  originalInput,
  timeEstimate,
  phase = "validating",
}: {
  gameId: string;
  chatId: string;
  originalInput: string;
  timeEstimate?: string;
  phase?: GamePhase;
}) {
  const [result] = await db
    .insert(pendingAction)
    .values({
      gameId,
      chatId,
      originalInput,
      timeEstimate,
      phase,
    })
    .returning();
  return result;
}

/**
 * Update a pending action's phase
 */
export async function updatePendingActionPhase(
  id: string,
  phase: GamePhase
) {
  const [result] = await db
    .update(pendingAction)
    .set({ 
      phase, 
      updatedAt: new Date() 
    })
    .where(eq(pendingAction.id, id))
    .returning();
  return result;
}

/**
 * Mark a pending action as completed
 */
export async function completePendingAction(id: string) {
  const [result] = await db
    .update(pendingAction)
    .set({ 
      phase: "idle" as GamePhase,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(pendingAction.id, id))
    .returning();
  return result;
}

/**
 * Get the current game phase for a game
 * Returns "idle" if no active pending action
 */
export async function getCurrentGamePhase(gameId: string): Promise<GamePhase> {
  const active = await getActivePendingAction(gameId);
  return active?.phase ?? "idle";
}

// =============================================================================
// META EVENT QUERIES
// =============================================================================

/**
 * Get all meta events for a pending action, ordered by sequence
 */
export async function getMetaEventsByPendingAction(pendingActionId: string) {
  return db
    .select()
    .from(metaEvent)
    .where(eq(metaEvent.pendingActionId, pendingActionId))
    .orderBy(asc(metaEvent.sequenceNum));
}

/**
 * Get triggered (but not yet resolved) meta events
 */
export async function getTriggeredUnresolvedEvents(pendingActionId: string) {
  return db
    .select()
    .from(metaEvent)
    .where(
      and(
        eq(metaEvent.pendingActionId, pendingActionId),
        eq(metaEvent.triggered, true),
        isNull(metaEvent.resolvedAt)
      )
    )
    .orderBy(asc(metaEvent.sequenceNum));
}

/**
 * Get the next unresolved event for a pending action
 * Returns the first triggered but unresolved event by sequence number
 * This avoids drift issues from using an index counter
 */
export async function getNextUnresolvedEvent(pendingActionId: string) {
  const [result] = await db
    .select()
    .from(metaEvent)
    .where(
      and(
        eq(metaEvent.pendingActionId, pendingActionId),
        eq(metaEvent.triggered, true),
        isNull(metaEvent.resolvedAt)
      )
    )
    .orderBy(asc(metaEvent.sequenceNum))
    .limit(1);
  return result ?? null;
}

/**
 * Create a meta event (used by meta event proposal module)
 */
export async function createMetaEvent({
  pendingActionId,
  sequenceNum,
  type,
  title,
  description,
  probability,
  severity,
  triggersCombat = false,
  timeImpact,
}: {
  pendingActionId: string;
  sequenceNum: number;
  type: string;
  title: string;
  description: string;
  probability: number;
  severity: string;
  triggersCombat?: boolean;
  timeImpact?: string;
}) {
  const [result] = await db
    .insert(metaEvent)
    .values({
      pendingActionId,
      sequenceNum,
      type,
      title,
      description,
      probability,
      severity,
      triggersCombat,
      timeImpact,
    })
    .returning();
  return result;
}

/**
 * Update a meta event's player decision (accept/reject)
 */
export async function updateMetaEventDecision(
  id: string,
  playerDecision: "accepted" | "rejected"
) {
  const [result] = await db
    .update(metaEvent)
    .set({ playerDecision })
    .where(eq(metaEvent.id, id))
    .returning();
  return result;
}

/**
 * Update a meta event after probability roll
 */
export async function updateMetaEventRoll(
  id: string,
  rollResult: number,
  triggered: boolean
) {
  const [result] = await db
    .update(metaEvent)
    .set({ rollResult, triggered })
    .where(eq(metaEvent.id, id))
    .returning();
  return result;
}

/**
 * Mark a meta event as resolved
 */
export async function resolveMetaEvent(id: string) {
  const [result] = await db
    .update(metaEvent)
    .set({ resolvedAt: new Date() })
    .where(eq(metaEvent.id, id))
    .returning();
  return result;
}

/**
 * Delete all meta events for a pending action (for regeneration)
 */
export async function deleteMetaEventsByPendingAction(pendingActionId: string) {
  await db
    .delete(metaEvent)
    .where(eq(metaEvent.pendingActionId, pendingActionId));
}
```

---

## 6. Chat Route Phase Gate

### Update: `app/(chat)/api/chat/route.ts`

Add this phase checking logic near the beginning of the POST handler, after authentication:

```typescript
import { 
  getActivePendingAction, 
  getCurrentGamePhase,
  getGameByChatId,
} from "@/lib/db/queries";
import { isPhaseBlocking } from "@/lib/game-state/state-machine";

// Inside POST handler, after auth check and before processing:

export async function POST(request: Request) {
  // ... existing auth code ...

  // Phase gate: check if the game is in a blocking phase
  const game = await getGameByChatId(chatId);
  if (game) {
    const currentPhase = await getCurrentGamePhase(game.id);
    
    if (isPhaseBlocking(currentPhase)) {
      return Response.json(
        { 
          error: true, 
          errorCode: "PHASE_BLOCKED",
          errorMessage: "Please wait while processing...",
          currentPhase,
        },
        { status: 409 } // Conflict
      );
    }

    // Get active pending action for context
    const activePendingAction = await getActivePendingAction(game.id);
    
    // If in meta_review phase, don't process as normal chat
    // The review UI handles this separately
    if (currentPhase === "meta_review") {
      return Response.json(
        {
          error: true,
          errorCode: "IN_META_REVIEW",
          errorMessage: "Please review the proposed events first.",
          pendingActionId: activePendingAction?.id,
        },
        { status: 409 }
      );
    }

    // If in_meta_event, we process but with different context
    // (The narrator knows we're resolving an event, not starting fresh)
    // NOTE: Cannot mutate request.headers in Next.js - use a context object instead
    const routeContext = {
      inMetaEvent: currentPhase === "in_meta_event",
      pendingActionId: activePendingAction?.id ?? null,
    };
    
    // Pass routeContext into your narrator/module handler functions
    // This will be used to build the Narrator Context appropriately
  }

  // ... rest of existing chat route code ...
}
```

---

## 7. Game Store Updates

### Update: `lib/stores/game-store.ts`

Add phase tracking state:

```typescript
import type { GamePhase } from "@/lib/game-state/types";

interface GameState {
  // ... existing state ...

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
    (set, get) => ({
      // ... existing state ...

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
    }),
    {
      name: "sairpg-game-store",
      partialize: (state) => ({
        // ... existing persisted state ...
        // NOTE: Do NOT persist phase state - it should be fetched from DB on load
      }),
    }
  )
);
```

---

## 8. Phase Sync Hook

### New File: `hooks/use-game-phase.ts`

```typescript
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
```

---

## 9. Phase API Endpoint

### New File: `app/api/game/[gameId]/phase/route.ts`

```typescript
import { auth } from "@/app/(auth)/auth";
import { 
  getActivePendingAction, 
  getCurrentGamePhase,
  getGameById,
} from "@/lib/db/queries";

export async function GET(
  request: Request,
  { params }: { params: { gameId: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { gameId } = params;
  
  // CRITICAL: Verify user has access to this game
  const game = await getGameById(gameId);
  if (!game) {
    return Response.json({ error: "Game not found" }, { status: 404 });
  }
  
  // Check if user owns or has access to this game
  // Adjust this check based on your game ownership/access model
  if (game.userId !== session.user.id) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  
  const phase = await getCurrentGamePhase(gameId);
  const pendingAction = await getActivePendingAction(gameId);

  return Response.json({
    phase,
    pendingActionId: pendingAction?.id ?? null,
    originalInput: pendingAction?.originalInput ?? null,
  });
}
```

---

## 10. Important Notes and Recommendations

### Critical Fixes Applied

1. **Removed `currentEventIndex` from `PendingAction` table**
   - **Problem**: Using an index counter with a filtered list (unresolved events) causes drift - when events resolve, the array shrinks but the index doesn't adjust, leading to skipped/repeated events.
   - **Solution**: Use `getNextUnresolvedEvent()` query instead, which always returns the first unresolved event by sequence number. This is derived from the data, not tracked separately.

2. **Fixed request headers mutation in chat route**
   - **Problem**: `request.headers.set()` doesn't work in Next.js route handlers - headers are immutable.
   - **Solution**: Create a `routeContext` object and pass it into downstream handler functions.

3. **Added authorization check to phase endpoint**
   - **Problem**: Only checked if user was logged in, not if they had access to the specific game.
   - **Solution**: Verify game exists and user has access before returning phase data.

### Strongly Recommended (Applied)

4. **Added database constraints and enums**
   - Added `CHECK` constraints for `probability` (0-1) and `rollResult` (0-1 or NULL)
   - Created enums for `meta_event_type`, `severity_level`, and `player_decision` to enforce valid values at the database level
   - Added unique constraint on `(pendingActionId, sequenceNum)` to prevent duplicate sequences

5. **Added pgcrypto extension check**
   - Migration now includes `CREATE EXTENSION IF NOT EXISTS pgcrypto;` to ensure `gen_random_uuid()` works

### Future Considerations

6. **Regeneration audit history**
   - Current implementation deletes events on regeneration (`deleteMetaEventsByPendingAction()`)
   - **Future improvement**: Consider adding a `generation` column instead of deleting, to preserve audit trail:
     - Add `generation integer not null default 0` to `MetaEvent`
     - When regenerating, increment generation and insert new rows
     - Queries filter by max generation for active events
     - This preserves debuggability and history

7. **`getNextPhase()` regenerate handling**
   - Updated to accept `reviewOutcome?: "confirm" | "regenerate"` parameter
   - Properly handles the regenerate flow: `meta_review -> meta_proposal`

8. **Polling during `meta_review` phase**
   - Current implementation only polls during blocking phases
   - Consider polling during `meta_review` as well if multiple tabs need to stay in sync
   - Or migrate to SSE/WebSocket for real-time updates

9. **`idle` phase consideration**
   - Currently "idle" means both "no active pending action" and "completed pending action with phase idle"
   - Some teams prefer removing `idle` from the enum and treating "no active pending action" as the only representation
   - Current approach is fine, but worth noting for future refactoring

---

## 11. File Structure Summary

```
lib/
├── game-state/
│   ├── types.ts              # GamePhase, MetaEventType, etc.
│   └── state-machine.ts      # Transition logic, helpers
├── db/
│   ├── schema.ts             # Add pendingAction, metaEvent tables
│   ├── queries.ts            # Add CRUD functions
│   └── migrations/
│       └── 00XX_game_phase_state_machine.sql

app/
├── api/
│   └── game/
│       └── [gameId]/
│           └── phase/
│               └── route.ts  # GET current phase

hooks/
└── use-game-phase.ts         # Client-side phase sync

(updates)
├── app/(chat)/api/chat/route.ts  # Phase gate logic
└── lib/stores/game-store.ts      # Phase state in store
```

---

## 12. Implementation Checklist

1. [ ] Create migration file and run migration
2. [ ] Add table definitions to `schema.ts`
3. [ ] Create `lib/game-state/types.ts`
4. [ ] Create `lib/game-state/state-machine.ts`
5. [ ] Add query functions to `queries.ts`
6. [ ] Create `app/api/game/[gameId]/phase/route.ts`
7. [ ] Create `hooks/use-game-phase.ts`
8. [ ] Update `game-store.ts` with phase state
9. [ ] Add phase gate to chat route
10. [ ] Run `pnpm typecheck` to verify no type errors

---

## 13. Testing Checklist

After implementation, verify:

- [ ] Migration runs without errors (including pgcrypto extension)
- [ ] Can create a pending action via query function
- [ ] Can update pending action phase
- [ ] Unique constraint prevents multiple active pending actions
- [ ] Unique constraint prevents duplicate sequence numbers per pending action
- [ ] `getCurrentGamePhase` returns "idle" when no active action
- [ ] `isValidTransition` correctly validates transitions
- [ ] `getNextUnresolvedEvent` returns first unresolved event correctly
- [ ] `getNextUnresolvedEvent` returns null when all events resolved
- [ ] Phase API endpoint returns correct data
- [ ] Phase API endpoint requires proper authorization (403/404 for unauthorized access)
- [ ] Chat route blocks input during blocking phases
- [ ] Chat route creates routeContext object (doesn't mutate headers)
- [ ] Game store phase state updates correctly
- [ ] Database constraints reject invalid probability/rollResult values
- [ ] Database enums reject invalid type/severity/decision values

---

This is the foundational layer. Once implemented, the validator, meta event proposal, review UI, and probability modules will all build on these types and functions.

```sql
-- NOTE: This is a reference copy. See Section 1 for the full migration with all fixes applied.
-- Key changes from original:
-- - Added pgcrypto extension
-- - Added enums for meta_event_type, severity_level, player_decision
-- - Removed currentEventIndex from PendingAction
-- - Added CHECK constraints for probability and rollResult
-- - Added unique constraint on (pendingActionId, sequenceNum)
```

```typescript
import { 
  pgTable, 
  uuid, 
  text, 
  varchar, 
  timestamp, 
  integer, 
  real, 
  boolean,
  pgEnum,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import type { InferSelectModel } from "drizzle-orm";

// ... existing imports and tables ...

// =============================================================================
// GAME PHASE STATE MACHINE
// =============================================================================

export const gamePhaseEnum = pgEnum("game_phase", [
  "idle",
  "validating",
  "meta_proposal", 
  "meta_review",
  "probability_roll",
  "in_meta_event",
  "in_combat",
  "resolving_action",
]);

export const pendingAction = pgTable(
  "PendingAction",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    gameId: uuid("gameId")
      .notNull()
      .references(() => gameSession.id, { onDelete: "cascade" }),
    chatId: uuid("chatId")
      .notNull()
      .references(() => chat.id, { onDelete: "cascade" }),
    originalInput: text("originalInput").notNull(),
    timeEstimate: varchar("timeEstimate", { length: 50 }),
    phase: gamePhaseEnum("phase").notNull().default("validating"),
    currentEventIndex: integer("currentEventIndex").notNull().default(0),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
    completedAt: timestamp("completedAt"),
  },
  (table) => [
    index("PendingAction_gameId_idx").on(table.gameId),
    index("PendingAction_chatId_idx").on(table.chatId),
    index("PendingAction_phase_idx").on(table.phase),
  ]
);

export type PendingAction = InferSelectModel<typeof pendingAction>;

export const metaEvent = pgTable(
  "MetaEvent",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    pendingActionId: uuid("pendingActionId")
      .notNull()
      .references(() => pendingAction.id, { onDelete: "cascade" }),
    sequenceNum: integer("sequenceNum").notNull().default(0),
    type: varchar("type", { length: 50 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description").notNull(),
    probability: real("probability").notNull(),
    severity: varchar("severity", { length: 20 }).notNull(),
    triggersCombat: boolean("triggersCombat").notNull().default(false),
    timeImpact: varchar("timeImpact", { length: 50 }),
    playerDecision: varchar("playerDecision", { length: 20 }),
    rollResult: real("rollResult"),
    triggered: boolean("triggered"),
    resolvedAt: timestamp("resolvedAt"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => [
    index("MetaEvent_pendingActionId_idx").on(table.pendingActionId),
  ]
);

export type MetaEvent = InferSelectModel<typeof metaEvent>;
```

```typescript
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
```

```typescript
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

/**
 * Applies a phase transition, returning the new context
 * Throws if the transition is invalid
 */
export function transitionPhase(
  context: GameStateContext,
  newPhase: GamePhase
): GameStateContext {
  if (!isValidTransition(context.currentPhase, newPhase)) {
    throw new Error(
      `Invalid phase transition: ${context.currentPhase} -> ${newPhase}`
    );
  }

  return {
    ...context,
    currentPhase: newPhase,
    isInMetaEvent: newPhase === "in_meta_event",
    isInCombat: newPhase === "in_combat",
  };
}
```

```typescript
import { and, eq, isNull, desc, asc } from "drizzle-orm";
import { pendingAction, metaEvent } from "./schema";
import type { GamePhase } from "@/lib/game-state/types";

// =============================================================================
// PENDING ACTION QUERIES
// =============================================================================

/**
 * Get the active (non-completed) pending action for a game
 * There should only ever be one active pending action per game
 */
export async function getActivePendingAction(gameId: string) {
  const [result] = await db
    .select()
    .from(pendingAction)
    .where(
      and(
        eq(pendingAction.gameId, gameId),
        isNull(pendingAction.completedAt)
      )
    )
    .limit(1);
  return result ?? null;
}

/**
 * Get a pending action by ID
 */
export async function getPendingActionById(id: string) {
  const [result] = await db
    .select()
    .from(pendingAction)
    .where(eq(pendingAction.id, id))
    .limit(1);
  return result ?? null;
}

/**
 * Create a new pending action
 * Throws if there's already an active pending action for this game
 */
export async function createPendingAction({
  gameId,
  chatId,
  originalInput,
  timeEstimate,
  phase = "validating",
}: {
  gameId: string;
  chatId: string;
  originalInput: string;
  timeEstimate?: string;
  phase?: GamePhase;
}) {
  const [result] = await db
    .insert(pendingAction)
    .values({
      gameId,
      chatId,
      originalInput,
      timeEstimate,
      phase,
    })
    .returning();
  return result;
}

/**
 * Update a pending action's phase
 */
export async function updatePendingActionPhase(
  id: string,
  phase: GamePhase
) {
  const [result] = await db
    .update(pendingAction)
    .set({ 
      phase, 
      updatedAt: new Date() 
    })
    .where(eq(pendingAction.id, id))
    .returning();
  return result;
}

/**
 * Mark a pending action as completed
 */
export async function completePendingAction(id: string) {
  const [result] = await db
    .update(pendingAction)
    .set({ 
      phase: "idle" as GamePhase,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(pendingAction.id, id))
    .returning();
  return result;
}

/**
 * Get the current game phase for a game
 * Returns "idle" if no active pending action
 */
export async function getCurrentGamePhase(gameId: string): Promise<GamePhase> {
  const active = await getActivePendingAction(gameId);
  return active?.phase ?? "idle";
}

// =============================================================================
// META EVENT QUERIES
// =============================================================================

/**
 * Get all meta events for a pending action, ordered by sequence
 */
export async function getMetaEventsByPendingAction(pendingActionId: string) {
  return db
    .select()
    .from(metaEvent)
    .where(eq(metaEvent.pendingActionId, pendingActionId))
    .orderBy(asc(metaEvent.sequenceNum));
}

/**
 * Get triggered (but not yet resolved) meta events
 */
export async function getTriggeredUnresolvedEvents(pendingActionId: string) {
  return db
    .select()
    .from(metaEvent)
    .where(
      and(
        eq(metaEvent.pendingActionId, pendingActionId),
        eq(metaEvent.triggered, true),
        isNull(metaEvent.resolvedAt)
      )
    )
    .orderBy(asc(metaEvent.sequenceNum));
}

/**
 * Get the next unresolved event for a pending action
 * Returns the first triggered but unresolved event by sequence number
 * This avoids drift issues from using an index counter
 */
export async function getNextUnresolvedEvent(pendingActionId: string) {
  const [result] = await db
    .select()
    .from(metaEvent)
    .where(
      and(
        eq(metaEvent.pendingActionId, pendingActionId),
        eq(metaEvent.triggered, true),
        isNull(metaEvent.resolvedAt)
      )
    )
    .orderBy(asc(metaEvent.sequenceNum))
    .limit(1);
  return result ?? null;
}

/**
 * Create a meta event (used by meta event proposal module)
 */
export async function createMetaEvent({
  pendingActionId,
  sequenceNum,
  type,
  title,
  description,
  probability,
  severity,
  triggersCombat = false,
  timeImpact,
}: {
  pendingActionId: string;
  sequenceNum: number;
  type: string;
  title: string;
  description: string;
  probability: number;
  severity: string;
  triggersCombat?: boolean;
  timeImpact?: string;
}) {
  const [result] = await db
    .insert(metaEvent)
    .values({
      pendingActionId,
      sequenceNum,
      type,
      title,
      description,
      probability,
      severity,
      triggersCombat,
      timeImpact,
    })
    .returning();
  return result;
}

/**
 * Update a meta event's player decision (accept/reject)
 */
export async function updateMetaEventDecision(
  id: string,
  playerDecision: "accepted" | "rejected"
) {
  const [result] = await db
    .update(metaEvent)
    .set({ playerDecision })
    .where(eq(metaEvent.id, id))
    .returning();
  return result;
}

/**
 * Update a meta event after probability roll
 */
export async function updateMetaEventRoll(
  id: string,
  rollResult: number,
  triggered: boolean
) {
  const [result] = await db
    .update(metaEvent)
    .set({ rollResult, triggered })
    .where(eq(metaEvent.id, id))
    .returning();
  return result;
}

/**
 * Mark a meta event as resolved
 */
export async function resolveMetaEvent(id: string) {
  const [result] = await db
    .update(metaEvent)
    .set({ resolvedAt: new Date() })
    .where(eq(metaEvent.id, id))
    .returning();
  return result;
}

/**
 * Delete all meta events for a pending action (for regeneration)
 */
export async function deleteMetaEventsByPendingAction(pendingActionId: string) {
  await db
    .delete(metaEvent)
    .where(eq(metaEvent.pendingActionId, pendingActionId));
}
```

```typescript
import { 
  getActivePendingAction, 
  getCurrentGamePhase,
  getGameByChatId,
} from "@/lib/db/queries";
import { isPhaseBlocking } from "@/lib/game-state/state-machine";

// Inside POST handler, after auth check and before processing:

export async function POST(request: Request) {
  // ... existing auth code ...

  // Phase gate: check if the game is in a blocking phase
  const game = await getGameByChatId(chatId);
  if (game) {
    const currentPhase = await getCurrentGamePhase(game.id);
    
    if (isPhaseBlocking(currentPhase)) {
      return Response.json(
        { 
          error: true, 
          errorCode: "PHASE_BLOCKED",
          errorMessage: "Please wait while processing...",
          currentPhase,
        },
        { status: 409 } // Conflict
      );
    }

    // Get active pending action for context
    const activePendingAction = await getActivePendingAction(game.id);
    
    // If in meta_review phase, don't process as normal chat
    // The review UI handles this separately
    if (currentPhase === "meta_review") {
      return Response.json(
        {
          error: true,
          errorCode: "IN_META_REVIEW",
          errorMessage: "Please review the proposed events first.",
          pendingActionId: activePendingAction?.id,
        },
        { status: 409 }
      );
    }

    // If in_meta_event, we process but with different context
    // (The narrator knows we're resolving an event, not starting fresh)
    // NOTE: Cannot mutate request.headers in Next.js - use a context object instead
    const routeContext = {
      inMetaEvent: currentPhase === "in_meta_event",
      pendingActionId: activePendingAction?.id ?? null,
    };
    
    // Pass routeContext into your narrator/module handler functions
    // This will be used to build the Narrator Context appropriately
  }

  // ... rest of existing chat route code ...
}
```

```typescript
import type { GamePhase } from "@/lib/game-state/types";

interface GameState {
  // ... existing state ...

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
    (set, get) => ({
      // ... existing state ...

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
    }),
    {
      name: "sairpg-game-store",
      partialize: (state) => ({
        // ... existing persisted state ...
        // NOTE: Do NOT persist phase state - it should be fetched from DB on load
      }),
    }
  )
);
```

```typescript
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
```

```typescript
import { auth } from "@/app/(auth)/auth";
import { 
  getActivePendingAction, 
  getCurrentGamePhase,
  getGameById,
} from "@/lib/db/queries";

export async function GET(
  request: Request,
  { params }: { params: { gameId: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { gameId } = params;
  
  // CRITICAL: Verify user has access to this game
  const game = await getGameById(gameId);
  if (!game) {
    return Response.json({ error: "Game not found" }, { status: 404 });
  }
  
  // Check if user owns or has access to this game
  // Adjust this check based on your game ownership/access model
  if (game.userId !== session.user.id) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  
  const phase = await getCurrentGamePhase(gameId);
  const pendingAction = await getActivePendingAction(gameId);

  return Response.json({
    phase,
    pendingActionId: pendingAction?.id ?? null,
    originalInput: pendingAction?.originalInput ?? null,
  });
}
```

```plaintext
lib/
├── game-state/
│   ├── types.ts              # GamePhase, MetaEventType, etc.
│   └── state-machine.ts      # Transition logic, helpers
├── db/
│   ├── schema.ts             # Add pendingAction, metaEvent tables
│   ├── queries.ts            # Add CRUD functions
│   └── migrations/
│       └── 00XX_game_phase_state_machine.sql

app/
├── api/
│   └── game/
│       └── [gameId]/
│           └── phase/
│               └── route.ts  # GET current phase

hooks/
└── use-game-phase.ts         # Client-side phase sync

(updates)
├── app/(chat)/api/chat/route.ts  # Phase gate logic
└── lib/stores/game-store.ts      # Phase state in store
```

