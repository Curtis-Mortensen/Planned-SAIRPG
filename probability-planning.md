# Probability & Dice Rolling System - Implementation Spec

## Overview

This document specifies the dice rolling system that integrates with the **Game Phase State Machine** from `intercept_system_design.md`. The system follows a "prompt and roll" model:

1. **System Prompting**: During the **`probability_roll` phase**, the game explicitly prompts the player in the chat to perform specific dice rolls for each accepted meta event.
2. **Explanation**: Each prompt includes a clear explanation of what the numbers mean (e.g., "Roll a D20; a result of 1-6 triggers this event").
3. **Dice Roller Icon**: A dedicated icon in the UI (outside the chat) allows the player to open a **Dice Roller Tool** in the context window.
4. **Physical or Digital**: Players can roll physical dice at home and enter the result, or use the interactive digital roller in the context window.
5. **Outcome Resolution**: Once the result is entered (via the tool), the game system determines the outcome and transitions to the next phase.

The system supports both manual entry of physical rolls and digital generation, providing flexibility for different play styles.

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
│  3. Game prompts player in CHAT (Narrator/System message)                   │
│     ┌─────────────────────────────────────────────────────────────┐        │
│     │  "I need you to roll for 'Rustling in the Bushes'.          │        │
│     │   Please roll a D20.                                        │        │
│     │                                                             │        │
│     │   EXPLANATION: In this game, low numbers trigger events.    │        │
│     │   If you roll 1-6 (30% chance), the event triggers.         │        │
│     │   If you roll 7-20, you avoid it."                          │        │
│     └─────────────────────────────────────────────────────────────┘        │
│                                                                             │
│  4. Player opens DICE ROLLER via the icon in the Context Window             │
│                                                                             │
│  5. Player rolls (physical or digital) and enters result in Tool UI         │
│                                                                             │
│  6. After ALL rolls complete:                                               │
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

## 5. Dice Roll Input Model

The system moves away from chat-intercepted dice graphics and instead use a dedicated **Dice Roller Tool** in the context window.

### Part 1: Game Prompting
When the game requires a roll (e.g., during the `probability_roll` phase), the Narrator or System will send a standard text message to the chat.

**Example Prompt:**
> "The forest grows silent as you approach the clearing. I need you to roll for the 'Rustling in the Bushes' event.
> 
> **Please roll a D20.**
> 
> *Explanation: This event has a 30% chance of triggering. If you roll between 1 and 6, the event occurs. If you roll 7 or higher, you remain undetected.*"

### Part 2: Dice Roller Icon
A dice icon is located in the chat interface toolbar or sidebar. Clicking this icon opens the **Dice Roller** in the context window (Artifacts/Right Panel).

---

## 6. UI Integration

### Update: `components/multimodal-input.tsx`
Add a dice icon button to the input toolbar that toggles the dice roller artifact.

```typescript
import { DiceIcon } from "@/components/dice/dice-icon";
import { useUIStore } from "@/lib/stores/ui-store";

// Inside the toolbar:
<Button
  variant="ghost"
  size="icon"
  onClick={() => setArtifactVisibility("dice-roller", true)}
  title="Open Dice Roller"
>
  <DiceIcon type="d20" size={20} />
</Button>
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

## 8. Dice Roller Artifact (Context Window)

Instead of individual chat messages, the dice roller exists as a persistent tool in the context window.

### File: `components/artifacts/dice-roller.tsx`

```typescript
"use client";

import { useState } from "react";
import type { DiceType, DiceRollState, DiceRollPurpose } from "@/lib/dice/types";
import { DICE_MAX_VALUES, getValidResults } from "@/lib/dice/types";
import { DiceIcon } from "@/components/dice/dice-icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The Dice Roller Artifact handles:
 * 1. Visualizing the dice to be rolled
 * 2. Manual entry of physical roll results
 * 3. Digital rolling (optional helper)
 * 4. Displaying the explanation of the current required roll
 */
export function DiceRollerArtifact({
  roll,                      // Current active DiceRoll record
  onResult,                  // Callback when result is confirmed
}: {
  roll?: DiceRoll;
  onResult: (result: number) => Promise<void>;
}) {
  const [selectedResult, setSelectedResult] = useState<number | null>(null);
  const [isRolling, setIsRolling] = useState(false);

  if (!roll) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center text-muted-foreground">
        <DiceIcon type="d20" size={64} className="mb-4 opacity-20" />
        <p>No active roll requested.</p>
        <p className="text-sm">The game will prompt you when a roll is needed.</p>
      </div>
    );
  }

  const diceType = roll.diceType as DiceType;
  const maxValue = DICE_MAX_VALUES[diceType];
  const validResults = getValidResults(diceType);

  const handleDigitalRoll = () => {
    setIsRolling(true);
    // Simulate dice rolling animation
    setTimeout(() => {
      const result = Math.floor(Math.random() * maxValue) + 1;
      setSelectedResult(result);
      setIsRolling(false);
    }, 600);
  };

  return (
    <div className="flex flex-col h-full bg-background p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <DiceIcon type={diceType} size={32} />
          Roll {diceType.toUpperCase()}
        </h2>
        {roll.context && (
          <p className="text-muted-foreground mt-2">{roll.context}</p>
        )}
      </div>

      {/* Explanation for Meta Events */}
      {roll.purpose === "meta_event" && roll.threshold && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 mb-6">
          <p className="text-sm">
            <strong>Threshold: {roll.threshold}</strong>
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            To trigger this event, you need to roll <strong>1 through {roll.threshold}</strong>.
            A result of {roll.threshold + 1} or higher means the event is avoided.
          </p>
        </div>
      )}

      {/* Entry Method: Digital or Manual */}
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-2 gap-4 mb-8">
          <Button 
            variant="outline" 
            className="h-24 flex flex-col gap-2"
            onClick={handleDigitalRoll}
            disabled={isRolling}
          >
            <span className="text-xl">🎲</span>
            Roll Digital
          </Button>
          <div className="h-24 border rounded-lg flex flex-col items-center justify-center bg-muted/30">
            <span className="text-xs text-muted-foreground font-medium uppercase">Result</span>
            <span className="text-3xl font-mono font-bold">
              {isRolling ? "..." : selectedResult ?? "--"}
            </span>
          </div>
        </div>

        <div className="space-y-4">
          <label className="text-xs font-semibold text-muted-foreground uppercase">
            Manual Entry (Physical Dice)
          </label>
          <div className="grid grid-cols-5 gap-2">
            {validResults.map((num) => (
              <Button
                key={num}
                variant={selectedResult === num ? "default" : "outline"}
                size="sm"
                className="font-bold"
                onClick={() => setSelectedResult(num)}
              >
                {num}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="p-4 border-t mt-auto">
        <Button 
          className="w-full h-12 text-lg" 
          disabled={selectedResult === null || isRolling}
          onClick={() => onResult(selectedResult!)}
        >
          Confirm Result
        </Button>
      </div>
    </div>
  );
}
```
## 9. Probability Roll Phase UI Integration

During the `probability_roll` phase, the main gameplay area provides a summary of progress, while the Dice Roller Artifact handles the input.

### File: `components/play/probability-roll-status.tsx`

```typescript
"use client";

import { useUIStore } from "@/lib/stores/ui-store";

/**
 * Status indicator shown in the chat area during probability_roll phase
 */
export function ProbabilityRollStatus({ 
  pendingCount, 
  completedCount 
}: { 
  pendingCount: number;
  completedCount: number;
}) {
  const { setArtifactVisibility } = useUIStore();

  return (
    <div className="flex flex-col items-center gap-2 p-4 border rounded-xl bg-muted/20 my-4">
      <div className="text-sm font-medium">
        Dice Roll Required ({completedCount} / {completedCount + pendingCount} completed)
      </div>
      <Button 
        size="sm" 
        onClick={() => setArtifactVisibility("dice-roller", true)}
      >
        Open Dice Roller
      </Button>
    </div>
  );
}
```

---

## 10. API Endpoints

The API remains consistent for managing the `DiceRoll` records.

### POST `/api/dice/roll`
Creates a new freeform dice roll request.

### POST `/api/dice/roll/[rollId]/result`
Submits the player's dice roll result.
1. Updates the `DiceRoll` record state to `completed`.
2. Creates an `EventLog` entry with `eventType: "dice_roll_result"`.
   - **Payload**: `{ rollId, result, diceType, purpose, context, threshold, triggered }`
3. For `meta_event` rolls, this invokes `processMetaEventRollResult` to update the state machine.

---

## 11. File Structure Summary

```
lib/dice/
├── types.ts                        # DiceType, DiceRoll, validation, threshold conversion
└── probability-roll-handler.ts     # Meta event roll orchestration

components/dice/
├── dice-icon.tsx                   # SVG icons for each dice type
└── quick-roll-buttons.tsx          # Toolbar buttons for quick rolls

components/artifacts/
└── dice-roller.tsx                 # Full-screen/Sidebar artifact for rolling

components/play/
└── probability-roll-status.tsx      # Inline status for the phase

hooks/
└── use-dice-roll.ts                # Hook for creating dice rolls

lib/db/
├── schema.ts                       # Add diceRoll table
├── queries.ts                      # Add dice roll CRUD
└── migrations/
    └── 00XX_dice_rolls.sql         # Migration

(updates)
├── components/multimodal-input.tsx # Add Dice Icon to open artifact
└── components/play/play-chat.tsx   # Show status & ensure artifact is open during phase
```

---

## 12. Implementation Checklist

1. [ ] Create `lib/dice/types.ts` with threshold conversion
2. [ ] Create `lib/dice/probability-roll-handler.ts`
3. [ ] Create database migration for DiceRoll table
4. [ ] Add diceRoll to `lib/db/schema.ts`
5. [ ] Add dice roll queries to `lib/db/queries.ts`
6. [ ] Create `components/dice/dice-icon.tsx`
7. [ ] Create `components/artifacts/dice-roller.tsx`
8. [ ] Create `components/play/probability-roll-status.tsx`
9. [ ] Create API routes for dice rolls
10. [ ] Implement `EventLog` recording for completed dice rolls
11. [ ] Update `components/multimodal-input.tsx` to include the Dice Roller icon
12. [ ] Update `components/play/play-chat.tsx` to integrate the phase status

---

## 13. Testing Checklist

**System Prompting:**
- [ ] Transitioning to `probability_roll` phase sends a narrator message explaining the roll and the numbers.

**Dice Roller Tool:**
- [ ] Clicking the Dice Icon opens the artifact in the context window.
- [ ] Digital "Roll" button generates a random number with animation.
- [ ] Manual entry buttons allow selecting physical results.
- [ ] "Confirm Result" updates the database and moves to the next roll or phase.
- [ ] Confirming a roll creates a new entry in the Event Log with the correct details.

---

## 14. Key Design Decisions

### Manual vs Digital?
We provide both. Physical dice maintain the tabletop feel, but digital rollers provide accessibility and convenience.

### Why Context Window?
Keeping the roller in the context window prevents it from cluttering the chat history while allowing the player to refer back to the Narrator's explanation in the chat while rolling.

### Meta Event Explanation
Every roll prompt must explain what "Success" and "Failure" mean for that specific roll, especially since "rolling low" (triggering an event) might be counter-intuitive to players used to "rolling high" for success.

### Event Logging
Since dice rolls are critical to the game's narrative and state, every result (whether physical or digital) must be recorded in the persistent `EventLog`. This allows for debugging, replayability, and potentially auditing "hot streaks" or unusual probability distributions in long-running games.

