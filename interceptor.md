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