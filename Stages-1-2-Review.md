# Stages 1–2 Review (Critique + Contrarian Takes)
*Reviewer perspective across `System-Spec.md`, `System-Spec-v2.md`, `Event-Log.md` (sample), `Stage-1-Stories.md`, `Stage-2-Stories.md`, plus supporting notes.*

## Executive summary

You’re doing a lot right: the Stage 1/2 stories are crisp, testable, and they correctly front-load the **“invisible” correctness properties** (schemas, artifacts, idempotency, determinism) that will otherwise metastasize. The v2 spec also makes the right call to separate **Event Bus delivery** from **Event Store truth**, and to formalize artifacts as the unit of inspection + replay.

That said, Stages 1–2 are currently at risk of becoming a “looks good on paper” architecture that is **operationally fragile**, **internally inconsistent across docs**, and **hard to evolve** once Stage 3+ introduces multi-agent graphs, multi-tick interactions, and UI approval gates.

This review focuses on: contradictions, likely failure modes, and specific changes to make now so Stages 1–2 remain simple while still being future-safe.

---

## Cross-document contradictions / drift (fix these first)

- **Save/Load scope drift**
  - **Docs conflict**: `System-Spec.md` includes save/load in “Phase 1”; `System-Spec-v2.md` and `Stage-1-Stories.md` explicitly defer saves/branching/editing to Stage 2.
  - **Why it matters**: DB schemas and “definition of done” will diverge; you’ll implement tables too early or omit them when needed.
  - **Suggestion**: pick one canonical plan (it looks like v2 + Stage Stories), then:
    - update `System-Spec.md` (or mark it “superseded by v2”)
    - update `database/README.md` section that labels `save-load.sql` as “Phase 1”

- **Prompt editing permissions**
  - **v2** says DB-stored prompts need safeguards and only authorized roles should edit templates.
  - **Stage 2** says “Player can edit prompt templates.”
  - **Suggestion**: clarify this as either:
    - **Developer Mode / Admin-only** prompt editing (recommended), or
    - “Player prompt editing” as a **world authoring feature** with strict constraints + warnings (later stage, not Stage 2).

- **“Tick” vs “Round” vs “Subevent” semantics**
  - `Event-Log.md` shows **Round → Subevent → Tick** and even multiple ticks inside one player_action.
  - `Questions.md` says “Tick = one loop, whatever triggers it” (✅ decided).
  - **Risk**: you’ll implement “tick” as “one chat message” in Stage 1, but your own sample world log already uses a richer hierarchy.
  - **Suggestion**: decide terminology now:
    - **Tick**: smallest atomic unit that commits (event ordering, artifacts, commit marker).
    - **Round** (optional): higher-level grouping for UI/time progression (can be derived later).
    - **Subevent** (optional): narrative/logging grouping key (again can be derived later).

---

## Contrarian takes (the “push back” section)

- **Contrarian take #1: Redis Streams “from day one” is not automatically the right Stage 1 choice**
  - Stage 1’s hardest problem is *correctness of event-store + artifacts + determinism + idempotency*, not throughput.
  - Redis Streams introduces operational complexity (consumer groups, pending entries, retries, poison messages, deployment constraints) before you have product value.
  - **If you deploy on Vercel**, long-running `XREADGROUP` consumers are a mismatch (your own `Stage-1-Stories.md` acknowledges this).
  - **Suggestion**: for Stage 1, consider a “single-process worker” mode:
    - same event model + Postgres event store
    - a simple in-process dispatcher that processes the event graph synchronously for dev
    - *then* add Redis Streams consumers as a Stage 1.1/1.4 extension (or Stage 1.9) once correctness is stable
  - If you keep Redis in Stage 1 anyway, then make “worker deployment target” a **blocking decision** (see `Questions.md`).

- **Contrarian take #2: Your Stage 1 “no inspector UI” posture is correct, but you still need a minimal debug surface**
  - Without an inspector (or at least an admin/debug page), troubleshooting idempotency and replay is painful.
  - **Suggestion**: keep UI minimal, but add:
    - a basic “last tick trace” dev view (events + artifacts list) behind a dev-only flag.

- **Contrarian take #3: “Most actions should be moderate” is a hidden design choice that will distort gameplay**
  - It seems harmless early, but it implicitly defines the difficulty distribution and pacing.
  - If you later add character stats (Stage 6) and bounded accuracy, you’ll need to revisit this.
  - **Suggestion**: treat difficulty distribution as a configurable policy (even if hardcoded for now), and store the evaluator’s rationale fields so you can audit later.

- **Contrarian take #4: Storing full “old vs new” payloads inside edit events can become a data bomb**
  - Stage 2 suggests `ARTIFACT_EDITED` events that embed full old/new payloads.
  - That’s fine for small objects; it is not fine once payloads include compiled prompts, raw responses, or large narratives.
  - **Suggestion**: store references + diffs:
    - event payload contains `original_artifact_id`, `new_artifact_id`, and optionally a small JSON Patch diff.

---

## Stage 1 review (Story-by-story risks + suggestions)

### Story 1.0 — DB schema & local dev env

- **Likely problem**: `tick_id` being `NOT NULL` on `events` while ticks/events “create each other”
  - Your story hints at this (“don’t add FK to ticks yet”) which is correct, but the *deeper problem* is ordering + atomicity:
    - who owns `tick_id` creation?
    - what happens if you emit a downstream event before a tick is formally created/committed?
- **Suggestion**:
  - require `tick_id` to exist before *any* events are inserted for that tick
  - make “tick created” the first DB write in the transaction that begins the loop

- **Likely problem**: `sequence_in_tick` correctness
  - “max(sequence)+1” is race-prone if multiple workers emit concurrently for the same tick.
  - **Suggestion** (pick one):
    - Make Stage 1 strictly linear → then sequence can be fixed (0..N) deterministically.
    - Or add a dedicated `events_sequence` per tick (DB sequence table / advisory lock) if you expect concurrency soon.

### Story 1.1 — Redis Streams foundation

- **Key correction**: Redis Streams consumer groups are **at-least-once**, not exactly-once.
  - Exactly-once only emerges at the *system* level via idempotency + transactional writes.

- **Stream key design**
  - Story says `events:${sessionId}` (good for partitioning), but then you want to subscribe by event type.
  - Redis Streams does not support server-side filtering by field; consumers would read *everything* for a session and discard non-matching types.
  - **Suggestion**:
    - Either: one stream per `(session_id)` and keep Stage 1 single-consumer per session.
    - Or: one stream per `(session_id, agent_id)` (route at publish time).
    - Or: one stream per `(event_type)` but include partitioning by session in message group keys (tradeoffs).
  - Whatever you choose, document it as a firm invariant in v2.

### Story 1.2 — Agent contract types (Zod)

- Strong.
- **Watch out**: You’re already drifting toward Stage 8 style outputs (worldStateChanges, trees, NPC involvement).
  - Stage 1 says world state is a text blob (✅ in `Questions.md`).
  - **Suggestion**: keep Stage 1 schemas minimal, but reserve an extension point:
    - `metadata?: Record<string, unknown>` on all outputs
    - avoid hardcoding future structures too early

### Story 1.3 — Probability roller (determinism)

- **High risk hidden in the pseudo-code**: choosing `seed = Date.now()` when not provided.
  - If the worker crashes after emitting the next event but before persisting the artifact (or vice versa), retries could produce different rolls.
  - Idempotency prevents double *commit* once the artifact exists, but it does not help if you crash mid-flight before the artifact row exists.
- **Suggestion**:
  - derive the seed deterministically from stable identifiers (e.g., `hash(input_event_id)`), and always store it.
  - make the “roll requested” event payload explicitly include the seed used.

### Story 1.4 — Tick lifecycle & event flow

- **Naming reality check**: calling `lib/tick/index.ts` a “coordinator not orchestrator” doesn’t change the fact it’s orchestrating.
  - That’s not bad! It’s normal for Stage 1 to be linear.
  - The risk is pretending it isn’t, and then later fighting your own abstractions.

- **Idempotency key definition**
  - v2 says idempotency should include settings hash; Stage 1 examples compute it as `${agentId}:${inputEventId}:${hash(settings)}` (good).
  - But the worker pseudo-code sometimes computes idempotency without settings.
  - **Suggestion**: lock this down:
    - idempotency key = hash(agent_id + input_event_id + settings_snapshot + code_version + prompt_template_version)
    - (If you omit prompt version, you’ll get confusing behavior when templates change.)

- **Envelope schema drift**
  - Stage 1 `EventEnvelope` doesn’t include `sequence`, but later code uses `envelope.sequence`.
  - Stage 2 edit/replay pseudo-code references `editedArtifact.outputEventType`, which isn’t defined anywhere.
  - **Suggestion**: standardize a single canonical envelope:
    - it should include `event_id`, `event_type`, `session_id`, `branch_id`, `tick_id`, `correlation_id`, `causation_event_id`
    - do *not* rely on ephemeral fields like “sequence” in Redis; read ordering from Postgres.

### Story 1.5 — DB-stored prompts

- **Security mismatch**: Stage 1 assumes DB prompts; Stage 2 gives editing UI. v2 says restrict edits.
  - Resolve as “admin-only” early.

- **Template compilation**
  - The suggested `replaceAll` is OK for Stage 1, but note:
    - repeated replacements can accidentally replace user-provided braces
    - you’ll want structured message templates eventually (v2 recommends that)
  - **Suggestion**: keep Stage 1 simple but store **compiled messages** in artifacts in a structured array shape even if your template is a string today.

### Stories 1.6–1.8 — LLM agents + UI integration

- **Strong call**: `generateObject`/schema-driven output is the right pattern.
- **Main risk**: “chatbot message stream” vs “event-sourced truth”
  - If you let the chatbot’s message history become the truth, you’ll later have a hard time reconciling with branches/saves/replay.
  - **Suggestion**: even in Stage 1, treat chat UI as a *projection* of event store + artifacts.

---

## Stage 2 review (hard problems + holes)

### Story 2.0 — Save system

- **Load-as-branch is correct**, but make it transactional:
  - branch creation + branch activation + save load pointer should happen in one DB transaction.

- **Preview text**
  - Good idea to store at save time.
  - But define “latestNarrative” precisely: is it the last Narrator artifact for that tick? the last committed narrative segment? something else?

- **Auto-save timing**
  - Auto-save “after `TICK_COMMITTED`” assumes you have a reliable commit event and that all artifacts for that tick have been written.
  - **Suggestion**: define tick commit conditions:
    - “terminal event produced” (e.g., narration complete), or
    - “tick coordinator emits `TICK_COMMITTED` after verifying expected artifacts exist”

### Story 2.1 — Artifact editing & branch replay

- This is indeed the hardest part, and the pseudo-code has several future foot-guns:

- **Fork point semantics**
  - v2 says “edit creates a new branch from that point”.
  - DB README describes “branch from tick’s parent.”
  - Event log sample implies editing within a round/subevent might create more granular forks.
  - **Suggestion**: specify:
    - edits fork at `(session_id, branch_id, tick_id)` and create a new `branch_id` whose `fork_tick_id = tick_id`

- **Downstream dependency graph**
  - Hardcoding `DOWNSTREAM_AGENTS` is fine for Stage 2, but the mapping in the doc is inconsistent with Stage 1 event names (`ROLL_RESOLVED` vs `OUTCOME_DETERMINED` vs `NARRATION_COMPLETE` etc).
  - **Suggestion**: define a canonical event type vocabulary now, and keep it consistent across docs and tables.

- **Replay depth**
  - Great to cap it; make sure every replay event carries:
    - `replay_depth`
    - `replay_root_event_id` (the edit event)

- **Idempotency for replays**
  - If replay events reuse the same `event_type` and payload, you need to ensure the idempotency key changes per branch and per causation chain.
  - Suggestion: include `branch_id` and `input_event_id` in the key (v2 already implies this).

### Story 2.2 — Event inspector panel

- Biggest product risk: if the inspector becomes a dumping ground for raw JSON and prompts, users will ignore it.
- **Suggestion**:
  - build “summary-first” cards (status, duration, key output fields)
  - keep full JSON and prompt behind expansion
  - add “copy artifact” and “copy event” affordances for debugging

### Story 2.3 — Save/load UI

- The “branching explanation” callout is correct.
- **Suggestion**: add a persistent indicator:
  - current `session_id` name + current `branch_id` label (“Main”, “From Save X”, “Edit of Tick Y”)

### Story 2.4 — Settings UI

- **Bug / mismatch**: the example uses dotted keys like `narrator.tone` but writes with JSON merge `settings || $3`.
  - Postgres JSON merge does not interpret dotted paths; you’ll end up with `{ "narrator.tone": "gritty" }` rather than `{ narrator: { tone: "gritty" } }`.
- **Suggestion**:
  - either send nested JSON objects (recommended) and merge, or
  - use `jsonb_set` with explicit paths.

- **Branch inheritance**
  - Great call: “settings are per-branch, copy on new branch.”
  - Make sure this is defined as a hard invariant in v2 (it matters for replay reproducibility).

### Story 2.5 — Prompt editing UI

- Again: permissions need clarity (admin-only vs player-authoring).
- **Critical conceptual distinction** (v2 gets this right; Stage 2 needs to mirror it):
  - “Edit artifact output” = changes history via branch.
  - “Edit prompt template” = changes future generations; past artifacts remain inspectable.
- **Suggestion**: make the UI explicitly name these two actions:
  - **Edit Output (branch)** vs **Edit Template (future)**.

---

## Implications from the Stage-8 sample `Event-Log.md` (early design guardrails)

Your sample log already implies future systems that will pressure early choices:

- **Multiple ticks per “player action”**
  - In Round 1, subevent 1.3 has tick 1 and tick 2 with “pending → resolved” style progression.
  - That looks like an interactive dialogue loop with an NPC, not a single atomic action.
  - **Guardrail**: design Stage 1 tick lifecycle so a tick can either:
    - complete in one pass, or
    - remain “pending” with follow-up inputs, without breaking event ordering or save semantics.

- **Committed structure trees**
  - The sample has tree IDs with branches/probabilities, NPC traits, selected branches.
  - Even if Stage 1 doesn’t implement this, it suggests that later you will want:
    - stable identifiers for decision structures
    - “why did this branch happen?” traceability
  - **Guardrail**: store causation/correlation consistently; don’t rely on UI message order.

- **Meta-events repository and approval decisions**
  - The sample includes approved/rejected/triggered events with rarity windows.
  - That puts pressure on Stage 2’s branching and replay semantics: if you load a save and branch, which meta-event repository state do you see?
  - **Guardrail**: treat meta-event state as event-sourced records in the branch, not mutable “world state blobs”.

- **World state is presented as YAML**
  - YAML is nice for human reading but you’ll want canonical JSON objects in the DB.
  - **Guardrail**: pick JSON as canonical; render YAML as a view if you want.

---

## “Things likely to bite you” shortlist (practical warnings)

- **Operational mismatch**: Redis Streams + consumer groups + serverless platform timeouts.
- **At-least-once realities**: you must assume duplicate delivery and partial failures.
- **Idempotency holes**: any place you “emit then persist” (or vice versa) without a transaction/outbox will create ghost duplicates.
- **Vocabulary drift**: event type names differ across docs; this will slow you down and create subtle bugs.
- **Settings update semantics**: dotted-path JSON updates will not work as written.
- **Branch explosion UX**: Stage 2 acknowledges “infinite branches” is OK; still, users need “where am I?” clarity very early.

---

## Recommendations (actionable changes before implementing Stage 1)

- **Doc hygiene**
  - **Pick v2 + Stage Stories as canonical**, and mark/adjust v1 + DB README to match.
  - Create a single “Event Type Registry” section (even just a table) and reuse it everywhere.

- **Deterministic dice seed policy**
  - Define a deterministic seed derivation rule now (from stable IDs), store it in the event payload and artifact.

- **Envelope + artifact fields**
  - Decide what must exist in every event/artifact (IDs, causation, correlation, prompt version, settings snapshot hash, model params).
  - Add explicit fields for: `replay_depth`, `replay_root_event_id`, `is_replay`.

- **Settings storage shape**
  - Decide whether settings are nested JSON (recommended) or flat keys, and make the API/UI follow that consistently.

- **Prompt editing permissions**
  - Decide: admin-only vs player-authoring; don’t leave it ambiguous because it changes security posture and UI language.

---

## Suggested “Stage 1–2 acceptance tests” (beyond the story DoDs)

- **Idempotency under crash**
  - Simulate: process event → crash after writing artifact but before emitting downstream → recovery should not emit downstream twice.
  - Simulate: crash after emitting downstream but before artifact write → recovery should not diverge outcome (requires deterministic seed or outbox).

- **Branch reproducibility**
  - Load save → branch created → subsequent actions should only read settings/prompts for that branch scope.

- **Inspector correctness**
  - For a single tick, the inspector must show:
    - the canonical event chain
    - the artifacts tied to each event
    - which prompt version + compiled prompt produced the output

---

## Open questions to answer (blocking-ish)

- **Where do workers run?** (from `Questions.md`)
  - If “Vercel only”, strongly reconsider Redis Streams as the primary bus in Stage 1.

- **What is a “tick” in interactive dialogue?**
  - Is “ask NPC question → NPC responds → player follow-up” one tick or multiple ticks? Your sample log suggests multiple ticks inside a subevent/round.

- **Canonical source of chat history**
  - Is it derived from events/artifacts (recommended), or stored separately as “chat messages” with eventual reconciliation?

---

## Closing note

Stages 1–2 are conceptually strong; the biggest danger is *not* technical difficulty—it’s **inconsistency** (naming, scope, semantics) and **operational mismatch** (streams vs serverless). If you tighten the invariants now (tick semantics, idempotency/seed policy, event type registry, settings JSON shape, prompt-edit permissions), the rest of the implementation plan becomes much more straightforward and resilient.


