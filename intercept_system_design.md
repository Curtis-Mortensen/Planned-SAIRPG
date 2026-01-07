# Meta event module system design
_Exported on 1/7/2026 at 10:41:10 MST from Cursor (2.2.44)_

---

**User**

I want you to plan out all of the code changes that are going to be necessary to create the meta event module. The module needs to... Suggest events every time the player submits an action. Okay. Okay, I think we actually need to have a layer of, System logic in between the user and the AI. The flow should look something like this. When the user loads a new game, they're asked what they want to do. If they submit something like gather wood, then the system needs to step in and intercept that. Gather wood needs to be sent to the validator and tick modules. And then that information is returned back to the system. Then the system needs to send. That to the meta event module which needs to return a. List of possible events that could happen to the player while they're trying to gather wood. The system then needs to display those events to the user with. A message something like. Awesome. Before you gather wood. Please review the following possible events that could happen. Then the player needs to go through the accept. Reject. Regenerate. Flow and the final accepted events need to be stored in. The database. Finally, after all of that is done, the. System needs to roll for probability and. Figure out which events happen to the player while they're trying to gather wood. Then the system needs to be able to go through those events with the player, and then and only then can the player actually attempt to roll for gathering wood. As the system is going through those events with the player. The system shouldn't create anymore meta events. However, the system needs a way to track. When the player has finished the gathering would events and actually tried to gather wood, because then afterwards the system needs to ask the user again what they want to do next and the whole cycle needs to repeat. I want you to talk with me about what that could look like, from a high level conceptual view. In addition, I want to build this system with future expandability so that we can eventually get it to trigger combat, which will be processed in another way, and have the system keep track of when we're inside and outside combat, the same way as when we're inside and outside the events happening in the story

---

**Cursor**

Let me explore your codebase to understand the current architecture before discussing the meta event module design.

Now I have a solid understanding of your system architecture. Let me put together a comprehensive conceptual plan for the Meta Event Module.

---

# Meta Event Module: High-Level Conceptual Design

## 1. The Core Problem

You need a **system orchestration layer** that intercepts player actions and manages a multi-phase flow before the action actually resolves. This isn't just about generating events—it's about creating a **state machine** that tracks where the player is in the action lifecycle.

## 2. The State Machine Concept

At the heart of this system is a **Game Phase State Machine**. Think of it like this:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         GAME PHASE STATE MACHINE                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────┐      ┌──────────────┐      ┌────────────────┐                │
│  │  IDLE    │──────▶  VALIDATING  │──────▶  META_PROPOSAL │                │
│  │ (awaiting│      │  (validator  │      │  (generating   │                │
│  │  input)  │      │   + tick)    │      │   events)      │                │
│  └──────────┘      └──────────────┘      └───────┬────────┘                │
│       ▲                                          │                          │
│       │                                          ▼                          │
│       │                                 ┌────────────────┐                  │
│       │                                 │  META_REVIEW   │◀─┐               │
│       │                                 │ (player sees   │  │ (regenerate)  │
│       │                                 │  events)       │──┘               │
│       │                                 └───────┬────────┘                  │
│       │                                         │ (accept)                  │
│       │                                         ▼                          │
│       │                                 ┌────────────────┐                  │
│       │                                 │ PROBABILITY    │                  │
│       │                                 │ ROLL           │                  │
│       │                                 │ (which events  │                  │
│       │                                 │  trigger?)     │                  │
│       │                                 └───────┬────────┘                  │
│       │                                         │                          │
│       │                         ┌───────────────┴───────────────┐          │
│       │                         ▼                               ▼          │
│       │                 ┌────────────────┐             ┌────────────────┐  │
│       │                 │ IN_META_EVENT  │             │ RESOLVING      │  │
│       │                 │ (playing thru  │──(loop)────▶│ ACTION         │  │
│       │                 │  triggered     │             │ (original      │  │
│       │                 │  events)       │             │  action)       │  │
│       │                 └────────────────┘             └───────┬────────┘  │
│       │                         │                              │           │
│       │                         │ (event requires combat)      │           │
│       │                         ▼                              │           │
│       │                 ┌────────────────┐                     │           │
│       │                 │  IN_COMBAT     │                     │           │
│       │                 │  (future)      │                     │           │
│       │                 └────────┬───────┘                     │           │
│       │                          │                             │           │
│       └──────────────────────────┴─────────────────────────────┘           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### State Definitions

| State | Description | Who's in Control |
|-------|-------------|------------------|
| `IDLE` | Waiting for player to submit an action | Player |
| `VALIDATING` | Running validator + tick modules | System |
| `META_PROPOSAL` | AI generating possible events | System |
| `META_REVIEW` | Player reviewing/accepting/rejecting events | Player |
| `PROBABILITY_ROLL` | System rolling dice for each accepted event | System |
| `IN_META_EVENT` | Playing through triggered events | Player + Narrator |
| `IN_COMBAT` | Combat subsystem active (future) | Player + Combat System |
| `RESOLVING_ACTION` | Finally resolving the original action | System + Narrator |

## 3. The "Pending Action" Pattern

The key insight is that when a player submits "gather wood", that action is **not executed immediately**. Instead:

```typescript
interface PendingAction {
  id: string;
  gameId: string;
  originalInput: string;           // "gather wood"
  validatedAt: Date;
  timeEstimate: TimeValue;         // From tick module
  phase: GamePhase;
  proposedEvents: MetaEvent[];     // Generated by meta module
  reviewedEvents: ReviewedEvent[]; // After accept/reject
  triggeredEvents: MetaEvent[];    // After probability roll
  currentEventIndex: number;       // Which event are we resolving?
  createdAt: Date;
}
```

This **pending action** persists until the entire flow completes.

## 4. Meta Event Structure

Each meta event generated by the AI should have:

```typescript
interface MetaEvent {
  id: string;
  type: MetaEventType;           // 'encounter', 'discovery', 'hazard', 'opportunity'
  title: string;                 // "Wandering Merchant"
  description: string;           // Brief description for player
  probability: number;           // 0.0 to 1.0 (suggested by AI)
  severity: 'minor' | 'moderate' | 'major';
  triggersCombat: boolean;       // Flag for future combat system
  timeImpact: TimeValue | null;  // Additional time if triggered
}

interface ReviewedEvent extends MetaEvent {
  playerDecision: 'accepted' | 'rejected';
  reviewedAt: Date;
}

interface TriggeredEvent extends MetaEvent {
  rollResult: number;            // The actual dice roll
  triggered: boolean;            // Did it happen?
  resolvedAt?: Date;
}
```

## 5. The Flow in Detail

### Phase 1: Validation (Already Planned)
Your validator-modules.md covers this. The action goes through:
1. Input validation (is it valid?)
2. Time estimation (how long will it take?)

### Phase 2: Meta Event Proposal

```
┌──────────────────────────────────────────────────────────────────────┐
│                    META EVENT PROPOSAL PHASE                         │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Input to Meta Event Module:                                         │
│  ┌────────────────────────────────────────────────────────────┐     │
│  │ • Player's intended action: "gather wood"                   │     │
│  │ • Time estimate: "2 hours"                                  │     │
│  │ • Current location context                                  │     │
│  │ • Current character state                                   │     │
│  │ • Recent story events                                       │     │
│  │ • World state (time of day, weather, etc.)                 │     │
│  └────────────────────────────────────────────────────────────┘     │
│                               │                                      │
│                               ▼                                      │
│                        ┌─────────────┐                               │
│                        │   META      │                               │
│                        │   EVENT     │                               │
│                        │   MODULE    │                               │
│                        │   (LLM)     │                               │
│                        └──────┬──────┘                               │
│                               │                                      │
│                               ▼                                      │
│  Output: 2-4 possible events                                        │
│  ┌────────────────────────────────────────────────────────────┐     │
│  │ 1. "You hear rustling in the bushes nearby"                │     │
│  │    - Type: encounter, Probability: 0.3, Severity: minor    │     │
│  │                                                             │     │
│  │ 2. "A merchant's cart passes by on the nearby road"        │     │
│  │    - Type: opportunity, Probability: 0.2, Severity: minor  │     │
│  │                                                             │     │
│  │ 3. "You find unusual mushrooms growing on a fallen log"    │     │
│  │    - Type: discovery, Probability: 0.4, Severity: minor    │     │
│  └────────────────────────────────────────────────────────────┘     │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### Phase 3: Player Review UI

This is crucial for player agency. The UI could look like:

```
┌──────────────────────────────────────────────────────────────────────┐
│  Before you gather wood, the following things might happen...        │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ ⚔️ Rustling in the Bushes                        [30% chance]│   │
│  │ You hear something moving in the undergrowth nearby.         │   │
│  │                                                               │   │
│  │ [ ✓ Accept ]  [ ✗ Reject ]                                   │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ 🛒 Passing Merchant                              [20% chance]│   │
│  │ A merchant's cart passes by on the nearby road.              │   │
│  │                                                               │   │
│  │ [ ✓ Accept ]  [ ✗ Reject ]                                   │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ 🍄 Unusual Discovery                             [40% chance]│   │
│  │ You find unusual mushrooms growing on a fallen log.          │   │
│  │                                                               │   │
│  │ [ ✓ Accept ]  [ ✗ Reject ]                                   │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  [ 🔄 Regenerate All ]       [ ▶️ Confirm & Continue ]        │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### Phase 4: Probability Roll

After acceptance, the system rolls for each accepted event:

```typescript
function rollForEvents(acceptedEvents: ReviewedEvent[]): TriggeredEvent[] {
  return acceptedEvents
    .filter(e => e.playerDecision === 'accepted')
    .map(event => {
      const roll = Math.random();
      return {
        ...event,
        rollResult: roll,
        triggered: roll <= event.probability,
      };
    });
}
```

### Phase 5: Event Resolution

For each triggered event (in order), the system:
1. Presents the event to the player
2. Lets the Narrator describe what happens
3. Allows player response/action within the event
4. **Does NOT generate new meta events during event resolution**
5. Marks event as resolved when complete

### Phase 6: Original Action Resolution

Only after all events are resolved does the player's original "gather wood" action actually execute through the Narrator.

## 6. Database Schema Additions

```sql
-- Pending Actions table
CREATE TABLE "PendingAction" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "gameId" uuid NOT NULL REFERENCES "GameSession"("id") ON DELETE CASCADE,
  "chatId" uuid NOT NULL REFERENCES "Chat"("id"),
  "originalInput" text NOT NULL,
  "timeEstimate" varchar(50),
  "phase" varchar(50) NOT NULL DEFAULT 'validating',
  "currentEventIndex" integer DEFAULT 0,
  "createdAt" timestamp NOT NULL DEFAULT NOW(),
  "updatedAt" timestamp NOT NULL DEFAULT NOW()
);

-- Meta Events table
CREATE TABLE "MetaEvent" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "pendingActionId" uuid NOT NULL REFERENCES "PendingAction"("id") ON DELETE CASCADE,
  "type" varchar(50) NOT NULL,        -- 'encounter', 'discovery', 'hazard', 'opportunity'
  "title" varchar(255) NOT NULL,
  "description" text NOT NULL,
  "probability" real NOT NULL,         -- 0.0 to 1.0
  "severity" varchar(20) NOT NULL,     -- 'minor', 'moderate', 'major'
  "triggersCombat" boolean DEFAULT false,
  "timeImpact" varchar(50),
  "playerDecision" varchar(20),        -- 'accepted', 'rejected', null
  "rollResult" real,                   -- The actual roll
  "triggered" boolean,                 -- Did it happen?
  "resolvedAt" timestamp,
  "createdAt" timestamp NOT NULL DEFAULT NOW()
);
```

## 7. Integration with Existing Architecture

Your existing Inngest workflow becomes more sophisticated:

```typescript
// lib/inngest/functions.ts - Enhanced

export const gameLoopWorkflow = inngest.createFunction(
  { id: 'game-loop-main' },
  { event: GameEvents.PLAYER_ACTION_SUBMITTED },
  async ({ event, step }) => {
    const { gameId, chatId, playerInput } = event.data;

    // Step 1: Validate input (existing)
    const validation = await step.run('validate-input', async () => {
      return await callValidatorModules(playerInput, context);
    });

    if (!validation.isValid) {
      return { success: false, error: validation.error };
    }

    // Step 2: Create pending action
    const pendingAction = await step.run('create-pending-action', async () => {
      return await createPendingAction({
        gameId,
        chatId,
        originalInput: playerInput,
        timeEstimate: validation.timeEstimate,
        phase: 'meta_proposal',
      });
    });

    // Step 3: Generate meta events
    const metaEvents = await step.run('generate-meta-events', async () => {
      return await callMetaEventModule({
        playerInput,
        timeEstimate: validation.timeEstimate,
        context: await getGameContext(gameId),
      });
    });

    // Step 4: Store proposed events and wait for player review
    await step.run('store-proposed-events', async () => {
      await storeMetaEvents(pendingAction.id, metaEvents);
      await updatePendingAction(pendingAction.id, { phase: 'meta_review' });
    });

    // Step 5: Wait for player review (this pauses the workflow)
    await step.waitForEvent('await-player-review', {
      event: GameEvents.META_EVENTS_REVIEWED,
      match: 'data.pendingActionId',
      timeout: '30m',
    });

    // ... continue with probability roll, event resolution, etc.
  }
);
```

## 8. The "In-Event" Flag: Preventing Recursive Meta Events

This is critical. You need a way to know when the player is "inside" an event vs. normal play:

```typescript
interface GameContext {
  // ... existing fields
  
  // Meta event state
  currentPendingAction: PendingAction | null;
  isInMetaEvent: boolean;                    // True when resolving events
  currentMetaEvent: TriggeredEvent | null;   // Which event we're in
  
  // Future: Combat state
  isInCombat: boolean;
  currentCombat: CombatState | null;
}
```

When `isInMetaEvent` is true, the system:
- Does NOT call the Meta Event Module
- Routes actions directly to Narrator
- Tracks when the event narrative is "complete"

## 9. Future Expandability: Combat Mode

The same pattern extends naturally to combat:

```
┌──────────────────────────────────────────────────────────────────────┐
│                     COMBAT STATE (FUTURE)                            │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  When a meta event has triggersCombat: true                          │
│                                                                      │
│  ┌─────────────────┐                                                 │
│  │  IN_META_EVENT  │                                                 │
│  │  (event has     │                                                 │
│  │  triggersCombat)│                                                 │
│  └────────┬────────┘                                                 │
│           │                                                          │
│           ▼                                                          │
│  ┌─────────────────┐     ┌──────────────────┐                       │
│  │  COMBAT_START   │────▶│   IN_COMBAT      │◀──┐                   │
│  │  (initialize    │     │   (turn-based    │   │ (combat           │
│  │   combat state) │     │    combat loop)  │───┘  continues)       │
│  └─────────────────┘     └────────┬─────────┘                       │
│                                   │                                  │
│                          (combat ends)                               │
│                                   │                                  │
│                                   ▼                                  │
│                          ┌─────────────────┐                        │
│                          │  COMBAT_END     │                        │
│                          │  (back to meta  │                        │
│                          │   event or next │                        │
│                          │   event)        │                        │
│                          └─────────────────┘                        │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

The combat system would have its own:
- State machine
- Turn tracking
- Action validation (combat-specific)
- Resolution rules

But it plugs into the same orchestration layer.

## 10. Key Design Principles

### Principle 1: Single Source of Truth for Phase
The `PendingAction.phase` field is authoritative. The UI reads this to know what to display.

### Principle 2: Events are Immutable Once Created
Once meta events are generated, they're stored. Regeneration creates NEW events, doesn't modify existing ones (for audit trail).

### Principle 3: The Narrator Doesn't Know About Phases
The Narrator module just receives context and produces narrative. It doesn't need to know about meta events, combat, etc. The **orchestration layer** manages phase transitions.

### Principle 4: Client-Server Phase Sync
The client polls or subscribes to phase changes. When phase changes from `meta_proposal` to `meta_review`, the UI updates to show the review interface.

## 11. Implementation Phases

### Phase A: Foundation (Meta Event Core)
1. Add `PendingAction` and `MetaEvent` tables
2. Create state machine types and helpers
3. Add `phase` tracking to game context
4. Create Meta Event Module LLM prompt

### Phase B: Proposal Flow
1. Modify chat route to intercept actions
2. Create pending action on submission
3. Call meta event module
4. Store proposed events

### Phase C: Review UI
1. Create meta event review component
2. Add accept/reject/regenerate handlers
3. Sync review state to database
4. Create "Confirm & Continue" flow

### Phase D: Resolution Flow
1. Implement probability rolling
2. Create event resolution loop
3. Add `isInMetaEvent` context tracking
4. Implement event completion detection

### Phase E: Original Action Resolution
1. Complete the loop back to original action
2. Reset to IDLE state
3. Handle edge cases (cancel, timeout, etc.)

### Phase F: Combat Foundation (Future)
1. Add combat state fields
2. Create combat module skeleton
3. Add combat trigger detection
4. Implement combat ↔ event transitions

---

## 12. Files You'll Need to Create/Modify

### New Files
```
lib/meta-events/
├── types.ts                    # MetaEvent, PendingAction, GamePhase types
├── state-machine.ts            # Phase transition logic
├── meta-event-module.ts        # LLM call for generating events
├── probability.ts              # Dice rolling logic
└── prompts/
    └── meta-event-prompt.ts    # System prompt for meta module

components/play/
├── meta-event-review.tsx       # Review UI component
├── meta-event-card.tsx         # Individual event card
└── event-resolution-view.tsx   # In-event narrative view

lib/db/
├── migrations/00XX_meta_events.sql
└── (updates to queries.ts, schema.ts)

lib/inngest/
└── (updates to functions.ts for new workflow steps)
```

### Modified Files
```
app/(chat)/api/chat/route.ts    # Intercept and check phase
lib/db/schema.ts                # Add new tables
lib/db/queries.ts               # Add CRUD for meta events
lib/stores/game-store.ts        # Add phase tracking state
lib/inngest/functions.ts        # Expand workflow
components/play/play-chat.tsx   # Conditionally show review UI
```

---

Would you like me to dive deeper into any specific part of this architecture? I can also draft the actual prompts for the Meta Event Module, or detail the UI component structure for the review flow.

```plaintext
┌─────────────────────────────────────────────────────────────────────────────┐
│                         GAME PHASE STATE MACHINE                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────┐      ┌──────────────┐      ┌────────────────┐                │
│  │  IDLE    │──────▶  VALIDATING  │──────▶  META_PROPOSAL │                │
│  │ (awaiting│      │  (validator  │      │  (generating   │                │
│  │  input)  │      │   + tick)    │      │   events)      │                │
│  └──────────┘      └──────────────┘      └───────┬────────┘                │
│       ▲                                          │                          │
│       │                                          ▼                          │
│       │                                 ┌────────────────┐                  │
│       │                                 │  META_REVIEW   │◀─┐               │
│       │                                 │ (player sees   │  │ (regenerate)  │
│       │                                 │  events)       │──┘               │
│       │                                 └───────┬────────┘                  │
│       │                                         │ (accept)                  │
│       │                                         ▼                          │
│       │                                 ┌────────────────┐                  │
│       │                                 │ PROBABILITY    │                  │
│       │                                 │ ROLL           │                  │
│       │                                 │ (which events  │                  │
│       │                                 │  trigger?)     │                  │
│       │                                 └───────┬────────┘                  │
│       │                                         │                          │
│       │                         ┌───────────────┴───────────────┐          │
│       │                         ▼                               ▼          │
│       │                 ┌────────────────┐             ┌────────────────┐  │
│       │                 │ IN_META_EVENT  │             │ RESOLVING      │  │
│       │                 │ (playing thru  │──(loop)────▶│ ACTION         │  │
│       │                 │  triggered     │             │ (original      │  │
│       │                 │  events)       │             │  action)       │  │
│       │                 └────────────────┘             └───────┬────────┘  │
│       │                         │                              │           │
│       │                         │ (event requires combat)      │           │
│       │                         ▼                              │           │
│       │                 ┌────────────────┐                     │           │
│       │                 │  IN_COMBAT     │                     │           │
│       │                 │  (future)      │                     │           │
│       │                 └────────┬───────┘                     │           │
│       │                          │                             │           │
│       └──────────────────────────┴─────────────────────────────┘           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

```typescript
interface PendingAction {
  id: string;
  gameId: string;
  originalInput: string;           // "gather wood"
  validatedAt: Date;
  timeEstimate: TimeValue;         // From tick module
  phase: GamePhase;
  proposedEvents: MetaEvent[];     // Generated by meta module
  reviewedEvents: ReviewedEvent[]; // After accept/reject
  triggeredEvents: MetaEvent[];    // After probability roll
  currentEventIndex: number;       // Which event are we resolving?
  createdAt: Date;
}
```

```typescript
interface MetaEvent {
  id: string;
  type: MetaEventType;           // 'encounter', 'discovery', 'hazard', 'opportunity'
  title: string;                 // "Wandering Merchant"
  description: string;           // Brief description for player
  probability: number;           // 0.0 to 1.0 (suggested by AI)
  severity: 'minor' | 'moderate' | 'major';
  triggersCombat: boolean;       // Flag for future combat system
  timeImpact: TimeValue | null;  // Additional time if triggered
}

interface ReviewedEvent extends MetaEvent {
  playerDecision: 'accepted' | 'rejected';
  reviewedAt: Date;
}

interface TriggeredEvent extends MetaEvent {
  rollResult: number;            // The actual dice roll
  triggered: boolean;            // Did it happen?
  resolvedAt?: Date;
}
```

```plaintext
┌──────────────────────────────────────────────────────────────────────┐
│                    META EVENT PROPOSAL PHASE                         │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Input to Meta Event Module:                                         │
│  ┌────────────────────────────────────────────────────────────┐     │
│  │ • Player's intended action: "gather wood"                   │     │
│  │ • Time estimate: "2 hours"                                  │     │
│  │ • Current location context                                  │     │
│  │ • Current character state                                   │     │
│  │ • Recent story events                                       │     │
│  │ • World state (time of day, weather, etc.)                 │     │
│  └────────────────────────────────────────────────────────────┘     │
│                               │                                      │
│                               ▼                                      │
│                        ┌─────────────┐                               │
│                        │   META      │                               │
│                        │   EVENT     │                               │
│                        │   MODULE    │                               │
│                        │   (LLM)     │                               │
│                        └──────┬──────┘                               │
│                               │                                      │
│                               ▼                                      │
│  Output: 2-4 possible events                                        │
│  ┌────────────────────────────────────────────────────────────┐     │
│  │ 1. "You hear rustling in the bushes nearby"                │     │
│  │    - Type: encounter, Probability: 0.3, Severity: minor    │     │
│  │                                                             │     │
│  │ 2. "A merchant's cart passes by on the nearby road"        │     │
│  │    - Type: opportunity, Probability: 0.2, Severity: minor  │     │
│  │                                                             │     │
│  │ 3. "You find unusual mushrooms growing on a fallen log"    │     │
│  │    - Type: discovery, Probability: 0.4, Severity: minor    │     │
│  └────────────────────────────────────────────────────────────┘     │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

```plaintext
┌──────────────────────────────────────────────────────────────────────┐
│  Before you gather wood, the following things might happen...        │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ ⚔️ Rustling in the Bushes                        [30% chance]│   │
│  │ You hear something moving in the undergrowth nearby.         │   │
│  │                                                               │   │
│  │ [ ✓ Accept ]  [ ✗ Reject ]                                   │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ 🛒 Passing Merchant                              [20% chance]│   │
│  │ A merchant's cart passes by on the nearby road.              │   │
│  │                                                               │   │
│  │ [ ✓ Accept ]  [ ✗ Reject ]                                   │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ 🍄 Unusual Discovery                             [40% chance]│   │
│  │ You find unusual mushrooms growing on a fallen log.          │   │
│  │                                                               │   │
│  │ [ ✓ Accept ]  [ ✗ Reject ]                                   │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  [ 🔄 Regenerate All ]       [ ▶️ Confirm & Continue ]        │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

```typescript
function rollForEvents(acceptedEvents: ReviewedEvent[]): TriggeredEvent[] {
  return acceptedEvents
    .filter(e => e.playerDecision === 'accepted')
    .map(event => {
      const roll = Math.random();
      return {
        ...event,
        rollResult: roll,
        triggered: roll <= event.probability,
      };
    });
}
```

```sql
-- Pending Actions table
CREATE TABLE "PendingAction" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "gameId" uuid NOT NULL REFERENCES "GameSession"("id") ON DELETE CASCADE,
  "chatId" uuid NOT NULL REFERENCES "Chat"("id"),
  "originalInput" text NOT NULL,
  "timeEstimate" varchar(50),
  "phase" varchar(50) NOT NULL DEFAULT 'validating',
  "currentEventIndex" integer DEFAULT 0,
  "createdAt" timestamp NOT NULL DEFAULT NOW(),
  "updatedAt" timestamp NOT NULL DEFAULT NOW()
);

-- Meta Events table
CREATE TABLE "MetaEvent" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "pendingActionId" uuid NOT NULL REFERENCES "PendingAction"("id") ON DELETE CASCADE,
  "type" varchar(50) NOT NULL,        -- 'encounter', 'discovery', 'hazard', 'opportunity'
  "title" varchar(255) NOT NULL,
  "description" text NOT NULL,
  "probability" real NOT NULL,         -- 0.0 to 1.0
  "severity" varchar(20) NOT NULL,     -- 'minor', 'moderate', 'major'
  "triggersCombat" boolean DEFAULT false,
  "timeImpact" varchar(50),
  "playerDecision" varchar(20),        -- 'accepted', 'rejected', null
  "rollResult" real,                   -- The actual roll
  "triggered" boolean,                 -- Did it happen?
  "resolvedAt" timestamp,
  "createdAt" timestamp NOT NULL DEFAULT NOW()
);
```

```typescript
// lib/inngest/functions.ts - Enhanced

export const gameLoopWorkflow = inngest.createFunction(
  { id: 'game-loop-main' },
  { event: GameEvents.PLAYER_ACTION_SUBMITTED },
  async ({ event, step }) => {
    const { gameId, chatId, playerInput } = event.data;

    // Step 1: Validate input (existing)
    const validation = await step.run('validate-input', async () => {
      return await callValidatorModules(playerInput, context);
    });

    if (!validation.isValid) {
      return { success: false, error: validation.error };
    }

    // Step 2: Create pending action
    const pendingAction = await step.run('create-pending-action', async () => {
      return await createPendingAction({
        gameId,
        chatId,
        originalInput: playerInput,
        timeEstimate: validation.timeEstimate,
        phase: 'meta_proposal',
      });
    });

    // Step 3: Generate meta events
    const metaEvents = await step.run('generate-meta-events', async () => {
      return await callMetaEventModule({
        playerInput,
        timeEstimate: validation.timeEstimate,
        context: await getGameContext(gameId),
      });
    });

    // Step 4: Store proposed events and wait for player review
    await step.run('store-proposed-events', async () => {
      await storeMetaEvents(pendingAction.id, metaEvents);
      await updatePendingAction(pendingAction.id, { phase: 'meta_review' });
    });

    // Step 5: Wait for player review (this pauses the workflow)
    await step.waitForEvent('await-player-review', {
      event: GameEvents.META_EVENTS_REVIEWED,
      match: 'data.pendingActionId',
      timeout: '30m',
    });

    // ... continue with probability roll, event resolution, etc.
  }
);
```

```typescript
interface GameContext {
  // ... existing fields
  
  // Meta event state
  currentPendingAction: PendingAction | null;
  isInMetaEvent: boolean;                    // True when resolving events
  currentMetaEvent: TriggeredEvent | null;   // Which event we're in
  
  // Future: Combat state
  isInCombat: boolean;
  currentCombat: CombatState | null;
}
```

```plaintext
┌──────────────────────────────────────────────────────────────────────┐
│                     COMBAT STATE (FUTURE)                            │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  When a meta event has triggersCombat: true                          │
│                                                                      │
│  ┌─────────────────┐                                                 │
│  │  IN_META_EVENT  │                                                 │
│  │  (event has     │                                                 │
│  │  triggersCombat)│                                                 │
│  └────────┬────────┘                                                 │
│           │                                                          │
│           ▼                                                          │
│  ┌─────────────────┐     ┌──────────────────┐                       │
│  │  COMBAT_START   │────▶│   IN_COMBAT      │◀──┐                   │
│  │  (initialize    │     │   (turn-based    │   │ (combat           │
│  │   combat state) │     │    combat loop)  │───┘  continues)       │
│  └─────────────────┘     └────────┬─────────┘                       │
│                                   │                                  │
│                          (combat ends)                               │
│                                   │                                  │
│                                   ▼                                  │
│                          ┌─────────────────┐                        │
│                          │  COMBAT_END     │                        │
│                          │  (back to meta  │                        │
│                          │   event or next │                        │
│                          │   event)        │                        │
│                          └─────────────────┘                        │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

```plaintext
lib/meta-events/
├── types.ts                    # MetaEvent, PendingAction, GamePhase types
├── state-machine.ts            # Phase transition logic
├── meta-event-module.ts        # LLM call for generating events
├── probability.ts              # Dice rolling logic
└── prompts/
    └── meta-event-prompt.ts    # System prompt for meta module

components/play/
├── meta-event-review.tsx       # Review UI component
├── meta-event-card.tsx         # Individual event card
└── event-resolution-view.tsx   # In-event narrative view

lib/db/
├── migrations/00XX_meta_events.sql
└── (updates to queries.ts, schema.ts)

lib/inngest/
└── (updates to functions.ts for new workflow steps)
```

```plaintext
app/(chat)/api/chat/route.ts    # Intercept and check phase
lib/db/schema.ts                # Add new tables
lib/db/queries.ts               # Add CRUD for meta events
lib/stores/game-store.ts        # Add phase tracking state
lib/inngest/functions.ts        # Expand workflow
components/play/play-chat.tsx   # Conditionally show review UI
```

---

**User**

Great. I copied our chat over to @intercept_system_design.md - I want you to sketch out the code that's going to be needed (I actually want to build this before the validator) for another AI to build. Write the minimal amount of code you can to give clear instructions, so the other AI doesn't have to make any big decisions on it's own (I trust your engineering). skip the code for the validating modules, and the actual code for the meta proposal and review and probability. Those are gonna be separate. But sketch out what's necessary just ot create the state machine itself

---

**Cursor**

I'll sketch out the minimal state machine foundation code. This is the "bones" that everything else will be built on.

---

# State Machine Foundation - Implementation Spec

## Overview

This document provides implementation instructions for the **Game Phase State Machine** - the core orchestration layer that tracks where the player is in the action lifecycle. This must be built **before** the validator, meta event proposal, review UI, or probability systems.

---

## 1. Database Schema

### Migration File: `lib/db/migrations/00XX_game_phase_state_machine.sql`

```sql
-- Game Phase State Machine Tables
-- Run this migration to add pending action and meta event tracking

-- Enum type for game phases
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

-- Pending Actions: tracks the player's intended action through its lifecycle
CREATE TABLE "PendingAction" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "gameId" uuid NOT NULL REFERENCES "GameSession"("id") ON DELETE CASCADE,
  "chatId" uuid NOT NULL REFERENCES "Chat"("id") ON DELETE CASCADE,
  "originalInput" text NOT NULL,
  "timeEstimate" varchar(50),
  "phase" game_phase NOT NULL DEFAULT 'validating',
  "currentEventIndex" integer NOT NULL DEFAULT 0,
  "createdAt" timestamp NOT NULL DEFAULT NOW(),
  "updatedAt" timestamp NOT NULL DEFAULT NOW(),
  "completedAt" timestamp
);

-- MetaEvent: individual events proposed/triggered for a pending action
CREATE TABLE "MetaEvent" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "pendingActionId" uuid NOT NULL REFERENCES "PendingAction"("id") ON DELETE CASCADE,
  "sequenceNum" integer NOT NULL DEFAULT 0,
  "type" varchar(50) NOT NULL,
  "title" varchar(255) NOT NULL,
  "description" text NOT NULL,
  "probability" real NOT NULL,
  "severity" varchar(20) NOT NULL,
  "triggersCombat" boolean NOT NULL DEFAULT false,
  "timeImpact" varchar(50),
  "playerDecision" varchar(20),
  "rollResult" real,
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
  currentEventIndex: number;
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
      // After player confirms, roll for probability
      return "probability_roll";
      
    case "probability_roll":
      // If any events triggered, go to event resolution
      // Otherwise skip straight to action resolution
      return context.hasTriggeredEvents ? "in_meta_event" : "resolving_action";
      
    case "in_meta_event":
      // If all events resolved, resolve the original action
      // Otherwise stay in event resolution (handled by incrementing currentEventIndex)
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
    currentEventIndex: 0,
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
    // Reset event index when entering a new action cycle
    currentEventIndex: newPhase === "idle" ? 0 : context.currentEventIndex,
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
 * Update the current event index for a pending action
 */
export async function updatePendingActionEventIndex(
  id: string,
  currentEventIndex: number
) {
  const [result] = await db
    .update(pendingAction)
    .set({ 
      currentEventIndex, 
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
 * Get the current event being resolved (based on currentEventIndex)
 */
export async function getCurrentMetaEvent(
  pendingActionId: string,
  currentEventIndex: number
) {
  const events = await getTriggeredUnresolvedEvents(pendingActionId);
  return events[currentEventIndex] ?? null;
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
    if (currentPhase === "in_meta_event" && activePendingAction) {
      // Add to request context - will be used by narrator
      // This is a placeholder for the actual implementation
      request.headers.set("x-in-meta-event", "true");
      request.headers.set("x-pending-action-id", activePendingAction.id);
    }
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
  
  const phase = await getCurrentGamePhase(gameId);
  const pendingAction = await getActivePendingAction(gameId);

  return Response.json({
    phase,
    pendingActionId: pendingAction?.id ?? null,
    originalInput: pendingAction?.originalInput ?? null,
    currentEventIndex: pendingAction?.currentEventIndex ?? 0,
  });
}
```

---

## 10. File Structure Summary

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

## 11. Implementation Checklist

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

## 12. Testing Checklist

After implementation, verify:

- [ ] Migration runs without errors
- [ ] Can create a pending action via query function
- [ ] Can update pending action phase
- [ ] Unique constraint prevents multiple active pending actions
- [ ] `getCurrentGamePhase` returns "idle" when no active action
- [ ] `isValidTransition` correctly validates transitions
- [ ] Phase API endpoint returns correct data
- [ ] Chat route blocks input during blocking phases
- [ ] Game store phase state updates correctly

---

This is the foundational layer. Once implemented, the validator, meta event proposal, review UI, and probability modules will all build on these types and functions.

```sql
-- Game Phase State Machine Tables
-- Run this migration to add pending action and meta event tracking

-- Enum type for game phases
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

-- Pending Actions: tracks the player's intended action through its lifecycle
CREATE TABLE "PendingAction" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "gameId" uuid NOT NULL REFERENCES "GameSession"("id") ON DELETE CASCADE,
  "chatId" uuid NOT NULL REFERENCES "Chat"("id") ON DELETE CASCADE,
  "originalInput" text NOT NULL,
  "timeEstimate" varchar(50),
  "phase" game_phase NOT NULL DEFAULT 'validating',
  "currentEventIndex" integer NOT NULL DEFAULT 0,
  "createdAt" timestamp NOT NULL DEFAULT NOW(),
  "updatedAt" timestamp NOT NULL DEFAULT NOW(),
  "completedAt" timestamp
);

-- MetaEvent: individual events proposed/triggered for a pending action
CREATE TABLE "MetaEvent" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "pendingActionId" uuid NOT NULL REFERENCES "PendingAction"("id") ON DELETE CASCADE,
  "sequenceNum" integer NOT NULL DEFAULT 0,
  "type" varchar(50) NOT NULL,
  "title" varchar(255) NOT NULL,
  "description" text NOT NULL,
  "probability" real NOT NULL,
  "severity" varchar(20) NOT NULL,
  "triggersCombat" boolean NOT NULL DEFAULT false,
  "timeImpact" varchar(50),
  "playerDecision" varchar(20),
  "rollResult" real,
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
  currentEventIndex: number;
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
      // After player confirms, roll for probability
      return "probability_roll";
      
    case "probability_roll":
      // If any events triggered, go to event resolution
      // Otherwise skip straight to action resolution
      return context.hasTriggeredEvents ? "in_meta_event" : "resolving_action";
      
    case "in_meta_event":
      // If all events resolved, resolve the original action
      // Otherwise stay in event resolution (handled by incrementing currentEventIndex)
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
    currentEventIndex: 0,
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
    // Reset event index when entering a new action cycle
    currentEventIndex: newPhase === "idle" ? 0 : context.currentEventIndex,
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
 * Update the current event index for a pending action
 */
export async function updatePendingActionEventIndex(
  id: string,
  currentEventIndex: number
) {
  const [result] = await db
    .update(pendingAction)
    .set({ 
      currentEventIndex, 
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
 * Get the current event being resolved (based on currentEventIndex)
 */
export async function getCurrentMetaEvent(
  pendingActionId: string,
  currentEventIndex: number
) {
  const events = await getTriggeredUnresolvedEvents(pendingActionId);
  return events[currentEventIndex] ?? null;
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
    if (currentPhase === "in_meta_event" && activePendingAction) {
      // Add to request context - will be used by narrator
      // This is a placeholder for the actual implementation
      request.headers.set("x-in-meta-event", "true");
      request.headers.set("x-pending-action-id", activePendingAction.id);
    }
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
  
  const phase = await getCurrentGamePhase(gameId);
  const pendingAction = await getActivePendingAction(gameId);

  return Response.json({
    phase,
    pendingActionId: pendingAction?.id ?? null,
    originalInput: pendingAction?.originalInput ?? null,
    currentEventIndex: pendingAction?.currentEventIndex ?? 0,
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

