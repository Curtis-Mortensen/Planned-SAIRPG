# SAIRPG System Specification (v2)
*No code. Architecture + decisions + staged rollout.*

## 0. What changed vs v1 (high-level)
This v2 spec is an iteration on `System-Spec.md`, updated to reflect your clarified direction and to improve scale + flexibility.

- **Dynamic flows as the default**: v2 assumes the simulation is a dynamic event graph (not a mostly-linear chain with conditionals).
- **Redis Streams from day one**: v2 commits to a real event bus immediately, with consumer groups, retries, and dead-lettering.
- **DB-stored prompt templates**: v2 treats prompts as versioned DB entities (editable/rollbackable), and requires artifacts to store the compiled prompt + template version used.
- **Per-world DB creation**: v2 supports “DB created per world” via per-world Postgres schemas (`world_<session_id>`), enabling user-created agents and entirely different loops per world.
- **AgentPacks as first-class**: v2 introduces AgentPacks as the unit of customization (agents + prompts + settings + optional storage declarations) and records the pack version on world creation for replayability.
- **Clearer replay semantics**: v2 distinguishes historical replay (use stored artifacts) vs regeneration replay (re-run agents), so “editability” stays unambiguous as prompts evolve.
- **Idempotency is mandatory**: v2 elevates idempotency keys/behavior as a core requirement because Redis Streams implies retries and parallelism.
- **Safer “player transparency”**: v2 emphasizes inspectability via artifacts and structured explanations without relying on exposing private chain-of-thought.

## 1. Purpose
This document specifies an event-driven AI RPG engine designed to start simple and scale to many concurrent players. The system is built to be:

- **Event-sourced** (immutable history is the source of truth)
- **Editable** (player can change past AI outputs and replay from that point)
- **Observable** (player can inspect agent inputs/outputs/settings per tick)
- **Extensible** (new agents plug in without rewriting central orchestration)
- **Scale-ready** (Redis Streams from day one, idempotent workers, partitioned data)

This is an iteration on the existing `System-Spec.md` and `database/README.md`, but it intentionally challenges assumptions and proposes improvements where helpful.

---

## 2. Core mental model

### 2.1 Two kinds of “events”
Do not conflate these:

- **Event Bus events**: messages delivered to workers (Redis Streams). This is an operational delivery mechanism.
- **Event Store events**: immutable records in Postgres. This is canonical history used for replay, branching, saves, and audit.

The Event Store is the source of truth. The Event Bus is “how work gets done.”

### 2.2 Agents are independent workers; flows are dynamic graphs
There is no single hard-coded chain. Instead:

- Agents **subscribe** to event types.
- Agents **emit** events that may trigger other agents.
- Optional/conditional loops (NPC reactions, outline expansions, approvals) happen naturally when the triggering events exist.

This matches the requirement that “the chain of agents is different depending on the situation.”

---

## 3. Non-negotiable invariants

### 3.1 Editability is first-class from Stage 1
- Editing any agent output **never mutates history**.
- An edit **creates a new branch** and emits an explicit edit event.
- Replay from that point re-runs downstream work on the new branch.

### 3.2 Determinism where possible; explicit recording where not
- Non-LLM randomness (dice rolls) is deterministic and recorded (seed + roll outputs).
- LLM outputs are not assumed deterministic; therefore **the prompt + settings + model params + raw response must be stored** as artifacts so the exact prior output is inspectable.

### 3.3 Idempotency is mandatory
With Redis Streams + retries, every agent must be safe to re-run on the same input without duplicating state changes.

### 3.4 Agent failures degrade gracefully
Each agent has:
- strict input/output schemas
- a **fallback output** that is schema-valid and lets the tick continue
- structured error events (sanitized)

### 3.5 Player transparency without exposing chain-of-thought
The UI can show:
- event flow
- artifacts (inputs/outputs/settings)
- prompts/messages sent to LLM (as configured)
- structured intermediate “steps”

But the system should not depend on or reveal private chain-of-thought. Prefer structured reasoning fields or “explanations” designed for the player.

---

## 4. System components

### 4.1 Next.js application (UI + API)
Responsibilities:
- game UI (narrative, player input, world view)
- event inspector UI (live feed + artifacts per tick)
- timeline UI (ticks + branches + saves)
- settings UI (dynamically generated from agent setting schemas stored in DB)
- API endpoints for:
  - submitting player actions
  - approving/rejecting proposed events (Stage 2)
  - editing artifacts (Stage 1+)
  - creating/loading saves (Stage 1+)

### 4.2 Redis Streams (Event Bus)
Responsibilities:
- deliver work items to agent workers
- support consumer groups (horizontal scaling per agent)
- provide retries, backpressure, dead-lettering

Design requirements:
- partition keys ensure isolation by `session_id` (and `branch_id`)
- jobs are acknowledged only after:
  - event-store writes are complete
  - downstream events are emitted (or atomically recorded for later emission)

### 4.3 Postgres (Event Store + configuration + artifacts)
Responsibilities:
- canonical event history (append-only)
- agent registry + settings schemas + settings values
- prompt templates (stored in DB, versioned)
- artifacts (agent executions, including compiled prompts and outputs)
- saves, branches, snapshots/read-model (as needed)

---

## 5. Data model (conceptual)

### 5.1 Identifiers
- `session_id`: a world/playthrough (also the main sharding key)
- `branch_id`: timeline fork for edits or load-as-branch
- `tick_id`: one simulation step (one “loop”)
- `event_id`: immutable record for a state transition or noteworthy occurrence
- `artifact_id`: one agent execution record
- `agent_id`: stable agent identifier (string)

### 5.2 Event Store: events (canonical)
Each event MUST include:
- `event_id`, `session_id`, `branch_id`, `tick_id`
- `event_type` (string enum)
- `producer_kind` (`user` | `system` | `agent`)
- `producer_id` (agent_id or user_id/session actor)
- `payload` (JSON)
- `created_at`
- `sequence_in_tick` (monotonic ordering)
- `causation_event_id` (what caused this)
- `correlation_id` (ties all work for a tick/operation together)

**Design note:** keep events immutable. If something changes, record a new event.

### 5.3 Artifacts: agent executions (debuggable + replayable)
Each artifact records:
- the input event reference (event_id)
- the agent id + agent version
- the resolved settings snapshot (exact values used)
- the prompt template reference(s) + template version(s)
- the compiled prompt/messages actually sent to the LLM
- model + parameters (temperature, max tokens, etc.)
- output payload (structured JSON)
- raw provider response (as needed; sanitized for UI)
- status: `success` | `fallback` | `failed`
- error metadata (sanitized)
- timing info

Artifacts are what power the inspector UI and support “edit this output.”

### 5.4 Branching
Branching rules:
- A branch is created on:
  - artifact edit
  - “load save as branch”
  - explicit “fork timeline”
- Exactly one branch is “active” per session by default (player can switch).

### 5.5 Saves
A save is a named pointer to:
- `(session_id, branch_id, tick_id)`
and optionally:
- a snapshot pointer
- a narrative preview and metadata for the UI

Auto-save after every tick commit in Stage 1.

---

## 6. Prompts stored in DB (required) — how this works safely

### 6.1 Why DB-stored prompts
You want settings sliders to change how agents behave. If prompts live in DB:
- prompts can be iterated without redeploy
- prompts can be versioned and rolled back
- prompts can be edited per agent (and optionally per world/session later)

### 6.2 Prompt template entities
Each agent has one or more prompt templates stored in DB:
- `agent_id`
- `prompt_key` (e.g., `evaluate_action`, `narrate_outcome`)
- `template_version` (monotonic)
- `template_format` (recommended: structured “messages” template rather than raw string)
- `template_body` (text/json)
- `variables_schema` (what variables must be provided)
- `safety_rules` (hard constraints; e.g., “no spoilers,” “no system prompt leakage”)
- `is_active`
- `created_at`, `created_by`

### 6.3 Prompt compilation at runtime
At execution time, an agent:
- loads the active prompt template for its `prompt_key`
- loads the current settings values for (session_id, branch_id) scope
- builds a **prompt variables object** (strictly validated)
- compiles final messages
- stores the compiled messages in the artifact

### 6.4 Reproducibility vs iteration
To support replay and debugging:
- the artifact stores `template_version` and the compiled messages used
- future template edits do not alter past artifacts

**Replay modes (explicit):**
- **Historical replay**: uses recorded artifact outputs (fast, exact, no cost)
- **Regeneration replay**: re-runs agents using the prompt versions frozen at the time (or optionally latest)

The UI should make this choice clear when the user edits or regenerates.

### 6.5 Security & safety boundary
DB-stored prompts introduce risk (prompt injection and accidental unsafe edits). Minimum safeguards:
- only allow edits by authorized roles (admin/dev)
- enforce validation on templates (required variables, length, banned patterns)
- keep “hard safety rules” in code as a final gate where possible

---

## 7. Settings system (DB-backed; UI-generated)

### 7.1 Settings schema vs settings values
Each agent defines a schema:
- parameters with type/min/max/default/step
- UI hints (slider, toggle, select)
- user-facing labels/descriptions

Schemas are stored in DB so the settings UI can be generated dynamically.

Values are stored in DB and scoped:
- **Session scope** (default)
- **Branch scope** (optional; recommended for edits/experiments)
- **Tick override** (later, explicit “just for next tick”)

### 7.2 “Slider updates prompt”
Changing a slider:
- updates DB settings values
- subsequent agent executions read those values and compile prompts accordingly

No runtime file editing is required.

---

## 8. Execution + routing model (Redis Streams day one)

### 8.1 Event envelopes
Every bus message should contain:
- `event_id` (points to canonical Postgres event)
- `event_type`
- `session_id`, `branch_id`, `tick_id`
- `correlation_id`

Workers should treat Redis as delivery only and read canonical payload from Postgres to avoid “dual source of truth.”

### 8.2 Idempotency keys
Each agent must implement idempotency based on:
- `(agent_id, input_event_id, settings_hash)` within `(session_id, branch_id)`

If an artifact already exists for that key, the agent should not duplicate downstream emissions.

### 8.3 Dead-lettering and retries
Failed messages:
- are retried with capped exponential backoff
- eventually moved to a dead-letter stream
- generate `AGENT_FAILED` events and show in UI

---

## 9. Staged implementation plan (the "rock solid loop" approach)

### Stage 0: UI shell + infrastructure + auth
Goal: a working product skeleton using the existing Chatbot implementation.

**Key Decision**: We're building on an existing Chatbot implementation that handles:
- Authentication (login, sessions, user management)
- LLM streaming and message display
- Chat UI components
- Message history (decision TBD — see `Questions.md`)

Deliverables:
- Existing chatbot cloned/forked and running
- Auth working (via chatbot's existing system)
- World/scenario selection UI (choose starting scenario)
- Opening narration for selected scenario
- Redis Streams + Postgres wired conceptually (publish/consume test events)
- Docker Compose for local dev (Postgres + Redis)

**Stage 0 is about "what we get for free" from the chatbot + basic infrastructure.**

Tests:
- Auth flow works (login, logout, session persistence)
- Can create new game with scenario selection
- Opening narration displays
- Postgres and Redis connections work

---

### Stage 1: Core game loop
Goal: Player types action → evaluate → roll → narrate → display.

**See `Stage-1-Stories.md` for detailed implementation plan (9 stories).**

Agents:
1. **PlayerActionEvaluator** — interprets intent, assigns difficulty
2. **ProbabilityRoller** — deterministic dice with seeded RNG
3. **Narrator** — generates narrative based on outcome

Key requirements:
- DB-stored prompts with versioning
- Artifacts store compiled prompt + template version
- All agents idempotent
- Fallbacks for LLM failures

Tests:
- contract tests for each agent (schema-valid outputs)
- deterministic dice-roll tests (seeded)
- idempotency tests (reprocessing same event is safe)

**NOT in Stage 1**: saves, editing, branching, inspector (moved to Stage 2)

---

### Stage 2: Saves, editing, observability
Goal: Player can save/load, edit outputs (creating branches), see what's happening.

**See `Stage-2-Stories.md` for detailed implementation plan (6 stories).**

Features:
- Manual + auto-save (auto-save rotation)
- Load creates new branch (never mutates history)
- Edit artifact → create branch → replay downstream
- Event inspector panel
- Prompt editing UI with version history
- Settings UI (narrator tone, verbosity)

Tests:
- branch creation tests (edit forks, original preserved)
- save/load tests (restores correct branch + tick)
- settings affect subsequent outputs

---

### Stage 3: Meta-events + approval gate + probability from DB
Add agents:
- MetaEventGenerator (propose)
- PlayerApprovalGate (UI step)
- ProbabilityLookup (DB-driven event odds)

Notes:
- approval is modeled as events, not "UI state"
- meta-event definitions and probability modifiers live in DB

---

### Stage 4: Outline + NPC decision loop
Add agents:
- OutlineWorker
- NpcDecisionWorker

Defaults:
- 2 NPCs respond per scene initially
- player adjustable via settings with hard safety caps

Loop safety:
- max NPC decisions per tick
- max chain depth per tick
- explicit "loop complete" event when stable

---

### Stage 5: Location tracking + time
Add:
- Location discovery and tracking
- World time progression
- Location-based context for narration

---

### Stage 6: Player character
Add:
- Character creation / stats
- Skills affecting dice rolls
- Character state persistence

---

## 10. Per-world database creation (agent-pack driven)
You explicitly want worlds to be able to have **entirely different agent loops**, including user-created agents in the future. That implies the system must support **world-scoped “database creation” at world start**.

This spec supports that requirement while keeping it safe and scalable.

### 10.1 What “DB per world” means (recommended)
Use **one Postgres cluster** and create a **dedicated Postgres schema per world**:

- A stable global schema: `core.*` (sessions, branches, canonical events, artifacts, saves, prompt templates, agent registry, etc.)
- A per-world schema namespace: `world_<session_id>.*` (optional agent-specific tables for that world only)

This gives isolation and customizability without requiring a separate physical Postgres database per world.

### 10.2 AgentPacks: the unit of customization
Define an **AgentPack** as the set of agents + settings + prompt templates + (optional) storage declarations that make up a world’s simulation loop.

At world creation, the player selects (or authors) an AgentPack:
- `agent_pack_id`
- `agent_pack_version`
- list of `agent_id`s included
- per-agent settings schema defaults
- per-agent prompt templates (stored in DB, versioned)
- per-agent storage declarations (see below)

The AgentPack version is stored on the session so the world is replayable even if the pack evolves later.

### 10.3 World-start “schema assembly” flow
On new world start (new `session_id`), the system:

1. Creates `core.sessions` row + main `branch_id`
2. Registers the AgentPack chosen for this world
3. Creates the schema namespace `world_<session_id>`
4. Applies the AgentPack’s **storage declarations** to create tables/indexes inside `world_<session_id>`
5. Inserts default settings values for the session/branch scope
6. Inserts the active prompt templates for each agent/prompt_key (DB-stored prompts)

### 10.4 Storage declarations: allow “DB per world” without arbitrary SQL
To support user-created agents safely, **do not accept raw SQL from untrusted users**.

Instead, each agent provides a *declarative* storage spec (a constrained DSL), for example:
- table name
- columns (type allowlist)
- primary key / simple indexes
- JSONB columns for flexible payloads

The system compiles this DSL to SQL and applies it to `world_<session_id>` with validation:
- disallow dangerous statements
- enforce naming rules
- cap number of tables/indexes per world (resource safety)

This is the key to making “players can add agents” feasible without handing them DDL injection.

### 10.5 Scaling reality check (catalog growth)
Per-world schemas increase Postgres catalog objects (tables/indexes). This can scale well to many worlds if:
- most custom agents use a small number of generic tables (often 0–2)
- heavy “custom schema” worlds are gated (premium / dedicated DB / fewer per cluster)
- the system favors **generic core tables** (`core.artifacts`, `core.events`) and uses world schema tables only when it truly helps

If you eventually need hard isolation, you can offer:
- **Shared cluster + per-world schema** (default)
- **Dedicated database per world** (premium/large worlds)

### 10.6 Migrations when AgentPacks change
Two separate concepts:

- **Prompt + settings changes**: easy (DB versioning, no schema change required)
- **Schema changes**: hard; must be controlled

Recommended rule: per-world schema migrations are **additive only** (create table, add column, add index).
If a user deletes or radically changes an agent’s schema, handle it by:
- creating a new AgentPack version
- creating a new world branch (or new world)
- replaying with new storage (export/import if needed)

---

## 11. Compose assembly (design note; no files created here)
Each agent provides a manifest describing:
- whether it needs a worker process
- whether it requires Redis/Postgres extensions
- resource hints (CPU/memory) for local dev

A generator can assemble:
- a local `docker-compose.yml` for dev
- environment templates

Production should prefer managed Postgres + managed Redis, with a single app deploy plus worker deploys.

---

## 12. Key improvements vs prior drafts
- Separates bus delivery from store truth to reduce consistency bugs.
- Makes DB-stored prompts safe via versioning + artifact capture.
- Recommends stable core schema (avoid per-world dynamic DDL) while preserving “agent-driven” modularity.
- Formalizes replay modes (historical vs regeneration) so editability doesn’t become ambiguous.
- Treats idempotency as first-class (required for Redis Streams reliability).


