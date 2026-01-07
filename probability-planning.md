# Probability & Dice Rolling System - Implementation Spec

## Overview

This document specifies the dice rolling system that integrates with the **Game Phase State Machine** from `intercept_system_design.md`. The system allows players to:

1. Type "roll a d6" (or d4, d8, d10, d12, d20) in chat for **freeform rolls**
2. Roll dice during the **`probability_roll` phase** to determine which meta events trigger
3. See dice graphics appear in chat (intercepted, not sent to LLM)
4. Enter the result of their physical dice roll at home
5. Have that result used by the game system to determine outcomes

The player rolls **physical dice** at home and reports the result. The system does NOT auto-generate random numbers.

---

## Integration with State Machine

This system connects to the state machine defined in `intercept_system_design.md`:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         GAME PHASE STATE MACHINE                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ... earlier phases ...                                                     │
│                                                                             │
│                                 ┌────────────────┐                          │
│                                 │  META_REVIEW   │                          │
│                                 │ (player sees   │                          │
│                                 │  events)       │                          │
│                                 └───────┬────────┘                          │
│                                         │ (accept)                          │
│                                         ▼                                   │
│                                 ┌────────────────┐                          │
│                                 │ PROBABILITY    │  ◀── THIS DOCUMENT       │
│                                 │ ROLL           │      Player rolls dice   │
│                                 │ (player rolls  │      for each accepted   │
│                                 │  for events)   │      meta event          │
│                                 └───────┬────────┘                          │
│                                         │                                   │
│                         ┌───────────────┴───────────────┐                   │
│                         ▼                               ▼                   │
│                 ┌────────────────┐             ┌────────────────┐           │
│                 │ IN_META_EVENT  │             │ RESOLVING      │           │
│                 │ (triggered     │             │ ACTION         │           │
│                 │  events play)  │             │ (no events)    │           │
│                 └────────────────┘             └────────────────┘           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Two Use Cases

| Use Case | Trigger | Phase | Purpose |
|----------|---------|-------|---------|
| **Freeform Roll** | Player types "roll a d6" | Any (usually `idle`) | General-purpose dice rolls |
| **Meta Event Roll** | System requests during `probability_roll` | `probability_roll` only | Determines which accepted events trigger |

---

## 1. Dice Types

### File: `lib/dice/types.ts`

```typescript
/**
 * Supported D&D-style dice types
 */
export const DICE_TYPES = ["d4", "d6", "d8", "d10", "d12", "d20"] as const;
export type DiceType = (typeof DICE_TYPES)[number];

/**
 * Maps dice type to its max value
 */
export const DICE_MAX_VALUES: Record<DiceType, number> = {
  d4: 4,
  d6: 6,
  d8: 8,
  d10: 10,
  d12: 12,
  d20: 20,
};

/**
 * Gets valid results for a dice type (1 to max)
 */
export function getValidResults(diceType: DiceType): number[] {
  const max = DICE_MAX_VALUES[diceType];
  return Array.from({ length: max }, (_, i) => i + 1);
}

/**
 * Validates that a result is valid for the given dice type
 */
export function isValidResult(diceType: DiceType, result: number): boolean {
  return result >= 1 && result <= DICE_MAX_VALUES[diceType] && Number.isInteger(result);
}

/**
 * State of a dice roll request
 */
export type DiceRollState = 
  | "pending"      // Waiting for player to enter result
  | "completed"    // Player has entered result
  | "cancelled";   // Roll was cancelled

/**
 * Purpose of a dice roll
 */
export type DiceRollPurpose = 
  | "freeform"           // Player-initiated, general purpose
  | "meta_event";        // System-initiated for meta event probability

/**
 * A dice roll request stored in the system
 */
export interface DiceRoll {
  id: string;
  gameId: string;
  chatId: string;
  diceType: DiceType;
  state: DiceRollState;
  result: number | null;
  
  // Purpose and context
  purpose: DiceRollPurpose;
  context?: string;                   // Display text for why roll was requested
  
  // For meta_event rolls - links to the event being rolled for
  pendingActionId?: string;           // The parent pending action
  metaEventId?: string;               // The specific meta event this roll determines
  threshold?: number;                 // Roll <= threshold = event triggers
  
  createdAt: Date;
  completedAt: Date | null;
}

/**
 * Convert a probability (0.0-1.0) to dice threshold
 * Uses d20 as the standard dice for meta event probability
 * 
 * Examples:
 *   0.20 (20%) -> d20, threshold 4 (roll 1-4 triggers)
 *   0.35 (35%) -> d20, threshold 7 (roll 1-7 triggers)
 *   0.50 (50%) -> d20, threshold 10 (roll 1-10 triggers)
 */
export function probabilityToThreshold(probability: number): { diceType: DiceType; threshold: number } {
  // Clamp probability to valid range
  const clamped = Math.max(0, Math.min(1, probability));
  // Convert to d20 threshold (round to nearest integer)
  const threshold = Math.round(clamped * 20);
  return {
    diceType: "d20",
    threshold: Math.max(1, Math.min(20, threshold)), // Ensure 1-20 range
  };
}

/**
 * Determine if an event triggers based on roll result and threshold
 */
export function doesEventTrigger(rollResult: number, threshold: number): boolean {
  return rollResult <= threshold;
}
```

---

## 2. Database Schema Updates

### Migration: `lib/db/migrations/00XX_dice_rolls.sql`

```sql
-- Dice Rolls table
-- Stores both freeform and meta-event-related dice rolls
CREATE TABLE "DiceRoll" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "gameId" uuid NOT NULL REFERENCES "GameSession"("id") ON DELETE CASCADE,
  "chatId" uuid NOT NULL REFERENCES "Chat"("id") ON DELETE CASCADE,
  "diceType" varchar(10) NOT NULL,  -- 'd4', 'd6', etc.
  "state" varchar(20) NOT NULL DEFAULT 'pending',  -- 'pending', 'completed', 'cancelled'
  "result" integer,  -- The player's reported result (1-N based on dice type)
  
  -- Purpose and context
  "purpose" varchar(20) NOT NULL DEFAULT 'freeform',  -- 'freeform' or 'meta_event'
  "context" text,  -- Display text for why roll was requested
  
  -- For meta_event rolls - links to state machine
  "pendingActionId" uuid REFERENCES "PendingAction"("id") ON DELETE CASCADE,
  "metaEventId" uuid REFERENCES "MetaEvent"("id") ON DELETE CASCADE,
  "threshold" integer,  -- Roll <= threshold = event triggers
  
  "createdAt" timestamp NOT NULL DEFAULT NOW(),
  "completedAt" timestamp
);

CREATE INDEX "DiceRoll_gameId_idx" ON "DiceRoll"("gameId");
CREATE INDEX "DiceRoll_chatId_idx" ON "DiceRoll"("chatId");
CREATE INDEX "DiceRoll_state_idx" ON "DiceRoll"("state");
CREATE INDEX "DiceRoll_pendingActionId_idx" ON "DiceRoll"("pendingActionId");
CREATE INDEX "DiceRoll_metaEventId_idx" ON "DiceRoll"("metaEventId");
```

### Update: `lib/db/schema.ts`

```typescript
export const diceRoll = pgTable(
  "DiceRoll",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    gameId: uuid("gameId")
      .notNull()
      .references(() => gameSession.id, { onDelete: "cascade" }),
    chatId: uuid("chatId")
      .notNull()
      .references(() => chat.id, { onDelete: "cascade" }),
    diceType: varchar("diceType", { length: 10 }).notNull(),
    state: varchar("state", { length: 20 }).notNull().default("pending"),
    result: integer("result"),
    
    // Purpose and context
    purpose: varchar("purpose", { length: 20 }).notNull().default("freeform"),
    context: text("context"),
    
    // For meta_event rolls
    pendingActionId: uuid("pendingActionId")
      .references(() => pendingAction.id, { onDelete: "cascade" }),
    metaEventId: uuid("metaEventId")
      .references(() => metaEvent.id, { onDelete: "cascade" }),
    threshold: integer("threshold"),
    
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    completedAt: timestamp("completedAt"),
  },
  (table) => [
    index("DiceRoll_gameId_idx").on(table.gameId),
    index("DiceRoll_chatId_idx").on(table.chatId),
    index("DiceRoll_state_idx").on(table.state),
    index("DiceRoll_pendingActionId_idx").on(table.pendingActionId),
    index("DiceRoll_metaEventId_idx").on(table.metaEventId),
  ]
);

export type DiceRoll = InferSelectModel<typeof diceRoll>;
```

---

## 3. Database Queries

### Update: `lib/db/queries.ts`

```typescript
import { diceRoll } from "./schema";
import type { DiceType, DiceRollState, DiceRollPurpose } from "@/lib/dice/types";

// =============================================================================
// DICE ROLL QUERIES
// =============================================================================

/**
 * Create a freeform dice roll (player-initiated)
 */
export async function createFreeformDiceRoll({
  gameId,
  chatId,
  diceType,
  context,
}: {
  gameId: string;
  chatId: string;
  diceType: DiceType;
  context?: string;
}) {
  const [result] = await db
    .insert(diceRoll)
    .values({
      gameId,
      chatId,
      diceType,
      purpose: "freeform",
      context,
      state: "pending",
    })
    .returning();
  return result;
}

/**
 * Create a meta event dice roll (system-initiated during probability_roll phase)
 */
export async function createMetaEventDiceRoll({
  gameId,
  chatId,
  diceType,
  pendingActionId,
  metaEventId,
  threshold,
  context,
}: {
  gameId: string;
  chatId: string;
  diceType: DiceType;
  pendingActionId: string;
  metaEventId: string;
  threshold: number;
  context: string;
}) {
  const [result] = await db
    .insert(diceRoll)
    .values({
      gameId,
      chatId,
      diceType,
      purpose: "meta_event",
      pendingActionId,
      metaEventId,
      threshold,
      context,
      state: "pending",
    })
    .returning();
  return result;
}

/**
 * Get a dice roll by ID
 */
export async function getDiceRollById(id: string) {
  const [result] = await db
    .select()
    .from(diceRoll)
    .where(eq(diceRoll.id, id))
    .limit(1);
  return result ?? null;
}

/**
 * Update dice roll with player's result
 */
export async function updateDiceRollResult(id: string, result: number) {
  const [updated] = await db
    .update(diceRoll)
    .set({
      result,
      state: "completed" as DiceRollState,
      completedAt: new Date(),
    })
    .where(eq(diceRoll.id, id))
    .returning();
  return updated;
}

/**
 * Cancel a dice roll
 */
export async function cancelDiceRoll(id: string) {
  const [updated] = await db
    .update(diceRoll)
    .set({
      state: "cancelled" as DiceRollState,
      completedAt: new Date(),
    })
    .where(eq(diceRoll.id, id))
    .returning();
  return updated;
}

/**
 * Get pending dice rolls for a pending action (during probability_roll phase)
 */
export async function getPendingMetaEventRolls(pendingActionId: string) {
  return db
    .select()
    .from(diceRoll)
    .where(
      and(
        eq(diceRoll.pendingActionId, pendingActionId),
        eq(diceRoll.purpose, "meta_event"),
        eq(diceRoll.state, "pending")
      )
    )
    .orderBy(asc(diceRoll.createdAt));
}

/**
 * Get the dice roll for a specific meta event
 */
export async function getDiceRollByMetaEvent(metaEventId: string) {
  const [result] = await db
    .select()
    .from(diceRoll)
    .where(eq(diceRoll.metaEventId, metaEventId))
    .limit(1);
  return result ?? null;
}

/**
 * Check if all meta event rolls are completed for a pending action
 */
export async function areAllMetaEventRollsComplete(pendingActionId: string): Promise<boolean> {
  const pending = await getPendingMetaEventRolls(pendingActionId);
  return pending.length === 0;
}
```

---

## 4. Probability Roll Phase Flow

When the game enters `probability_roll` phase, the following happens:

### Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    PROBABILITY_ROLL PHASE FLOW                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. Player confirms events in META_REVIEW phase                             │
│     └─▶ Phase transitions to PROBABILITY_ROLL                               │
│                                                                             │
│  2. System creates DiceRoll records for each ACCEPTED meta event            │
│     ┌─────────────────────────────────────────────────────────────┐        │
│     │ For each accepted MetaEvent:                                 │        │
│     │   - Convert probability (0.0-1.0) to d20 threshold          │        │
│     │   - Create DiceRoll with purpose: "meta_event"              │        │
│     │   - Link to pendingActionId and metaEventId                 │        │
│     └─────────────────────────────────────────────────────────────┘        │
│                                                                             │
│  3. System displays all pending rolls in chat (sequentially)                │
│     ┌─────────────────────────────────────────────────────────────┐        │
│     │  🎲 Roll for: Rustling in the Bushes                        │        │
│     │  Roll D20 - Event triggers on 1-6 (30% chance)              │        │
│     │  [Enter your result: 1-20]                                  │        │
│     └─────────────────────────────────────────────────────────────┘        │
│                                                                             │
│  4. Player rolls physical dice and enters result for EACH event             │
│                                                                             │
│  5. After ALL rolls complete:                                               │
│     - Update each MetaEvent with rollResult and triggered status            │
│     - Transition to IN_META_EVENT (if any triggered) or RESOLVING_ACTION    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Implementation: `lib/dice/probability-roll-handler.ts`

```typescript
import { 
  getMetaEventsByPendingAction,
  createMetaEventDiceRoll,
  updateMetaEventRoll,
  areAllMetaEventRollsComplete,
  getDiceRollByMetaEvent,
} from "@/lib/db/queries";
import { probabilityToThreshold, doesEventTrigger } from "./types";
import type { MetaEvent } from "@/lib/db/schema";

/**
 * Creates dice roll requests for all accepted meta events
 * Called when entering the probability_roll phase
 */
export async function initiateProbabilityRolls({
  gameId,
  chatId,
  pendingActionId,
}: {
  gameId: string;
  chatId: string;
  pendingActionId: string;
}): Promise<void> {
  // Get all accepted meta events for this pending action
  const events = await getMetaEventsByPendingAction(pendingActionId);
  const acceptedEvents = events.filter(e => e.playerDecision === "accepted");
  
  // Create a dice roll for each accepted event
  for (const event of acceptedEvents) {
    const { diceType, threshold } = probabilityToThreshold(event.probability);
    
    await createMetaEventDiceRoll({
      gameId,
      chatId,
      diceType,
      pendingActionId,
      metaEventId: event.id,
      threshold,
      context: `Roll for: ${event.title} (${Math.round(event.probability * 100)}% chance)`,
    });
  }
}

/**
 * Process a completed dice roll and update the meta event
 * Called when player submits a roll result
 */
export async function processMetaEventRollResult({
  diceRollId,
  result,
}: {
  diceRollId: string;
  result: number;
}): Promise<{ triggered: boolean; allComplete: boolean }> {
  const roll = await getDiceRollById(diceRollId);
  
  if (!roll || roll.purpose !== "meta_event" || !roll.metaEventId || !roll.threshold) {
    throw new Error("Invalid meta event roll");
  }
  
  // Determine if event triggers
  const triggered = doesEventTrigger(result, roll.threshold);
  
  // Update the meta event with the roll result
  await updateMetaEventRoll(roll.metaEventId, result, triggered);
  
  // Check if all rolls are complete
  const allComplete = await areAllMetaEventRollsComplete(roll.pendingActionId!);
  
  return { triggered, allComplete };
}

/**
 * Get the next pending dice roll for display
 */
export async function getNextPendingRoll(pendingActionId: string) {
  const pendingRolls = await getPendingMetaEventRolls(pendingActionId);
  return pendingRolls[0] ?? null;
}
```

---

## 5. Dice Roll Command Detection

The system must intercept messages that match "roll a d__" BEFORE they go to the LLM.

### File: `lib/dice/detect-dice-command.ts`

```typescript
import type { DiceType } from "./types";
import { DICE_TYPES } from "./types";

/**
 * Regex pattern to detect dice roll commands
 * Matches: "roll a d6", "roll d20", "roll a d4", etc.
 * Case insensitive
 */
const DICE_ROLL_PATTERN = /^roll\s+(?:a\s+)?(d(?:4|6|8|10|12|20))$/i;

/**
 * Checks if a message is a dice roll command
 * Returns the dice type if it is, null otherwise
 */
export function detectDiceCommand(message: string): DiceType | null {
  const trimmed = message.trim().toLowerCase();
  const match = trimmed.match(DICE_ROLL_PATTERN);
  
  if (!match) {
    return null;
  }
  
  const diceType = match[1].toLowerCase() as DiceType;
  
  // Verify it's a valid dice type (defensive)
  if (!DICE_TYPES.includes(diceType)) {
    return null;
  }
  
  return diceType;
}
```

---

## 6. Chat Intercept Integration

### Update: `components/multimodal-input.tsx`

In the `submitForm` function, add dice command detection:

```typescript
import { detectDiceCommand } from "@/lib/dice/detect-dice-command";
import { useGameStore } from "@/lib/stores/game-store";

// Inside the component:
const { currentPhase } = useGameStore();

// Inside submitForm callback, BEFORE calling sendMessage:
const submitForm = useCallback(() => {
  // Check if this is a dice roll command
  const diceType = detectDiceCommand(input);
  
  if (diceType) {
    // Only allow freeform rolls when NOT in probability_roll phase
    // During probability_roll, the UI handles it differently
    if (currentPhase === "probability_roll") {
      // Don't intercept - the probability roll UI handles this
      return;
    }
    
    // Don't send to LLM - handle locally as freeform roll
    handleFreeformDiceRoll(diceType, input);
    
    // Clear input and reset
    setAttachments([]);
    setLocalStorageInput("");
    resetHeight();
    setInput("");
    return; // Exit early - don't call sendMessage
  }
  
  // ... existing sendMessage logic ...
}, [/* deps including currentPhase */]);
```

---

## 7. Dice Graphic Components

### File: `components/dice/dice-icon.tsx`

SVG icons for each dice type. These are the visual representations.

```typescript
"use client";

import type { DiceType } from "@/lib/dice/types";
import { cn } from "@/lib/utils";

interface DiceIconProps {
  type: DiceType;
  className?: string;
  size?: number;
  // Show a specific value face-up (for completed rolls)
  value?: number;
}

/**
 * Renders an SVG icon for a dice type
 * Each dice has a distinct shape:
 * - d4: tetrahedron (triangle)
 * - d6: cube (square)
 * - d8: octahedron (diamond)
 * - d10: pentagonal trapezohedron (kite shape)
 * - d12: dodecahedron (pentagon)
 * - d20: icosahedron (triangle with more detail)
 */
export function DiceIcon({ type, className, size = 48, value }: DiceIconProps) {
  const baseClass = cn("inline-block", className);

  switch (type) {
    case "d4":
      return (
        <svg
          className={baseClass}
          fill="none"
          height={size}
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          viewBox="0 0 48 48"
          width={size}
        >
          <path d="M24 6 L42 40 L6 40 Z" />
          <path d="M24 6 L24 28" opacity={0.5} />
          <path d="M24 28 L42 40" opacity={0.5} />
          <path d="M24 28 L6 40" opacity={0.5} />
          {value && (
            <text dominantBaseline="middle" fill="currentColor" fontSize="14" textAnchor="middle" x="24" y="30">
              {value}
            </text>
          )}
        </svg>
      );

    case "d6":
      return (
        <svg className={baseClass} fill="none" height={size} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} viewBox="0 0 48 48" width={size}>
          <rect height="32" rx="4" width="32" x="8" y="8" />
          {value && (
            <text dominantBaseline="middle" fill="currentColor" fontSize="18" fontWeight="bold" textAnchor="middle" x="24" y="25">
              {value}
            </text>
          )}
        </svg>
      );

    case "d8":
      return (
        <svg className={baseClass} fill="none" height={size} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} viewBox="0 0 48 48" width={size}>
          <path d="M24 4 L44 24 L24 44 L4 24 Z" />
          <path d="M4 24 L44 24" opacity={0.5} />
          {value && (
            <text dominantBaseline="middle" fill="currentColor" fontSize="14" fontWeight="bold" textAnchor="middle" x="24" y="25">
              {value}
            </text>
          )}
        </svg>
      );

    case "d10":
      return (
        <svg className={baseClass} fill="none" height={size} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} viewBox="0 0 48 48" width={size}>
          <path d="M24 4 L40 18 L36 42 L12 42 L8 18 Z" />
          <path d="M24 4 L24 42" opacity={0.5} />
          {value && (
            <text dominantBaseline="middle" fill="currentColor" fontSize="14" fontWeight="bold" textAnchor="middle" x="24" y="28">
              {value}
            </text>
          )}
        </svg>
      );

    case "d12":
      return (
        <svg className={baseClass} fill="none" height={size} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} viewBox="0 0 48 48" width={size}>
          <path d="M24 6 L42 18 L36 40 L12 40 L6 18 Z" />
          {value && (
            <text dominantBaseline="middle" fill="currentColor" fontSize="14" fontWeight="bold" textAnchor="middle" x="24" y="27">
              {value}
            </text>
          )}
        </svg>
      );

    case "d20":
      return (
        <svg className={baseClass} fill="none" height={size} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} viewBox="0 0 48 48" width={size}>
          <path d="M24 4 L44 38 L4 38 Z" />
          <path d="M24 14 L34 28 L28 36 L20 36 L14 28 Z" opacity={0.5} />
          {value && (
            <text dominantBaseline="middle" fill="currentColor" fontSize="12" fontWeight="bold" textAnchor="middle" x="24" y="28">
              {value}
            </text>
          )}
        </svg>
      );

    default:
      return null;
  }
}
```

---

## 8. Dice Roll Chat Message Component

This component renders in the chat when a dice roll is requested.

### File: `components/dice/dice-roll-message.tsx`

```typescript
"use client";

import { useState } from "react";
import type { DiceType, DiceRollState, DiceRollPurpose } from "@/lib/dice/types";
import { DICE_MAX_VALUES, getValidResults } from "@/lib/dice/types";
import { DiceIcon } from "./dice-icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DiceRollMessageProps {
  rollId: string;
  diceType: DiceType;
  state: DiceRollState;
  result: number | null;
  purpose: DiceRollPurpose;
  context?: string;
  threshold?: number;  // For meta_event rolls - shows success threshold
  onSubmitResult: (rollId: string, result: number) => Promise<void>;
  onCancel?: (rollId: string) => Promise<void>;
}

/**
 * Renders a dice roll request in the chat
 * Shows dice graphic and result input when pending
 * Shows completed result when done
 */
export function DiceRollMessage({
  rollId,
  diceType,
  state,
  result,
  purpose,
  context,
  threshold,
  onSubmitResult,
  onCancel,
}: DiceRollMessageProps) {
  const [selectedResult, setSelectedResult] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validResults = getValidResults(diceType);
  const maxValue = DICE_MAX_VALUES[diceType];
  const isMetaEvent = purpose === "meta_event";

  const handleSubmit = async () => {
    if (selectedResult === null) return;
    
    setIsSubmitting(true);
    try {
      await onSubmitResult(rollId, selectedResult);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Completed state - show result with trigger indication for meta events
  if (state === "completed" && result !== null) {
    const triggered = isMetaEvent && threshold ? result <= threshold : null;
    
    return (
      <div className={cn(
        "flex items-center gap-3 rounded-lg border p-4",
        triggered === true && "border-green-500 bg-green-500/10",
        triggered === false && "border-muted bg-muted/30",
        triggered === null && "border-border bg-muted/30"
      )}>
        <DiceIcon 
          className={cn(
            triggered === true && "text-green-500",
            triggered === false && "text-muted-foreground",
            triggered === null && "text-primary"
          )}
          size={56} 
          type={diceType} 
          value={result} 
        />
        <div className="flex flex-col">
          <span className="text-muted-foreground text-sm">
            Rolled {diceType.toUpperCase()}
          </span>
          <span className="font-bold text-2xl">{result}</span>
          {context && (
            <span className="text-muted-foreground text-xs">{context}</span>
          )}
          {isMetaEvent && threshold && (
            <span className={cn(
              "text-sm font-medium",
              triggered ? "text-green-500" : "text-muted-foreground"
            )}>
              {triggered ? "✓ Event triggers!" : "✗ No trigger"}
              {" "}(needed ≤{threshold})
            </span>
          )}
        </div>
      </div>
    );
  }

  // Cancelled state
  if (state === "cancelled") {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-4 opacity-50">
        <DiceIcon className="text-muted-foreground" size={48} type={diceType} />
        <div className="flex flex-col">
          <span className="text-muted-foreground text-sm line-through">
            Roll {diceType.toUpperCase()}
          </span>
          <span className="text-muted-foreground text-xs">Cancelled</span>
        </div>
      </div>
    );
  }

  // Pending state - show input
  return (
    <div className={cn(
      "flex flex-col gap-4 rounded-lg border p-4 shadow-sm",
      isMetaEvent ? "border-amber-500/50 bg-amber-500/5" : "border-primary/50 bg-background"
    )}>
      {/* Header with dice icon */}
      <div className="flex items-center gap-3">
        <DiceIcon 
          className={cn("animate-pulse", isMetaEvent ? "text-amber-500" : "text-primary")}
          size={56} 
          type={diceType} 
        />
        <div className="flex flex-col">
          <span className="font-medium">Roll your {diceType.toUpperCase()}</span>
          {context ? (
            <span className="text-muted-foreground text-sm">{context}</span>
          ) : (
            <span className="text-muted-foreground text-sm">
              Roll at home and enter the result (1-{maxValue})
            </span>
          )}
          {isMetaEvent && threshold && (
            <span className="text-amber-600 text-xs font-medium">
              Event triggers on roll of 1-{threshold}
            </span>
          )}
        </div>
      </div>

      {/* Result selector - grid of buttons for each possible value */}
      <div className="flex flex-col gap-2">
        <span className="text-muted-foreground text-xs font-medium">
          What did you roll?
        </span>
        <div className={cn(
          "grid gap-2",
          maxValue <= 6 ? "grid-cols-6" : 
          maxValue <= 10 ? "grid-cols-5" : 
          maxValue <= 12 ? "grid-cols-6" : 
          "grid-cols-5"
        )}>
          {validResults.map((num) => {
            const wouldTrigger = isMetaEvent && threshold ? num <= threshold : null;
            return (
              <Button
                className={cn(
                  "h-10 w-full font-bold",
                  selectedResult === num && "ring-2 ring-primary ring-offset-2",
                  wouldTrigger === true && selectedResult !== num && "border-green-500/50",
                  wouldTrigger === false && selectedResult !== num && "border-muted"
                )}
                disabled={isSubmitting}
                key={num}
                onClick={() => setSelectedResult(num)}
                size="sm"
                variant={selectedResult === num ? "default" : "outline"}
              >
                {num}
              </Button>
            );
          })}
        </div>
      </div>

      {/* Submit button */}
      <div className="flex items-center gap-2">
        <Button
          className="flex-1"
          disabled={selectedResult === null || isSubmitting}
          onClick={handleSubmit}
        >
          {isSubmitting ? "Submitting..." : "Confirm Result"}
        </Button>
        {onCancel && !isMetaEvent && (
          <Button
            disabled={isSubmitting}
            onClick={() => onCancel(rollId)}
            variant="ghost"
          >
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}
```

---

## 9. Probability Roll Phase UI Component

A component that shows during the `probability_roll` phase, displaying all pending rolls.

### File: `components/play/probability-roll-phase.tsx`

```typescript
"use client";

import { useEffect, useState } from "react";
import { DiceRollMessage } from "@/components/dice/dice-roll-message";
import type { DiceRoll } from "@/lib/db/schema";

interface ProbabilityRollPhaseProps {
  pendingActionId: string;
  onAllRollsComplete: () => void;
}

/**
 * UI component for the probability_roll phase
 * Shows pending dice rolls for each accepted meta event
 */
export function ProbabilityRollPhase({
  pendingActionId,
  onAllRollsComplete,
}: ProbabilityRollPhaseProps) {
  const [pendingRolls, setPendingRolls] = useState<DiceRoll[]>([]);
  const [completedRolls, setCompletedRolls] = useState<DiceRoll[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch pending rolls on mount
  useEffect(() => {
    async function fetchRolls() {
      const response = await fetch(`/api/dice/pending/${pendingActionId}`);
      if (response.ok) {
        const data = await response.json();
        setPendingRolls(data.pending);
        setCompletedRolls(data.completed);
      }
      setLoading(false);
    }
    fetchRolls();
  }, [pendingActionId]);

  const handleSubmitResult = async (rollId: string, result: number) => {
    const response = await fetch(`/api/dice/roll/${rollId}/result`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ result }),
    });

    if (response.ok) {
      const data = await response.json();
      
      // Move from pending to completed
      setPendingRolls(prev => prev.filter(r => r.id !== rollId));
      setCompletedRolls(prev => [...prev, data.roll]);

      // Check if all complete
      if (data.allComplete) {
        onAllRollsComplete();
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <span className="text-muted-foreground">Loading dice rolls...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="text-center">
        <h3 className="font-semibold text-lg">Roll for Events</h3>
        <p className="text-muted-foreground text-sm">
          Roll your dice at home and enter the results below
        </p>
      </div>

      {/* Completed rolls */}
      {completedRolls.map((roll) => (
        <DiceRollMessage
          context={roll.context ?? undefined}
          diceType={roll.diceType as DiceType}
          key={roll.id}
          onSubmitResult={handleSubmitResult}
          purpose={roll.purpose as DiceRollPurpose}
          result={roll.result}
          rollId={roll.id}
          state={roll.state as DiceRollState}
          threshold={roll.threshold ?? undefined}
        />
      ))}

      {/* Current pending roll (show one at a time) */}
      {pendingRolls[0] && (
        <DiceRollMessage
          context={pendingRolls[0].context ?? undefined}
          diceType={pendingRolls[0].diceType as DiceType}
          key={pendingRolls[0].id}
          onSubmitResult={handleSubmitResult}
          purpose={pendingRolls[0].purpose as DiceRollPurpose}
          result={pendingRolls[0].result}
          rollId={pendingRolls[0].id}
          state={pendingRolls[0].state as DiceRollState}
          threshold={pendingRolls[0].threshold ?? undefined}
        />
      )}

      {/* Progress indicator */}
      {pendingRolls.length > 1 && (
        <div className="text-center text-muted-foreground text-sm">
          {completedRolls.length} of {completedRolls.length + pendingRolls.length} rolls complete
        </div>
      )}
    </div>
  );
}
```

---

## 10. API Endpoints

### File: `app/api/dice/roll/route.ts`

```typescript
import { auth } from "@/app/(auth)/auth";
import { createFreeformDiceRoll } from "@/lib/db/queries";
import { DICE_TYPES } from "@/lib/dice/types";

/**
 * POST /api/dice/roll
 * Creates a new freeform dice roll request
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { gameId, chatId, diceType, context } = await request.json();

  if (!DICE_TYPES.includes(diceType)) {
    return Response.json({ error: "Invalid dice type" }, { status: 400 });
  }

  const diceRoll = await createFreeformDiceRoll({
    gameId,
    chatId,
    diceType,
    context,
  });

  return Response.json(diceRoll);
}
```

### File: `app/api/dice/roll/[rollId]/result/route.ts`

```typescript
import { auth } from "@/app/(auth)/auth";
import { getDiceRollById, updateDiceRollResult } from "@/lib/db/queries";
import { isValidResult, DICE_MAX_VALUES } from "@/lib/dice/types";
import { processMetaEventRollResult } from "@/lib/dice/probability-roll-handler";

/**
 * POST /api/dice/roll/[rollId]/result
 * Submits the player's dice roll result
 */
export async function POST(
  request: Request,
  { params }: { params: { rollId: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { rollId } = params;
  const { result } = await request.json();

  const roll = await getDiceRollById(rollId);
  if (!roll) {
    return Response.json({ error: "Roll not found" }, { status: 404 });
  }

  if (roll.state !== "pending") {
    return Response.json({ error: "Roll already completed" }, { status: 400 });
  }

  if (!isValidResult(roll.diceType as DiceType, result)) {
    return Response.json({ 
      error: `Invalid result. Must be 1-${DICE_MAX_VALUES[roll.diceType as DiceType]}` 
    }, { status: 400 });
  }

  // Update the roll
  const updated = await updateDiceRollResult(rollId, result);

  // If this is a meta event roll, process it
  if (roll.purpose === "meta_event") {
    const { triggered, allComplete } = await processMetaEventRollResult({
      diceRollId: rollId,
      result,
    });
    
    return Response.json({ 
      roll: updated, 
      triggered,
      allComplete,
    });
  }

  return Response.json({ roll: updated });
}
```

### File: `app/api/dice/pending/[pendingActionId]/route.ts`

```typescript
import { auth } from "@/app/(auth)/auth";
import { getPendingMetaEventRolls } from "@/lib/db/queries";
import { diceRoll } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

/**
 * GET /api/dice/pending/[pendingActionId]
 * Gets all dice rolls for a pending action (pending and completed)
 */
export async function GET(
  request: Request,
  { params }: { params: { pendingActionId: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { pendingActionId } = params;
  
  const pending = await getPendingMetaEventRolls(pendingActionId);
  
  // Also get completed rolls for display
  const completed = await db
    .select()
    .from(diceRoll)
    .where(
      and(
        eq(diceRoll.pendingActionId, pendingActionId),
        eq(diceRoll.purpose, "meta_event"),
        eq(diceRoll.state, "completed")
      )
    )
    .orderBy(asc(diceRoll.completedAt));

  return Response.json({ pending, completed });
}
```

---

## 11. File Structure Summary

```
lib/dice/
├── types.ts                        # DiceType, DiceRoll, validation, threshold conversion
├── detect-dice-command.ts          # Regex detection for "roll a d__"
├── create-dice-message.ts          # Helper to create local messages
└── probability-roll-handler.ts     # Meta event roll orchestration

components/dice/
├── dice-icon.tsx                   # SVG icons for each dice type
├── dice-roll-message.tsx           # Chat message with result input
└── quick-roll-buttons.tsx          # Toolbar buttons for quick rolls

components/play/
└── probability-roll-phase.tsx      # UI for probability_roll phase

hooks/
└── use-dice-roll.ts                # Hook for creating dice rolls

app/api/dice/
├── roll/
│   └── route.ts                    # POST - create freeform dice roll
├── roll/[rollId]/
│   ├── result/
│   │   └── route.ts                # POST - submit result
│   └── cancel/
│       └── route.ts                # POST - cancel roll
└── pending/[pendingActionId]/
    └── route.ts                    # GET - get pending rolls for action

lib/db/
├── schema.ts                       # Add diceRoll table
├── queries.ts                      # Add dice roll CRUD
└── migrations/
    └── 00XX_dice_rolls.sql         # Migration

(updates)
├── components/message.tsx          # Handle dice-roll part type
├── components/multimodal-input.tsx # Intercept dice commands
├── components/play/play-chat.tsx   # Show probability-roll-phase when in that phase
└── lib/types.ts                    # Add DiceRollPart type
```

---

## 12. Integration with play-chat.tsx

### Update: `components/play/play-chat.tsx`

```typescript
import { ProbabilityRollPhase } from "./probability-roll-phase";
import { useGameStore } from "@/lib/stores/game-store";

// Inside the component:
const { currentPhase, pendingActionId } = useGameStore();

// In the render, conditionally show the probability roll UI:
{currentPhase === "probability_roll" && pendingActionId && (
  <ProbabilityRollPhase
    pendingActionId={pendingActionId}
    onAllRollsComplete={() => {
      // Trigger phase transition to next phase
      // This will be handled by the state machine / Inngest workflow
    }}
  />
)}
```

---

## 13. Implementation Checklist

1. [ ] Create `lib/dice/types.ts` with threshold conversion
2. [ ] Create `lib/dice/detect-dice-command.ts`
3. [ ] Create `lib/dice/probability-roll-handler.ts`
4. [ ] Create database migration for DiceRoll table (with FK to PendingAction/MetaEvent)
5. [ ] Add diceRoll to `lib/db/schema.ts`
6. [ ] Add dice roll queries to `lib/db/queries.ts`
7. [ ] Create `components/dice/dice-icon.tsx`
8. [ ] Create `components/dice/dice-roll-message.tsx` (with meta event support)
9. [ ] Create `components/play/probability-roll-phase.tsx`
10. [ ] Create API routes for dice rolls
11. [ ] Create `lib/dice/create-dice-message.ts`
12. [ ] Create `hooks/use-dice-roll.ts`
13. [ ] Update `lib/types.ts` with DiceRollPart
14. [ ] Update `components/message.tsx` to render dice rolls
15. [ ] Update `components/multimodal-input.tsx` to intercept commands
16. [ ] Update `components/play/play-chat.tsx` to show probability roll phase

---

## 14. Testing Checklist

After implementation, verify:

**Freeform Rolls:**
- [ ] Typing "roll a d6" creates a dice roll message (no LLM call)
- [ ] Typing "Roll a D20" works (case insensitive)
- [ ] Typing "roll d4" works (optional "a")
- [ ] Typing "roll a d7" does NOT match (invalid dice)
- [ ] Completed rolls show the result in the dice icon

**Meta Event Rolls (probability_roll phase):**
- [ ] Entering `probability_roll` phase creates dice rolls for each accepted event
- [ ] Dice rolls show threshold info ("Event triggers on roll of 1-6")
- [ ] Submitting result correctly determines if event triggers
- [ ] Completed rolls show trigger status with visual feedback
- [ ] All rolls completing transitions to next phase

**Integration:**
- [ ] Database records link correctly between DiceRoll, PendingAction, and MetaEvent
- [ ] Phase transitions work correctly after all rolls complete
- [ ] Freeform rolls blocked during probability_roll phase (or handled differently)

---

## 15. Key Design Decisions

### Why d20 for Meta Event Probability?
- Familiar to D&D players
- 5% increments (each number = 5% probability)
- Easy mental math: probability × 20 = threshold
- Example: 30% chance = roll 1-6 on d20

### Why Show One Roll at a Time?
- Prevents overwhelm when many events accepted
- Creates suspense/drama for each event
- Player focuses on one decision at a time
- Progress indicator shows remaining rolls

### Why Physical Dice?
- Maintains tabletop RPG feel
- Player agency and trust in their own rolls
- No concerns about "rigged" RNG
- Works offline/without internet
