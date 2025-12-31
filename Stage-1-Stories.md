# Stage 1: Core Game Loop — Stories & Implementation Plan

*This document breaks Stage 1 into discrete, testable stories ordered for AI-assisted implementation.*

**Stage 1 Goal**: Player types an action → system evaluates → dice roll → narrated outcome appears.

That's it. No saves, no editing, no branching. Just the core loop working end-to-end.

---

## 0. Philosophy: Why This Order Matters

When building with AI assistance, you need:
1. **Vertical slices** — Each story produces something you can see/test/verify
2. **Hard things first** — Get the scary architectural pieces working before UI polish
3. **Contract-first** — Define interfaces before implementations
4. **Idempotency from day one** — You *will* run things twice accidentally

The order below is opinionated. It front-loads the "invisible infrastructure" that makes everything else possible.

**What's NOT in Stage 1** (moved to Stage 2):
- Save/Load system
- Artifact editing & branching
- Event inspector UI
- Settings UI

---

## Stage 1 Stories

### Story 1.0: Database Schema & Local Dev Environment
**Goal**: Get Postgres + Redis running locally with core tables.

**Deliverables**:
- `docker-compose.yml` with Postgres 16 + Redis 7
- Core schema: `sessions`, `branches`, `ticks`, `events`, `artifacts`
- Seed script that creates a test session

**Key Schema Decisions**:

```sql
-- The events table is append-only. NEVER update or delete.
CREATE TABLE events (
  event_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL,
  branch_id       UUID NOT NULL,
  tick_id         UUID NOT NULL,
  event_type      TEXT NOT NULL,  -- e.g., 'PLAYER_ACTION_SUBMITTED'
  producer_kind   TEXT NOT NULL,  -- 'user' | 'system' | 'agent'
  producer_id     TEXT NOT NULL,  -- agent_id or 'player' or 'system'
  payload         JSONB NOT NULL,
  sequence_in_tick INTEGER NOT NULL,  -- monotonic within tick
  causation_event_id UUID,            -- what triggered this event
  correlation_id  UUID NOT NULL,      -- ties all work for one tick
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Artifacts record EXACTLY what an agent did (for replay/debugging)
CREATE TABLE artifacts (
  artifact_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        UUID NOT NULL,
  branch_id         UUID NOT NULL,
  tick_id           UUID NOT NULL,
  agent_id          TEXT NOT NULL,
  input_event_id    UUID NOT NULL REFERENCES events(event_id),
  settings_snapshot JSONB NOT NULL,   -- frozen settings used
  prompt_template_version INTEGER,    -- which template version
  compiled_prompt   JSONB,            -- actual messages sent to LLM
  model_params      JSONB,            -- temperature, etc.
  output_payload    JSONB NOT NULL,   -- structured output
  raw_response      TEXT,             -- LLM raw response (optional)
  status            TEXT NOT NULL,    -- 'success' | 'fallback' | 'failed'
  error_metadata    JSONB,
  duration_ms       INTEGER,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Idempotency key: (agent_id, input_event_id, settings_hash)
  idempotency_key   TEXT NOT NULL,
  UNIQUE(session_id, branch_id, idempotency_key)
);
```

**⚠️ Watch Out For**:
- Don't add foreign key constraints to `events.tick_id` yet — ticks and events create each other
- Use `gen_random_uuid()` (Postgres 14+), not `uuid-ossp` extension
- The `idempotency_key` on artifacts is critical — compute it as `${agent_id}:${input_event_id}:${hash(settings)}`

**Tests**:
- [ ] `docker compose up` starts both services
- [ ] Can connect from Node and run a simple query
- [ ] Inserting duplicate `idempotency_key` fails with constraint error

---

### Story 1.1: Event Bus Foundation (Redis Streams)
**Goal**: Publish and consume a test event through Redis Streams.

**Deliverables**:
- `lib/event-bus.ts` with `publish()` and `createConsumer()` functions
- Consumer group setup script
- Dead-letter stream handling

**Key Architectural Code**:

```typescript
// lib/event-bus.ts — Core abstraction

interface EventEnvelope {
  eventId: string;       // points to Postgres event
  eventType: string;
  sessionId: string;
  branchId: string;
  tickId: string;
  correlationId: string;
  timestamp: number;
}

// Publish to Redis Stream — the payload is minimal!
// Workers should read full data from Postgres (single source of truth)
async function publish(envelope: EventEnvelope): Promise<string> {
  const streamKey = `events:${envelope.sessionId}`;
  return redis.xadd(streamKey, '*', envelope);
}

// Consumer with acknowledgment
async function createConsumer(config: {
  agentId: string;
  eventTypes: string[];
  handler: (envelope: EventEnvelope) => Promise<void>;
}) {
  // Consumer group per agent: ensures exactly-once delivery
  const groupName = `agent:${config.agentId}`;
  // ... implementation
}
```

**⚠️ Watch Out For**:
- **Stream key design**: Use `events:${sessionId}` not `events:${eventType}` — you want session isolation
- **Consumer groups**: Create them with `XGROUP CREATE ... MKSTREAM` before consuming
- **ACK timing**: Only ACK *after* Postgres write succeeds
- **BLOCK timeout**: Use `BLOCK 5000` (5 seconds), not `BLOCK 0` (infinite) — serverless hates infinite waits

**Tests**:
- [ ] Publish event → Consumer receives it
- [ ] Unacked event redelivers after timeout
- [ ] Same event processed twice → second one is idempotent (check artifacts table)

---

### Story 1.2: Agent Contract Types (Zod Schemas)
**Goal**: Define exact input/output schemas for all Stage 1 agents.

**Why First**: If you don't lock down the contracts, everything downstream breaks when you change your mind. Zod gives you runtime validation AND TypeScript types.

**Deliverables**:
- `lib/agents/schemas/action-evaluator.ts`
- `lib/agents/schemas/probability-roller.ts`
- `lib/agents/schemas/narrator.ts`
- `lib/agents/schemas/common.ts` (shared types)

**Key Schemas**:

```typescript
// lib/agents/schemas/action-evaluator.ts
import { z } from 'zod';

export const ActionEvaluatorInput = z.object({
  playerActionText: z.string().min(1),
  worldStateSummary: z.string(),  // compressed context
  recentNarrative: z.string().optional(),
});

export const ActionEvaluatorOutput = z.object({
  interpretedAction: z.string(),
  difficulty: z.enum(['trivial', 'easy', 'moderate', 'hard', 'extreme']),
  difficultyReason: z.string(),  // explain why this difficulty
  relevantSkills: z.array(z.string()).default([]),
  requiresRoll: z.boolean(),
});

// Fallback output — used when agent fails
export const ActionEvaluatorFallback: z.infer<typeof ActionEvaluatorOutput> = {
  interpretedAction: 'Attempt the action',
  difficulty: 'moderate',
  difficultyReason: 'Unable to evaluate — defaulting to moderate',
  relevantSkills: [],
  requiresRoll: true,
};


// lib/agents/schemas/probability-roller.ts
export const ProbabilityRollerInput = z.object({
  difficulty: z.enum(['trivial', 'easy', 'moderate', 'hard', 'extreme']),
  modifiers: z.array(z.object({
    source: z.string(),
    value: z.number(),
  })).default([]),
  seed: z.number().optional(),  // for deterministic replay
});

export const ProbabilityRollerOutput = z.object({
  roll: z.number().int().min(1).max(100),
  threshold: z.number().int().min(1).max(100),
  outcome: z.enum(['critical_success', 'success', 'partial', 'failure', 'critical_failure']),
  breakdown: z.string(),  // "Rolled 67 vs threshold 55 (moderate + 5 bonus)"
});


// lib/agents/schemas/narrator.ts
export const NarratorInput = z.object({
  playerAction: z.string(),
  actionDifficulty: z.string(),
  rollOutcome: z.enum(['critical_success', 'success', 'partial', 'failure', 'critical_failure']),
  rollBreakdown: z.string(),
  worldStateSummary: z.string(),
  recentNarrative: z.string(),
  tone: z.enum(['gritty', 'neutral', 'heroic']).default('neutral'),
  verbosity: z.enum(['brief', 'normal', 'elaborate']).default('normal'),
});

export const NarratorOutput = z.object({
  narrative: z.string().min(10),
  worldStateChanges: z.array(z.object({
    type: z.enum(['location_discovered', 'npc_met', 'item_gained', 'item_lost', 'time_passed']),
    description: z.string(),
    data: z.record(z.unknown()).optional(),
  })).default([]),
});
```

**⚠️ Watch Out For**:
- **Don't over-specify**: These schemas will evolve. Start minimal, add fields when needed.
- **Fallbacks must be schema-valid**: Test this! The fallback object should pass `Output.parse()`.
- **`z.infer<typeof Schema>`**: Use this for TypeScript types — don't duplicate type definitions.

**Tests**:
- [ ] Each fallback passes its schema validation
- [ ] Invalid inputs throw ZodError
- [ ] Round-trip: `Schema.parse(Schema.parse(data))` equals `Schema.parse(data)`

---

### Story 1.3: Probability Roller (Deterministic First)
**Goal**: Build the simplest agent — pure math, no LLM, fully deterministic.

**Why First Agent**: This agent has zero external dependencies (no LLM). It's pure logic. If you can't make this work with events + artifacts + idempotency, you have foundational problems.

**Deliverables**:
- `lib/agents/probability-roller/index.ts`
- Seeded random number generator
- Tests with fixed seeds

**Implementation**:

```typescript
// lib/agents/probability-roller/index.ts
import { ProbabilityRollerInput, ProbabilityRollerOutput } from '../schemas/probability-roller';
import { createArtifact } from '../../artifacts';
import { SeededRandom } from '../../random';

const DIFFICULTY_THRESHOLDS = {
  trivial: 90,
  easy: 70,
  moderate: 50,
  hard: 30,
  extreme: 15,
} as const;

export async function probabilityRoller(
  input: z.infer<typeof ProbabilityRollerInput>,
  context: AgentContext
): Promise<z.infer<typeof ProbabilityRollerOutput>> {
  
  // Use provided seed (for replay) or generate one
  const seed = input.seed ?? Date.now();
  const rng = new SeededRandom(seed);
  
  const roll = rng.nextInt(1, 100);
  const baseThreshold = DIFFICULTY_THRESHOLDS[input.difficulty];
  
  // Apply modifiers
  const totalModifier = input.modifiers.reduce((sum, m) => sum + m.value, 0);
  const threshold = Math.min(95, Math.max(5, baseThreshold + totalModifier));
  
  const outcome = determineOutcome(roll, threshold);
  
  return {
    roll,
    threshold,
    outcome,
    breakdown: `Rolled ${roll} vs ${threshold} (${input.difficulty}${totalModifier >= 0 ? '+' : ''}${totalModifier})`,
  };
}

function determineOutcome(roll: number, threshold: number) {
  if (roll <= 5) return 'critical_success';
  if (roll >= 96) return 'critical_failure';
  if (roll <= threshold - 20) return 'critical_success';
  if (roll <= threshold) return 'success';
  if (roll <= threshold + 15) return 'partial';
  return 'failure';
}


// lib/random.ts — Seeded PRNG (mulberry32)
export class SeededRandom {
  private state: number;
  
  constructor(seed: number) {
    this.state = seed;
  }
  
  next(): number {
    this.state |= 0;
    this.state = (this.state + 0x6D2B79F5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
}
```

**⚠️ Watch Out For**:
- **Seed storage**: Store the seed in the artifact AND the event. You need both for debugging and replay.
- **Critical success/failure**: Don't forget the natural 1-5 and 96-100 rules — they override threshold logic.
- **Modifier clamping**: Threshold should never go below 5 or above 95 (always a chance).

**Tests**:
- [ ] Same seed → same roll sequence
- [ ] Difficulty 'moderate' has threshold 50
- [ ] Modifiers shift threshold correctly
- [ ] Natural 5 is always critical success
- [ ] Natural 96 is always critical failure

---

### Story 1.4: Tick Lifecycle & Event Flow
**Goal**: Wire up the full tick lifecycle for a single action (no LLMs yet).

**This is the scary one.** It integrates Redis → Postgres → Artifacts → Event emission. Get this right and everything else is agent implementation.

**Deliverables**:
- `lib/tick/index.ts` — tick coordinator (not orchestrator — just coordination)
- `lib/tick/commit.ts` — atomic tick commit
- Event emission after each agent completes

**Key Flow**:

```typescript
// lib/tick/index.ts

interface TickContext {
  sessionId: string;
  branchId: string;
  tickId: string;
  correlationId: string;
}

export async function startTick(
  sessionId: string,
  branchId: string,
  playerAction: string
): Promise<TickContext> {
  const tickId = crypto.randomUUID();
  const correlationId = crypto.randomUUID();
  
  // 1. Create tick record (pending)
  await db.query(`
    INSERT INTO ticks (tick_id, session_id, branch_id, status, created_at)
    VALUES ($1, $2, $3, 'pending', now())
  `, [tickId, sessionId, branchId]);
  
  // 2. Create initial event
  const eventId = await createEvent({
    sessionId,
    branchId,
    tickId,
    eventType: 'PLAYER_ACTION_SUBMITTED',
    producerKind: 'user',
    producerId: 'player',
    payload: { action: playerAction },
    correlationId,
    sequenceInTick: 0,
  });
  
  // 3. Publish to Redis (trigger downstream agents)
  await eventBus.publish({
    eventId,
    eventType: 'PLAYER_ACTION_SUBMITTED',
    sessionId,
    branchId,
    tickId,
    correlationId,
    timestamp: Date.now(),
  });
  
  return { sessionId, branchId, tickId, correlationId };
}


// lib/tick/commit.ts

export async function commitTick(tickId: string): Promise<void> {
  await db.query(`
    UPDATE ticks 
    SET status = 'committed', committed_at = now()
    WHERE tick_id = $1 AND status = 'pending'
  `, [tickId]);
  
  // Stage 2 adds: AUTO_SAVE_CREATED event
}
```

**The Agent Worker Pattern**:

```typescript
// lib/agents/worker.ts — Generic agent worker

export function createAgentWorker<TInput, TOutput>(config: {
  agentId: string;
  inputSchema: z.ZodSchema<TInput>;
  outputSchema: z.ZodSchema<TOutput>;
  fallback: TOutput;
  listensTo: string[];
  emits: string;
  handler: (input: TInput, ctx: AgentContext) => Promise<TOutput>;
}) {
  return eventBus.createConsumer({
    agentId: config.agentId,
    eventTypes: config.listensTo,
    
    handler: async (envelope) => {
      // 1. Check idempotency
      const idempotencyKey = computeIdempotencyKey(config.agentId, envelope.eventId);
      const existing = await findArtifact(idempotencyKey);
      if (existing) {
        console.log(`Skipping duplicate: ${idempotencyKey}`);
        return;  // Already processed
      }
      
      // 2. Load full event from Postgres
      const event = await loadEvent(envelope.eventId);
      
      // 3. Validate input
      const input = config.inputSchema.parse(event.payload);
      
      // 4. Execute handler (with timeout)
      let output: TOutput;
      let status: 'success' | 'fallback' | 'failed' = 'success';
      
      try {
        output = await withTimeout(
          config.handler(input, { envelope, event }),
          30_000  // 30 second timeout
        );
        output = config.outputSchema.parse(output);  // Validate output
      } catch (error) {
        console.error(`Agent ${config.agentId} failed:`, error);
        output = config.fallback;
        status = 'fallback';
      }
      
      // 5. Store artifact (includes idempotency key)
      await createArtifact({
        ...envelope,
        agentId: config.agentId,
        inputEventId: envelope.eventId,
        outputPayload: output,
        status,
        idempotencyKey,
      });
      
      // 6. Emit downstream event
      await createAndPublishEvent({
        ...envelope,
        eventType: config.emits,
        producerKind: 'agent',
        producerId: config.agentId,
        payload: output,
        sequenceInTick: envelope.sequence + 1,
        causationEventId: envelope.eventId,
      });
    },
  });
}
```

**⚠️ Watch Out For**:
- **Idempotency check happens BEFORE any work**: This is critical.
- **Redis ACK happens AFTER Postgres commit**: If you ACK first and crash, you lose the event.
- **`sequenceInTick`**: Must be monotonically increasing. Use `max(sequence) + 1` when inserting.
- **Timeouts**: LLM calls can hang. Always wrap in `Promise.race` with a timeout.

**Tests**:
- [ ] Submit action → All three events created in Postgres
- [ ] Submit same action twice → Only one artifact created (idempotency)
- [ ] Kill process mid-tick → Reprocess completes correctly on restart
- [ ] Timeout → Fallback output used, tick still completes

---

### Story 1.5: DB-Stored Prompt Templates
**Goal**: Prompts live in the database, are versioned, and get compiled at runtime.

**Why Now**: Every LLM agent needs this. If we hardcode prompts, we can't:
- Iterate without redeploy
- Track which prompt version produced which output
- Roll back bad prompts
- Let settings influence prompts dynamically

**Deliverables**:
- `lib/prompts/index.ts` — Load, compile, version prompts
- Prompt template table with versioning
- Settings integration (template variables from settings)

**Schema**:

```sql
CREATE TABLE prompt_templates (
  template_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id          TEXT NOT NULL,
  prompt_key        TEXT NOT NULL,           -- e.g., 'main', 'evaluate_action'
  template_version  INTEGER NOT NULL,
  template_body     TEXT NOT NULL,           -- The actual template with {variables}
  variables_schema  JSONB NOT NULL,          -- What variables are required
  is_active         BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by        TEXT,
  
  UNIQUE(agent_id, prompt_key, template_version)
);

-- Only one active version per agent/key combo
CREATE UNIQUE INDEX idx_active_prompt 
  ON prompt_templates(agent_id, prompt_key) 
  WHERE is_active = true;
```

**Implementation**:

```typescript
// lib/prompts/index.ts

interface CompiledPrompt {
  templateId: string;
  templateVersion: number;
  compiledText: string;
  variables: Record<string, unknown>;
}

export async function compilePrompt(
  agentId: string,
  promptKey: string,
  variables: Record<string, unknown>,
  sessionSettings: Record<string, unknown>
): Promise<CompiledPrompt> {
  
  // 1. Load active template
  const template = await db.query(`
    SELECT * FROM prompt_templates 
    WHERE agent_id = $1 AND prompt_key = $2 AND is_active = true
  `, [agentId, promptKey]);
  
  if (!template) {
    throw new Error(`No active prompt for ${agentId}:${promptKey}`);
  }
  
  // 2. Merge session settings into variables
  const allVariables = { ...variables, ...sessionSettings };
  
  // 3. Validate required variables
  const schema = template.variables_schema as { required: string[] };
  for (const required of schema.required) {
    if (!(required in allVariables)) {
      throw new Error(`Missing required variable: ${required}`);
    }
  }
  
  // 4. Compile template (simple string replacement)
  let compiled = template.template_body;
  for (const [key, value] of Object.entries(allVariables)) {
    compiled = compiled.replaceAll(`{${key}}`, String(value));
  }
  
  return {
    templateId: template.template_id,
    templateVersion: template.template_version,
    compiledText: compiled,
    variables: allVariables,
  };
}

// Seed initial prompts (run on first deploy)
export async function seedPrompts() {
  const prompts = [
    {
      agentId: 'action-evaluator',
      promptKey: 'main',
      templateBody: ACTION_EVALUATOR_TEMPLATE,
      variablesSchema: { required: ['worldStateSummary', 'playerActionText'] },
    },
    {
      agentId: 'narrator',
      promptKey: 'main', 
      templateBody: NARRATOR_TEMPLATE,
      variablesSchema: { required: ['playerAction', 'rollOutcome', 'tone', 'verbosity'] },
    },
  ];
  
  for (const p of prompts) {
    await db.query(`
      INSERT INTO prompt_templates 
        (agent_id, prompt_key, template_version, template_body, variables_schema, is_active)
      VALUES ($1, $2, 1, $3, $4, true)
      ON CONFLICT (agent_id, prompt_key, template_version) DO NOTHING
    `, [p.agentId, p.promptKey, p.templateBody, p.variablesSchema]);
  }
}
```

**⚠️ Watch Out For**:
- **Active flag management**: When you create a new version, you must deactivate the old one. Use a transaction.
- **Variable injection attacks**: Don't allow user input directly into templates without sanitization. Player action should be quoted/escaped.
- **Template syntax**: Use `{variable}` not `${variable}`. The latter conflicts with JS template literals and causes confusion.
- **Seed idempotency**: The seed script should use `ON CONFLICT DO NOTHING` so it's safe to run multiple times.

**Tests**:
- [ ] `compilePrompt` returns compiled text with variables replaced
- [ ] Missing required variable throws error
- [ ] Only one active template per agent/key combo
- [ ] Creating new version + activating it deactivates old one

---

### Story 1.6: Action Evaluator Agent (First LLM)
**Goal**: Build the first LLM-powered agent using DB-stored prompts.

**Deliverables**:
- `lib/agents/action-evaluator/index.ts`
- Prompt template seeded in DB
- Fallback behavior

**Implementation**:

```typescript
// lib/agents/action-evaluator/index.ts
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { compilePrompt } from '../../prompts';
import { ActionEvaluatorInput, ActionEvaluatorOutput, ActionEvaluatorFallback } from '../schemas/action-evaluator';

export const actionEvaluator = createAgentWorker({
  agentId: 'action-evaluator',
  inputSchema: ActionEvaluatorInput,
  outputSchema: ActionEvaluatorOutput,
  fallback: ActionEvaluatorFallback,
  listensTo: ['PLAYER_ACTION_SUBMITTED'],
  emits: 'ACTION_EVALUATED',
  
  handler: async (input, ctx) => {
    // Load and compile prompt from DB
    const compiled = await compilePrompt(
      'action-evaluator',
      'main',
      {
        worldStateSummary: input.worldStateSummary,
        recentNarrative: input.recentNarrative ?? 'None',
        playerActionText: input.playerActionText,
      },
      ctx.sessionSettings  // tone, verbosity, etc.
    );
    
    const result = await generateObject({
      model: openai('gpt-4o-mini'),
      schema: ActionEvaluatorOutput,
      prompt: compiled.compiledText,
    });
    
    // Store prompt info for artifact
    ctx.promptInfo = {
      templateVersion: compiled.templateVersion,
      compiledPrompt: compiled.compiledText,
    };
    
    return result.object;
  },
});
```

**Initial Prompt Template** (seeded to DB):

```
You are evaluating a player's action in a fantasy RPG.

Current situation:
{worldStateSummary}

Recent events:
{recentNarrative}

The player says: "{playerActionText}"

Analyze this action and respond with:
1. What the player is actually trying to do (interpret intent)
2. How difficult this would be (trivial/easy/moderate/hard/extreme)
3. Why you chose that difficulty
4. Whether a dice roll is needed (false for trivial certainties)

Be fair but realistic. Most actions should be 'moderate'. 
Only use 'hard' or 'extreme' for genuinely challenging tasks.
Only use 'trivial' for things that would be automatic for a competent adult.
```

**⚠️ Watch Out For**:
- **Vercel AI SDK's `generateObject`**: This is the right choice — it enforces JSON schema on the LLM output.
- **Model choice**: Use `gpt-4o-mini` for development (cheap + fast). Swap to `gpt-4o` or Claude for production.
- **Prompt injection**: Player action goes in quotes, but a determined player could still inject. Accept this risk for now.
- **Cost tracking**: Log token usage per artifact. You'll need this for billing and debugging runaway prompts.

**Tests**:
- [ ] "I walk across the room" → difficulty 'trivial' or 'easy'
- [ ] "I try to pick the lock on the vault" → difficulty 'moderate' or 'hard'
- [ ] Fallback triggers on API error
- [ ] Output matches schema

---

### Story 1.7: Narrator Agent
**Goal**: Generate narrative text based on action + roll outcome.

**Deliverables**:
- `lib/agents/narrator/index.ts`
- Verbosity and tone settings applied to prompt

**Key Design Decision**:

```typescript
// The narrator receives structured input, not raw LLM outputs
// This means we can replay/regenerate narration without re-rolling

const PROMPT_TEMPLATE = `You are the narrator of a fantasy RPG.

Setting: {worldStateSummary}

What just happened:
- The player attempted: {playerAction}
- Difficulty: {actionDifficulty}
- Outcome: {rollOutcome} ({rollBreakdown})

Recent story:
{recentNarrative}

Write the next paragraph of the story describing what happens.
Tone: {tone}
Length: {verbosity}

Rules:
- Never control the player's decisions or dialogue
- Describe outcomes based on the roll result
- For 'partial' outcomes, the player achieves something but with a complication
- For 'failure', describe what goes wrong (but never kill the player outright)
- For 'critical_success' or 'critical_failure', make it memorable`;
```

**⚠️ Watch Out For**:
- **Never kill the player on failure**: This is an RPG, not a roguelike. Failures should create complications, not game-overs.
- **Narrator doesn't roll**: It receives the outcome. If you want to change the outcome, you edit the ProbabilityRoller artifact (Stage 2).
- **World state changes**: The narrator should output structured world changes (location discovered, NPC met, etc.) alongside the narrative text.

**Tests**:
- [ ] 'success' outcome → positive narrative
- [ ] 'failure' outcome → complication, not death
- [ ] 'critical_success' → exceptional narrative
- [ ] Verbosity 'brief' → shorter output than 'elaborate'

---

### Story 1.8: UI Integration with Existing Chatbot
**Goal**: Connect the agent loop to the existing chatbot UI.

**NOTE**: LLM streaming, chat UI, and message handling are provided by the **existing Chatbot implementation**. This story integrates with that, not replaces it.

**Deliverables**:
- Integration layer between Chatbot UI and agent event system
- Player message → `PLAYER_ACTION_SUBMITTED` event
- Narrator output → displayed as assistant message

**Integration Points**:

```typescript
// The chatbot already handles:
// - Auth (Stage 0)
// - Message display and streaming
// - Input handling
// - History (decision TBD - see Questions.md)

// We need to:
// 1. Intercept player messages and route to our tick system
// 2. Stream narrator output back to the chat UI
// 3. Show basic "processing" state while agents work
```

**⚠️ Watch Out For**:
- **Don't rebuild the chat**: The existing chatbot implementation handles streaming, optimistic updates, etc. Integrate, don't replace.
- **Message format**: May need to adapt between chatbot message format and our event payloads.
- **Error display**: If an agent fails and uses fallback, show something to the player.

**Tests**:
- [ ] Type action in chat → narrative appears as response
- [ ] Multiple actions work in sequence
- [ ] Fallback message displays when agent fails
- [ ] Works on mobile

---

## Implementation Order Summary

| Order | Story | Risk | Dependencies |
|-------|-------|------|--------------|
| 1 | 1.0 DB Schema | Low | None |
| 2 | 1.1 Event Bus | Medium | 1.0 |
| 3 | 1.2 Zod Schemas | Low | None |
| 4 | 1.3 Probability Roller | Low | 1.0, 1.1, 1.2 |
| 5 | 1.4 Tick Lifecycle | **HIGH** | 1.0, 1.1, 1.2, 1.3 |
| 6 | 1.5 DB-Stored Prompts | Medium | 1.0 |
| 7 | 1.6 Action Evaluator | Medium | 1.4, 1.5 |
| 8 | 1.7 Narrator | Medium | 1.4, 1.5, 1.6 |
| 9 | 1.8 UI Integration | Medium | Existing Chatbot, 1.6, 1.7 |

---

## Red Flags / Things That Will Bite You

### 1. "It works locally but not on Vercel"
- **Cause**: Vercel functions have 10-30 second timeouts. Redis Streams with `BLOCK 0` will timeout.
- **Fix**: Use `BLOCK 5000` and loop. Or use Inngest for background processing. See Questions.md.

### 2. "Events are processing twice"
- **Cause**: ACKing before Postgres commit, then crashing.
- **Fix**: Only ACK after Postgres transaction commits.

### 3. "The narrative doesn't match the roll outcome"
- **Cause**: Narrator prompt doesn't include roll result, or LLM hallucinates.
- **Fix**: Make roll outcome VERY explicit in prompt. Consider few-shot examples.

### 4. "LLM costs are out of control"
- **Cause**: Long prompts, no caching, regenerating everything.
- **Fix**: Track token usage per artifact. Set alerts. Use gpt-4o-mini for development.

### 5. "I can't replay old sessions"
- **Cause**: Prompt templates changed, old artifacts reference deleted templates.
- **Fix**: Store compiled prompt in artifact. Historical replay uses stored prompt, not current template.

---

## Definition of Done for Stage 1

- [ ] Player can type an action and receive a narrated outcome
- [ ] Three agents process in sequence (Evaluator → Roller → Narrator)
- [ ] Fallbacks work when LLM fails
- [ ] All agents are idempotent (reprocessing is safe)
- [ ] Tests pass for all agent contracts
- [ ] **Prompts stored in DB with versioning**
- [ ] **Artifacts store compiled prompt + template version**
- [ ] Works in existing chatbot UI

**NOT required for Stage 1** (deferred to Stage 2):
- Save/Load
- Editing artifacts
- Branching
- Event inspector
- Settings UI

---

*Document Version: 2.0*
*Created: December 31, 2024*
