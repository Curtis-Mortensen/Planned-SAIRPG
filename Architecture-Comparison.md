# AI D&D Simulation System - Architecture Design Evaluation

Based on your requirements, I've designed three architecture options that prioritize editability, simplicity, and reliability. Each option takes a fundamentally different approach to balancing these concerns.

---

## Option 1: Orchestrator + Context Builders (Monolithic Modular)

### System Architecture
A single orchestrator module coordinates the entire tick loop sequentially. Each agent is a pure function that receives a minimal context object built by dedicated `ContextBuilder` classes. Runtime state lives in Redis during tick execution; only the final commit writes to Postgres.

```plaintext
┌─────────────────────────────────────────────────────────────┐
│                     API Endpoint (Next.js)                  │
│                      (Serverless Ready)                     │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                  TickOrchestrator (Singleton)               │
│  - Manages tick lifecycle (Start→Propose→Choose→Resolve)   │
│  - Handles regeneration points via artifact versioning      │
└──────────┬──────────────────────────────────────────────────┘
           │
           ├─────────────────┬─────────────────┬───────────────┐
           │                 │                 │               │
┌──────────▼────┐   ┌────────▼──────┐  ┌─────▼──────┐  ┌────▼──────┐
│ ContextBuilder│   │  Agent Runner │  │ Redis      │  │ Postgres  │
│  (Per Agent)  │   │  (Pure Func)  │  │  (Runtime) │  │  (Durable)│
└───────────────┘   └───────────────┘  └────────────┘  └───────────┘
```

### Core Modules & Responsibilities

**TickOrchestrator**
- Single entry point for `/api/tick` endpoint
- Executes tick phases sequentially with try/catch/rollback
- Stores all agent I/O in Redis with `tick:{tickId}:{agentName}` keys
- Provides `regenerateFrom(tickId, agentName)` method that reloads artifacts from Redis and restarts from that point
- Commits final state via single Postgres transaction

**ContextBuilder Classes** (one per agent)
- `TickLengthBuilder`: `{ playerAction, worldSummaryShort }`
- `DifficultyScorerBuilder`: `{ playerAction, playerFile }` (strips all narrative)
- `MetaEventGeneratorBuilder`: `{ tickSpec, worldStateNoNarrative, priorMetaEvents }`
- `EventReviewerBuilder`: `{ eventPool, proposedEvents }`
- `OutlineTreeBuilder`: `{ worldState, resolvedWorldEvents }`
- `NPCDecisionBuilder`: `{ outlineTree, npcProfilesSubset }` (focus bubble logic here)
- `StoryNarratorBuilder`: `{ worldState, tickSpec, npcIntents, resolvedEvents, playerActionWhenAllowed }`

**AgentRunner**
- Executes agent functions in isolated Node.js VM context (prevents context leakage)
- Pure function signature: `(context: JSON, tools: AgentTools) => Promise<JSON>`
- `AgentTools` provides: `llm.call()`, `random.d100()`, `logger.info()`

**Redis Schema (Runtime)**
```
tick:{tickId}:artifacts:{agentName} -> { input: JSON, output: JSON, version: number }
tick:{tickId}:lock -> expires after 30s (prevents concurrent ticks)
tick:{tickId}:status -> "in_progress" | "committed" | "failed"
npc:active:{npcId} -> { location, goals, relationships } (TTL 24h)
```

**Postgres Schema (Durable)**
```sql
-- Minimal tables
CREATE TABLE tick_committed (
  tick_id UUID PRIMARY KEY,
  session_id UUID,
  world_time TIMESTAMP,
  narrative_transcript TEXT,  -- Single write per tick
  npc_snapshot JSONB,         -- Batch snapshot of all NPCs
  event_log JSONB,            -- All resolved events
  random_seed BIGINT,         -- For reproducibility
  artifact_versions JSONB     -- {agentName: version}
);

CREATE TABLE npc_identity (
  npc_id UUID PRIMARY KEY,
  session_id UUID,
  core_personality JSONB      -- Stable identity
);

CREATE TABLE game_save (
  save_id UUID PRIMARY KEY,
  session_id UUID,
  tick_id UUID REFERENCES tick_committed,
  is_snapshot BOOLEAN,        -- True = full state, False = pointer + replay
  replay_events JSONB         -- Null if snapshot
);
```

### Pros/Cons Evaluation

| Criterion | Score | Pros | Cons |
|-----------|-------|------|------|
| **Editability** | ⭐⭐⭐⭐⭐ | Every artifact versioned in Redis; `regenerateFrom()` provides instant restart; full audit trail | Redis is ephemeral—must commit to Postgres before serverless function terminates |
| **Simplicity** | ⭐⭐⭐⭐ | Single orchestrator is easy to trace; pure agent functions are beginner-friendly; explicit context builders make data flow visible | Orchestrator can become a "god object" if not disciplined |
| **Reliability** | ⭐⭐⭐⭐⭐ | Single commit transaction eliminates partial writes; Redis locks prevent race conditions; deterministic context builders | Redis lock TTL must be tuned for serverless timeouts; risk of orphaned locks on crash |
| **Testability** | ⭐⭐⭐⭐⭐ | Agents testable in isolation with mock contexts; ContextBuilders testable separately; no DB needed for agent tests | Integration tests need both Redis + Postgres, but can use testcontainers |
| **Performance** | ⭐⭐⭐⭐⭐ | 3-5 DB writes per tick: 1 tick commit, 1 NPC identity (if new), 1 game save; Redis pipelining reduces RTT | Redis memory usage grows until commit; need aggressive TTL for failed ticks |
| **Flexibility** | ⭐⭐⭐⭐⭐ | Regenerate any agent without upstream re-run; versioned artifacts allow A/B comparison | Must store all intermediate artifacts (memory cost) |
| **Developer Experience** | ⭐⭐⭐⭐ | Clear debugging: inspect Redis artifacts in real-time; trace ID per tick; hot-reload agents | Requires Redis knowledge; local dev needs Redis instance |
| **Production Readiness** | ⭐⭐⭐⭐ | Works on Vercel with Redis/Postgres addons; serverless-friendly if commits < 30s | Redis persistence must be enabled; needs connection pooling for serverless |

**Tech Stack**: Next.js 14 (App Router), Vercel KV (Redis), Neon PostgreSQL, Zod (validation), Inngest (background jobs for long ticks)

**Implementation Complexity**: **Moderate** (4-6 weeks)

---

## Option 2: Event-Driven Microservices (Message Queue)

### System Architecture
Each agent is an independent serverless function that consumes events from a queue and publishes results to the next queue. The tick loop is decentralized—no orchestrator, just event flow.

```plaintext
┌─────────────────────────────────────────────────────────────┐
│                 API Endpoint (Next.js)                      │
└──────────────────────┬──────────────────────────────────────┘
                       │ Publishes
┌──────────────────────▼──────────────────────────────────────┐
│           Redis Streams / AWS EventBridge                   │
│              (Event Bus & Message Queue)                    │
└──────┬──────────┬──────────┬──────────┬──────────┬─────────┘
       │          │          │          │          │
┌──────▼─┐  ┌─────▼──┐  ┌───▼────┐  ┌─▼─────┐  ┌▼──────┐
│ Tick   │  │ Meta   │  │ Event  │  │ NPC   │  │ Story │
│ Length │  │ Event  │  │ Review │  │ Decis │  │ Narr  │
│ Agent  │  │ Gen    │  │ Agent  │  │ Agent │  │ Agent │
└───┬────┘  └───┬──────┘  └───┬──────┘  └──┬──────┘  └──┬──────┘
    │           │             │            │            │
    └───────────┴─────────────┴────────────┴────────────┘
                              │
                    ┌─────────▼──────────┐
                    │  Commit Aggregator │
                    │ (Durable Function) │
                    └─────────┬──────────┘
                              │
                    ┌─────────▼──────────┐
                    │     Postgres       │
                    └────────────────────┘
```

### Core Modules & Responsibilities

**Event Bus (Redis Streams)**
- Each agent listens to a dedicated stream: `agent:{agentName}:events`
- Events are JSON with `tickId`, `input`, `correlationId`
- Consumer groups ensure exactly-once processing
- Dead-letter queue for failed events

**Agent Microservices** (Vercel Functions)
- Each agent is a standalone function: `/api/agents/{agentName}`
- Receives minimal context via event payload
- Publishes output to next agent's stream
- Idempotent: same input → same output (stores result with `tickId` as key)
- Timeout: 10s per agent (serverless limit)

**Commit Aggregator** (Inngest function)
- Waits for all agents to complete via event pattern matching
- Collects all outputs, validates completeness
- Performs single Postgres commit
- Handles compensation (rollback) on failure

**Postgres Schema**
```sql
-- Same as Option 1, plus:
CREATE TABLE agent_execution (
  execution_id UUID PRIMARY KEY,
  tick_id UUID,
  agent_name TEXT,
  input_hash TEXT,  -- for idempotency
  output JSONB,
  status TEXT,      -- 'pending' | 'success' | 'failed'
  UNIQUE(tick_id, agent_name, input_hash)
);
```

### Pros/Cons Evaluation

| Criterion | Score | Pros | Cons |
|-----------|-------|------|------|
| **Editability** | ⭐⭐⭐ | Can replay individual agent events; event log is complete audit | Difficult to regenerate mid-chain—must publish new events manually |
| **Simplicity** | ⭐⭐ | Clear separation of concerns; agents are isolated | Distributed system complexity (eventual consistency, retries) |
| **Reliability** | ⭐⭐⭐⭐ | Agent failures don't crash entire tick; dead-letter queue captures errors | Event bus becomes single point of failure; compensation logic is complex |
| **Testability** | ⭐⭐⭐⭐⭐ | Agents testable via event injection; can mock entire event bus | Integration testing requires standing up queue infrastructure |
| **Performance** | ⭐⭐⭐ | Parallel agent execution possible (Meta Gen & Reviewer can run concurrently) | Queue latency adds overhead; 5-8 DB writes per tick (agent status + commit) |
| **Flexibility** | ⭐⭐⭐ | Can swap agent implementations easily; scale agents independently | Regenerating requires publishing new events—can't directly edit in-place |
| **Developer Experience** | ⭐⭐ | Hot-deploy agents independently; great for large teams | Debugging distributed traces is hard; requires observability platform |
| **Production Readiness** | ⭐⭐⭐⭐ | Excellent for high-scale; works on Vercel + Upstash Redis | Serverless function cold starts add latency; needs Inngest for >30s ticks |

**Tech Stack**: Next.js, Upstash Redis (Streams), Inngest, Neon Postgres, Temporal (optional for sagas)

**Implementation Complexity**: **Complex** (8-12 weeks)

---

## Option 3: Unified Transaction Script with Snapshotted State

### System Architecture
A single, monolithic transaction script runs the entire tick in one function call. No intermediate artifacts stored—only the final state and a diff snapshot. Think "Git commit" model.

```plaintext
┌─────────────────────────────────────────────────────────────┐
│              API Endpoint (Next.js)                         │
│              /api/tick (Single Function)                    │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│          TickTransactionScript (One File)                   │
│  - All agents called in sequence                            │
│  - Shared in-memory state object                            │
│  - No intermediate persistence                              │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│          StateManager (In-Memory + Postgres)                │
│  - Load: baseState + replay events                          │
│  - Commit: create snapshot diff                             │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                     Postgres                                │
│  - Only tick_committed and event_log tables                 │
└─────────────────────────────────────────────────────────────┘
```

### Core Modules & Responsibilities

**TickTransactionScript** (Single 500-line function)
- Sequential agent calls with shared `state` object
- Agents are internal functions, not separate modules
- Context passed as function parameters (no builders)
- No Redis—everything in memory until commit

**StateManager**
- `load(sessionId)`: Fetches latest snapshot + events since snapshot
- `commit(tickId, state, events)`: Creates new snapshot if event count > threshold
- Snapshot is a JSONB blob of entire world state (transcript, NPCs, etc.)

**Postgres Schema**
```sql
CREATE TABLE tick_committed (
  tick_id UUID PRIMARY KEY,
  session_id UUID,
  world_time TIMESTAMP,
  snapshot JSONB,  -- Full state at this tick
  events_since_snapshot JSONB,  -- Events after previous snapshot
  random_seed BIGINT
);

CREATE TABLE npc_identity (
  npc_id UUID PRIMARY KEY,
  session_id UUID,
  core_personality JSONB
);
```

**Editability Mechanism**
- To edit: load snapshot at tick N, modify in-memory state, replay events N+1→M
- No artifact versioning—edit the snapshot directly
- "Regenerate" means rollback to previous snapshot and replay

### Pros/Cons Evaluation

| Criterion | Score | Pros | Cons |
|-----------|-------|------|------|
| **Editability** | ⭐⭐⭐ | Can edit snapshots directly; simple replay logic | No intermediate artifact editing—must edit final state only |
| **Simplicity** | ⭐⭐⭐⭐⭐ | Single file, no infrastructure beyond Postgres; easiest for non-experts | Large function becomes unwieldy; agents not isolated |
| **Reliability** | ⭐⭐⭐ | Single transaction commit; no distributed state | No partial failure recovery—entire tick fails on any error |
| **Testability** | ⭐⭐⭐ | Easy to test whole tick; hard to test agents in isolation | Agents share state—tests have side effects |
| **Performance** | ⭐⭐⭐⭐⭐ | 1-2 DB writes per tick (snapshot + optional event log); no network calls | Memory usage grows with tick count; snapshots become large |
| **Flexibility** | ⭐⭐ | Regeneration requires replay from snapshot—can't pick mid-point | Tightly coupled agents; can't swap implementations easily |
| **Developer Experience** | ⭐⭐⭐⭐⭐ | No Redis needed; debug with console.log; works on any laptop | Refactoring is risky; no clear boundaries |
| **Production Readiness** | ⭐⭐⭐ | Works perfectly on Vercel; no connection pooling issues | Serverless timeout risk for long ticks; no background processing |

**Tech Stack**: Next.js, Neon Postgres, Zod, Vercel Cron (for background snapshots)

**Implementation Complexity**: **Simple** (2-3 weeks)

---

## Final Recommendation

### **Choose Option 1: Orchestrator + Context Builders**

**Rationale by Priority:**

1. **Editability (Paramount)**: Option 1 is the only architecture that allows surgical regeneration at any agent boundary. The Redis artifact store provides a complete, versioned audit trail that users can inspect and modify via a simple UI. Option 2 requires manual event publishing, and Option 3 only supports snapshot-level editing.

2. **Simplicity (Paramount)**: While Option 3 is simplest, Option 1 strikes the right balance—complexity is encapsulated in the orchestrator, but agents remain pure and understandable. A non-expert developer can read an agent function and understand its inputs/outputs without grokking the entire system. Option 2's distributed nature is too complex for solo developers.

3. **Reliability (Paramount)**: Option 1's single-commit transaction with Redis locking provides the strongest guarantees against partial writes and race conditions. The orchestrator can implement retry logic with exponential backoff and maintain a consistent state machine. Option 3 has no recovery mechanism, and Option 2's eventual consistency is harder to reason about.

**Implementation Roadmap (4-6 weeks):**

- **Week 1**: Refactor current agents to pure functions with Zod schemas
- **Week 2**: Build `ContextBuilder` classes and `TickOrchestrator` skeleton
- **Week 3**: Implement Redis runtime storage and artifact versioning
- **Week 4**: Migrate Postgres schema to event-sourced model, add snapshotting
- **Week 5**: Build regeneration UI and rewind/replay logic
- **Week 6**: Edge case handling (auth, timeouts, guest sessions) and load testing

**Key Design Decisions:**

- **Redis TTL**: Set to 1 hour for failed ticks, 24 hours for in-progress ticks
- **Snapshot Frequency**: Every 10 ticks or when event count > 100
- **Serverless Timeout**: Use Inngest for ticks that exceed 30s (rare but possible)
- **Guest Sessions**: Use `sessionId` (not `userId`) as primary key everywhere; treat userId as optional metadata

**Trade-off Acceptance**: The moderate complexity is worth it for the editability and reliability gains. The Redis dependency is acceptable given Vercel KV's serverless pricing and your existing infrastructure.

**Migration Path**: Can be done incrementally—migrate one agent at a time to the new pattern while keeping legacy routes active. The `TickOrchestrator` can detect old vs. new session formats and adapt accordingly.