# LLM RPG Simulation Data Storage
Created: 1/6/2026, 1:17:52 AM
Last Updated: 1/6/2026, 1:40:32 AM
---

### User

I'm a beginning coder using AI tools. I took an existing project- vercel's ai chatbot, and am converting it into a LLM based RPG simulation.  placeholders for cost tracking in the context panel, and for a comprehensive log in the world editor page. also, I have a whole plan sketched out for implimenting a series of modules that all have their own storage, and modify and draw on the main core module (narrator) to create the game loop. I need to figure out how I'm going to store things. Previously, the plan was to have each module be responsible for their own table in postgres. But I still need to figure out how to consolidate the log, and start integrating inngest, which is how we're going to build on the modules. Also, the narrator needs to have a prompt file in a prompt table, which needs to be pulled from to create prompt sliders on the world editor page, and then when those sliders are moved it needs to update the table (via a save button, otherwise changes can be discarded)

DON'T GENERATE ANY CODE. Just use diagrams and conversation and questions to talk me through different options. Give me at least 3 version and compare pros and cons of each. For example, some modules, like NPCs, are going to be wildly complex, and need their own tables, and be drawing from those tables to create the context for their module. Similarly, Meta events module needs it's own table to store events in. So is there a reason I shouldn't give them all their own tables? 

[System-Spec.md](https://upoevdcxa3.ufs.sh/f/IN4OjmY4wMHBWl4VpBtbhyg2CtSMnOxBFIcRU8635HGNzadY)
[README.md](https://upoevdcxa3.ufs.sh/f/IN4OjmY4wMHB2f03JUHiBsbTGJOFWDepQXtdnAhL59gwHiNR)

---

### Assistant (claude-4.5-opus)

<details>
<summary>Reasoning</summary>

The user is building an AI-powered RPG system and wants to discuss database architecture options for storing module data, prompts, logs, and how everything integrates. They specifically don't want code - just diagrams, discussion, and comparison of options.

Let me think through the key storage concerns:

1. **Module data storage** - Should each module have its own table(s)?
2. **Consolidated log/event store** - How to track all events across modules
3. **Prompt storage** - For the narrator and other modules, with versioning
4. **Integration with Inngest** - Workflow state management

Let me propose 3 different architectural approaches and compare them.

I don't need to search for this - it's a conceptual architecture discussion based on standard database design patterns.
</details>

# Database Architecture Options for SAIRPG

Great question, Curtis. Let's walk through this systematically. You're essentially asking: **"How much should I normalize vs. consolidate?"** and **"Where does the event log fit?"**

Let me give you three distinct approaches.

---

## Option 1: Full Module Isolation (Schema-per-Module)

```
┌─────────────────────────────────────────────────────────────┐
│                        PostgreSQL                           │
├─────────────────────────────────────────────────────────────┤
│  schema: core                                               │
│  ├── sessions                                               │
│  ├── prompts (versioned)                                    │
│  ├── artifacts (AI call logs)                               │
│  └── event_log (unified)                                    │
├─────────────────────────────────────────────────────────────┤
│  schema: mod_narrator                                       │
│  └── narrator_state                                         │
├─────────────────────────────────────────────────────────────┤
│  schema: mod_npc                                            │
│  ├── npc_definitions                                        │
│  ├── npc_relationships                                      │
│  └── npc_memory                                             │
├─────────────────────────────────────────────────────────────┤
│  schema: mod_meta_events                                    │
│  ├── event_definitions                                      │
│  ├── event_queue                                            │
│  └── event_triggers                                         │
├─────────────────────────────────────────────────────────────┤
│  schema: mod_time                                           │
│  └── time_state                                             │
└─────────────────────────────────────────────────────────────┘
```

**How it works:**
- Each module owns a Postgres **schema** (namespace)
- Modules can have 1 table or 20 tables - they control their own complexity
- `core` schema holds shared concerns: sessions, the unified event log, prompts, artifacts

**Pros:**
- Clean separation - modules are truly independent
- Easy to add/remove modules without migrations touching other schemas
- NPCs can have 5 tables, Time can have 1 - complexity scales per module
- Matches your "AgentPacks" vision (swap schemas in/out)

**Cons:**
- Cross-module queries become JOIN-heavy or require views
- The "consolidated log" problem: who writes to it? Every module? Only core?
- More schemas = more mental overhead for a solo dev

---

## Option 2: Shared Tables with Module Columns (Soft Partitioning)

```
┌─────────────────────────────────────────────────────────────┐
│                     Single Schema: public                   │
├─────────────────────────────────────────────────────────────┤
│  sessions                                                   │
│  ├── id, user_id, world_id, created_at                     │
│                                                             │
│  entities  (polymorphic)                                    │
│  ├── id, session_id, type, data (JSONB), created_at        │
│  │   type = 'npc' | 'location' | 'item' | 'event'          │
│                                                             │
│  module_state                                               │
│  ├── id, session_id, module_name, state (JSONB)            │
│                                                             │
│  event_log                                                  │
│  ├── id, session_id, turn_id, module_name, event_type,     │
│  │   payload (JSONB), parent_event_id, created_at          │
│                                                             │
│  prompts                                                    │
│  ├── id, module_name, version, content, settings (JSONB)   │
│                                                             │
│  artifacts                                                  │
│  ├── id, session_id, turn_id, prompt_id, input, output,    │
│  │   model, tokens_in, tokens_out, latency_ms              │
└─────────────────────────────────────────────────────────────┘
```

**How it works:**
- Everything lives in fewer tables with a `module_name` or `type` discriminator
- Heavy use of JSONB for flexible module-specific data
- Queries filter by module: `WHERE module_name = 'npc'`

**Pros:**
- Simple schema - fewer tables to manage
- The consolidated log is natural (one table, filter by module)
- Easier cross-module queries
- JSONB gives flexibility without migrations

**Cons:**
- JSONB is a "schema escape hatch" - you lose type safety and indexing by default
- Complex modules (NPCs) get cramped - relationships between NPCs become awkward
- Harder to enforce module-specific constraints
- "God table" anti-pattern risk

---

## Option 3: Hybrid (Core Tables + Module Extensions)

```
┌─────────────────────────────────────────────────────────────┐
│                        PostgreSQL                           │
├─────────────────────────────────────────────────────────────┤
│  schema: core                                               │
│  ├── sessions                                               │
│  ├── turns (the game loop ticks)                           │
│  ├── loop_stack (current nested goals)                     │
│  ├── event_log ←───────────────────────┐                   │
│  ├── prompts                           │ All modules       │
│  └── artifacts                         │ write here        │
├────────────────────────────────────────┼────────────────────┤
│  schema: mod_npc  (complex module)     │                   │
│  ├── npcs ─────────────────────────────┘                   │
│  ├── npc_relationships                 (also logs events)  │
│  └── npc_dialogue_history                                  │
├─────────────────────────────────────────────────────────────┤
│  schema: mod_meta_events  (complex module)                 │
│  ├── event_templates                                       │
│  └── pending_events                                        │
├─────────────────────────────────────────────────────────────┤
│  Simple modules: just use core.module_state (JSONB)        │
│  └── e.g., Time, Difficulty - no dedicated schema          │
└─────────────────────────────────────────────────────────────┘
```

**How it works:**
- **Core** owns the event log, prompts, artifacts, and basic session/turn tracking
- **Complex modules** (NPC, Meta Events) get their own schemas with proper relational tables
- **Simple modules** (Time, Difficulty) just store state in a `core.module_state` JSONB row
- **All modules** write to `core.event_log` - this is your consolidated log

**Pros:**
- Right-sized complexity: NPCs get tables, Time gets a JSON blob
- Event log is always consolidated in one place
- Easier to start simple, promote modules to schemas when needed
- Inngest can query `core.event_log` without knowing about modules

**Cons:**
- Two patterns to maintain (JSONB vs. relational)
- Decision fatigue: "Is this module complex enough for its own schema?"
- Slightly more migration complexity than Option 2

---

## Comparison Table

| Concern | Option 1 (Full Isolation) | Option 2 (Shared Tables) | Option 3 (Hybrid) |
|---------|---------------------------|--------------------------|-------------------|
| **Consolidated Log** | Needs explicit writes from each schema | Natural (one table) | Natural (core.event_log) |
| **NPC Complexity** | ✅ Full schema freedom | ❌ Cramped in JSONB | ✅ Dedicated schema |
| **Simple Modules** | Overkill (schema for 1 table?) | ✅ Easy | ✅ JSONB row |
| **Cross-Module Queries** | Hard (cross-schema JOINs) | ✅ Easy | Medium |
| **AgentPacks Vision** | ✅ Swap schemas | ❌ Filter by column | ✅ Swap schemas |
| **Solo Dev Overhead** | High | Low | Medium |
| **Future Flexibility** | ✅ High | Medium | ✅ High |

---

## Questions to Help You Decide

Before I'd recommend one, I'd want to understand:

1. **How central is the consolidated log to your gameplay?** Is it just for debugging, or will players browse it? Does Inngest need to query it directly?

2. **How many modules do you realistically see building in the next 6 months?** If it's just Narrator + maybe NPCs, Option 2 might be fine for now.

3. **Do you want modules to be "pluggable" at the database level, or just at the code level?** Option 1/3 support swapping schemas; Option 2 would require data migration.

4. **How do you envision the prompt slider → database flow?** Should prompt changes create a new version row (append-only), or update in place? This affects the `prompts` table design.

5. **For Inngest integration**: Are you planning to store workflow state in Postgres, or let Inngest handle that entirely? This affects whether you need a `workflow_runs` table.

What's your gut reaction to these three? And which of those questions feels most important to nail down first?


---

### User

the biggest thing I need to iron out is how the save states are gonna work. or any reset/editability. Similar to how when you edit a message in chatgpt, all the subsequent messages disappear, I want players to be able to edit their or the AIs responses, and have everything regenerate from that point on. However, there's a question about how to intelligently do that. I was hoping the tables would all be append only, to reduce the possibiltiy of an llm accidentally being persuaded to muck them up. However, that means I need a way to "invalidate" certain rows and columns, if an earlier action was modified. I was planning on using the event log for save states? if that's not too dangerous? having it give unique identifiers to each and every action that ever happens means that we could use it to roll them back, maybe? However, I was also planning, in the future, to have the log itself be editable, so that player could change even the internal decisions in the engine, especially if an LLM messed up one step and they can see the error and want to fix it. In that case, the log needs to be able to resume mid loop. Do you think there's a smart way to approach that?


---

### Assistant (claude-4.5-opus)

<details>
<summary>Reasoning</summary>

Curtis is asking about a really interesting problem: how to handle save states, editability, and rollback in an append-only event-sourced system. This is a classic event sourcing challenge.

Let me think through the key tensions:

1. **Append-only for safety** - He doesn't want LLMs to delete/corrupt data
2. **Editability for UX** - Players need to edit actions and have downstream effects regenerate
3. **The log itself needs to be editable** - Players might want to fix internal engine decisions
4. **Mid-loop resumption** - If you edit something in the middle, you need to resume from there

This is actually a well-solved problem in event sourcing and version control systems. The key insight is:

**You don't delete rows. You create branches.**

Let me think of a few approaches:

### Approach 1: Git-style branching
Every edit creates a new branch. Old events aren't deleted, just "not on the current branch." You have a `branch_id` column, and a `parent_event_id` that points to where you forked from.

### Approach 2: Soft invalidation with generations
Each edit increments a "generation" number. Events have a `valid_until_generation` column. When you query, you filter by current generation.

### Approach 3: Snapshot + replay
Store periodic snapshots of full state. When you edit, load the last snapshot before the edit, replay events up to the edit point, apply the edit, then regenerate from there.

Let me think about what Curtis specifically needs:

1. He wants players to edit their actions OR AI responses
2. When edited, downstream stuff should regenerate
3. The event log should track all this
4. He wants to edit internal engine decisions too (not just player/AI text)
5. Mid-loop resumption is needed

The Git-style branching seems most appropriate here because:
- It's append-only (new branch, don't delete old)


- It naturally handles "everything after this point needs to regenerate"
- It can work at any granularity (turn level, step level)
- It preserves history for debugging

I'll outline a comprehensive approach to event sourcing that addresses Curtis's specific requirements. The branching mechanism allows for flexible editing while maintaining a complete historical record. By creating new branches instead of modifying existing events, we ensure data integrity and provide a clear mechanism for regenerating downstream effects.

The key will be designing a system that supports granular branching, tracks head pointers, and enables seamless mid-loop resumption. This approach provides maximum flexibility for editing while preserving the append-only nature of the event log.
</details>

# Save States, Editability, and Branching in an Append-Only System

This is the heart of your system's complexity, and it's worth getting right. The good news: this is a solved problem in event sourcing and version control. The trick is applying it correctly to your domain.

---

## Core Insight: You Never Delete. You Branch.

Think of it like Git, not like a Word document. When you "edit" something, you're not changing history—you're creating an **alternate timeline** that diverges from a specific point.

```
Original Timeline:
┌─────┐    ┌─────┐    ┌─────┐    ┌─────┐
│ T1  │───▶│ T2  │───▶│ T3  │───▶│ T4  │  ← HEAD (branch: main)
└─────┘    └─────┘    └─────┘    └─────┘

Player edits T2:
┌─────┐    ┌─────┐    ┌─────┐    ┌─────┐
│ T1  │───▶│ T2  │───▶│ T3  │───▶│ T4  │  ← (branch: main, orphaned)
└─────┘    └──┬──┘    └─────┘    └─────┘
              │
              │       ┌─────┐
              └──────▶│T2'  │  ← HEAD (branch: branch_001)
                      └─────┘
                      (T3', T4' will be regenerated)
```

T3 and T4 aren't deleted—they're just not on the active branch anymore. You can always go back.

---

## Three Approaches to Branching

### Approach 1: Branch ID on Every Row

```
event_log
├── id (UUID)
├── session_id
├── branch_id ◄─── Key field
├── parent_event_id (what came before this)
├── turn_number (within this branch)
├── event_type ('player_action', 'narrator_output', 'module_decision', etc.)
├── payload (JSONB)
├── created_at

sessions
├── id
├── active_branch_id ◄─── Points to current HEAD
├── ...
```

**How an edit works:**

1. Player clicks "edit" on Turn 2
2. System creates a new `branch_id` (e.g., `branch_001`)
3. System copies T1 reference (or just notes the fork point)
4. New event T2' is inserted with `branch_id = branch_001`
5. `sessions.active_branch_id` is updated to `branch_001`
6. Inngest workflow triggered to regenerate T3', T4', etc.
7. Old T2, T3, T4 remain in the table, just on `branch: main`

**Querying current state:**
```sql
SELECT * FROM event_log 
WHERE session_id = ? AND branch_id = (
  SELECT active_branch_id FROM sessions WHERE id = ?
)
ORDER BY turn_number;
```

**Pros:**
- Simple mental model
- Easy to switch branches (just change `active_branch_id`)
- Full history preserved
- Works for any granularity of edit

**Cons:**
- Branches can proliferate (need cleanup strategy or limits)
- Querying "all events leading to current state" requires knowing the branch chain

---

### Approach 2: Event Ancestry Chain (No Explicit Branches)

```
event_log
├── id (UUID)
├── session_id
├── parent_id ◄─── Points to the previous event (like a linked list / tree)
├── event_type
├── payload (JSONB)
├── created_at

sessions
├── id
├── head_event_id ◄─── Points to the latest event in current timeline
├── ...
```

**How an edit works:**

```
Before edit:
E1 ──▶ E2 ──▶ E3 ──▶ E4
                      ▲
                     HEAD

Player edits E2:
E1 ──▶ E2 ──▶ E3 ──▶ E4  (orphaned, but still in DB)
 │
 └───▶ E2' ◄─── HEAD (for now, E3' and E4' will be added)
```

1. Find E2's parent (E1)
2. Insert E2' with `parent_id = E1.id`
3. Update `sessions.head_event_id = E2'.id`
4. Trigger regeneration, which appends E3', E4' each pointing to their parent

**Querying current state:**
```sql
-- Recursive CTE to walk the chain backward from HEAD
WITH RECURSIVE timeline AS (
  SELECT * FROM event_log WHERE id = (SELECT head_event_id FROM sessions WHERE id = ?)
  UNION ALL
  SELECT e.* FROM event_log e
  JOIN timeline t ON e.id = t.parent_id
)
SELECT * FROM timeline ORDER BY created_at;
```

**Pros:**
- No explicit branch management
- Tree structure emerges naturally
- Very flexible—can branch at any point, any granularity
- True append-only (no branch metadata to update, except HEAD)

**Cons:**
- Recursive queries can be slower on deep histories
- Harder to "list all branches" without scanning
- HEAD pointer is a single point of mutation (though minimal)

---

### Approach 3: Generation Numbers (Soft Invalidation)

```
event_log
├── id (UUID)
├── session_id
├── generation ◄─── Increments on each edit
├── supersedes_id ◄─── "This event replaces that one"
├── turn_number
├── step_number (for mid-turn edits)
├── event_type
├── payload (JSONB)
├── created_at

sessions
├── id
├── current_generation ◄─── Which generation is active
├── ...
```

**How an edit works:**

1. Player edits T2
2. Increment `sessions.current_generation` (e.g., 1 → 2)
3. Insert T2' with `generation = 2`, `supersedes_id = T2.id`
4. Regenerate T3', T4' with `generation = 2`
5. Old T2, T3, T4 remain with `generation = 1`

**Querying current state:**
```sql
SELECT * FROM event_log 
WHERE session_id = ? AND generation = (
  SELECT current_generation FROM sessions WHERE id = ?
)
ORDER BY turn_number, step_number;
```

**Viewing a save point:**
```sql
-- Just query a different generation
SELECT * FROM event_log 
WHERE session_id = ? AND generation = 1
ORDER BY turn_number, step_number;
```

**Pros:**
- Very simple queries (no recursion)
- "Save points" are just generation numbers
- Easy to compare generations
- `supersedes_id` creates explicit edit trail

**Cons:**
- Less flexible for parallel branches (generations are linear)
- If player wants to "branch from an old save," you need to copy events
- Doesn't naturally support "tree" exploration

---

## Comparison for Your Use Cases

| Use Case | Approach 1 (Branch ID) | Approach 2 (Ancestry) | Approach 3 (Generations) |
|----------|------------------------|----------------------|--------------------------|
| Edit player action, regenerate | ✅ New branch | ✅ New chain | ✅ New generation |
| Edit AI output, regenerate | ✅ | ✅ | ✅ |
| Edit internal module decision | ✅ | ✅ Best fit (granular) | ⚠️ Awkward (mid-turn) |
| Resume mid-loop | ✅ Fork from step | ✅ Fork from any event | ⚠️ Need step_number |
| "Save slots" for player | ✅ Named branches | ⚠️ Save HEAD pointers | ✅ Named generations |
| View full edit history | ✅ List branches | ⚠️ Walk tree | ✅ List generations |
| Timeline UI (tree view) | ✅ | ✅ Best fit | ⚠️ Linear only |
| Query performance | ✅ Simple | ⚠️ Recursive CTEs | ✅ Simple |
| LLM can't corrupt | ✅ Append-only | ✅ Append-only | ✅ Append-only |

---

## The Mid-Loop Edit Problem

You mentioned wanting to edit internal decisions, not just turn-level outputs. Let's zoom in:

```
Turn 2 (internally):
┌────────────────────────────────────────────────────────────┐
│  Step 1: Input Validation    → Valid                       │
│  Step 2: Time Module         → "2 hours pass"              │
│  Step 3: NPC Module          → "Guard is suspicious"  ◄── ERROR HERE
│  Step 4: Narrator            → [Generated based on bad input]
└────────────────────────────────────────────────────────────┘
```

Player sees the Narrator output is weird, inspects the log, finds Step 3 was wrong.

**With Approach 2 (Ancestry), this is natural:**

```
event_log:
├── E1: Turn 1 complete
├── E2: Turn 2, Step 1 (Validation) - parent: E1
├── E3: Turn 2, Step 2 (Time) - parent: E2
├── E4: Turn 2, Step 3 (NPC) - parent: E3  ◄── Player edits this
├── E5: Turn 2, Step 4 (Narrator) - parent: E4

After edit:
├── E4': Turn 2, Step 3 (NPC) - parent: E3, new content
├── E5': Turn 2, Step 4 (Narrator) - parent: E4', regenerated

HEAD moves from E5 → E5'
```

Inngest can be told: "Regenerate from E4' onward" and it picks up mid-loop.

---

## My Recommendation for You

Given your requirements:
- Append-only for LLM safety ✅
- Edit at any granularity (turn or step) ✅
- Timeline should be browsable/visual ✅
- Mid-loop resumption ✅
- Future "save slots" ✅

**I'd lean toward Approach 2 (Ancestry Chain) as the foundation, with a lightweight branch/tag layer on top.**

```
event_log
├── id (UUID, primary)
├── session_id
├── parent_id (UUID, nullable for root) ◄── The core relationship
├── event_type
├── payload (JSONB)
├── created_at

bookmarks (for save slots / named branches)
├── id
├── session_id
├── name ("autosave", "before_boss", "experiment_1")
├── event_id ◄── Points to a specific event in the tree
├── created_at
```

This gives you:
- Git-like flexibility (branch anywhere, any granularity)
- Named save points via bookmarks
- True append-only
- Inngest can resume from any `event_id`

---

## Questions That Would Sharpen This

1. **How do you want to handle "auto-save"?** Bookmark every turn? Every N turns? Only on player request?

2. **Should old branches ever be prunable?** Or is infinite history okay? (Storage implications)

3. **When editing mid-loop, should the player see all internal steps, or just key decision points?** This affects what granularity you log at.

4. **For Inngest resumption**: Does Inngest need to query the event log directly, or will your app code fetch context and pass it to Inngest?

What's your instinct on the Ancestry approach? And which of those questions feels most pressing?


---

### User

is there a way we can do both 1 and 2? I don't want players to be able to save a game mid loop, cause that's weird, but I want to preserve editing within the loop. So perhaps having git style branch numbers and then ancestral chains within the loops? to go back to our other question, about schemas and tables, yes, let's do the hybrid option. it'll be a little harder to extend cause when I make new modules I'll need to figure out whether they're complicated enough to deserve their own schema or not, but I agree that I don't want to have tons and tons of cross schema queries. some modules should just modify the core schema. Mostly the constraints, I imagine, while interaction and meta modules are more complex. should I have a separate schema for the log, outside of the narrator schema? or a separate one for the narrator in general? I wan tthe player to be able to export the entire story without the log, for instance. I guess that could just be it's own table or row though, it doesn't need to be a separate schema. The event log is going to be the main source of truth, so that's the thing I guess we need to worry about the most. STILL NO CODE FOR NOW, but after we talk some more I think we're getting closer to being ready to code


---

### Assistant (claude-4.5-opus)

<details>
<summary>Reasoning</summary>

Curtis is asking about combining approaches 1 and 2 - branch IDs for turn-level saves, but ancestry chains within loops for granular editing. This is a smart hybrid approach.

He's also confirming the hybrid schema approach (Option 3 from earlier), and asking about:
1. Whether the log should be in its own schema
2. Whether narrator should have its own schema
3. How to handle story export

Let me think through the hybrid branching approach:

**The Two-Level Model:**
- **Branch level**: Turn-level snapshots. Like git branches/tags. Player-facing "save points"
- **Event level**: Within a branch, granular ancestry chain for internal steps

This makes sense because:
- Players save at turn boundaries (not mid-combat)
- But developers/power users can edit mid-loop steps
- The branch gives you clean "restore points"
- The ancestry gives you granular edit history within

Let me diagram this out clearly.

For schemas:
- He's right that the event log is the source of truth
- I'd argue the log should be in `core` since it's THE central thing
- Narrator doesn't necessarily need its own schema - it's fairly simple (just needs prompts and maybe some state)
- The "story" (exportable narrative) could be a view or a separate table that's derived from events

Key insight: The log IS the narrator's state in a way. The narrator doesn't need separate "narrator_state" - it reconstructs from events.

Let me also think about the structure more carefully:

```
core schema:
- sessions
- branches (turn-level save points)
- events (the granular log with ancestry)
- prompts
- artifacts
- turns (maybe? or is this redundant with events?)

mod_npc schema:
- npcs
- relationships
- etc.

mod_meta_events schema:
- event_templates
- pending_events
```

Actually, I think turns might be a useful abstraction - they're the "commit" level, while events are the individual "file changes" within a commit. 

I'm sensing potential complexity might arise from over-structuring the system. A simpler approach could streamline the design and make implementation more straightforward.
</details>

# Hybrid Branching + Schema Decisions

Yes, you absolutely can combine them. What you're describing is essentially **two levels of versioning**:

1. **Branch level** (Turn boundaries) → Player-facing saves
2. **Event level** (Within a turn) → Developer/power-user editing

This is actually very clean conceptually.

---

## The Two-Level Branching Model

```
SESSION
│
├── Branch: main
│   │
│   ├── Turn 1 ─────────────────────────────────┐
│   │   ├── E1: Validation                      │
│   │   ├── E2: Time Module      ← ancestry     │  Sealed. 
│   │   ├── E3: NPC Module          chain       │  Can't edit
│   │   └── E4: Narrator         ───────────────┘  (unless you branch)
│   │
│   ├── Turn 2 ─────────────────────────────────┐
│   │   ├── E5: Validation                      │
│   │   ├── E6: Time Module                     │  IN PROGRESS
│   │   ├── E7: NPC Module ◄── player edits     │  Editable via
│   │   │       │              this             │  ancestry until
│   │   │       └──▶ E7' (replacement)          │  turn completes
│   │   └── E8: Narrator (regenerates)  ────────┘
│   │
│   └── Turn 3 ... (not yet started)
│
├── Branch: experiment_1 (forked from Turn 1)
│   │
│   ├── Turn 1 (inherited from main, not copied)
│   │
│   └── Turn 2' ────────────────────────────────┐
│       ├── E5': Validation                     │  Different
│       └── ...                                 │  timeline
│                                               ┘
```

**Key Rules:**
- **Turns seal on completion.** Once Turn 2 is done, the ancestry chain within it is frozen.
- **Editing a sealed turn = create a branch.** Forking from Turn 1 creates `experiment_1`.
- **Editing within an active turn = ancestry chain.** Mid-loop edits just extend/replace the chain.
- **Saves only happen at turn boundaries.** You can't bookmark mid-loop.

---

## Data Model for Two-Level Branching

```
┌─────────────────────────────────────────────────────────────────────┐
│  branches                                                           │
│  ├── id (UUID)                                                      │
│  ├── session_id                                                     │
│  ├── name ("main", "experiment_1", "before_boss")                   │
│  ├── forked_from_branch_id (nullable, for root)                     │
│  ├── forked_at_turn_number (where the fork happened)                │
│  ├── created_at                                                     │
│                                                                     │
│  turns                                                              │
│  ├── id (UUID)                                                      │
│  ├── branch_id  ◄── which branch this turn belongs to               │
│  ├── turn_number (1, 2, 3... within branch)                         │
│  ├── status ('in_progress' | 'complete')  ◄── sealing flag          │
│  ├── player_input (the action that started this turn)               │
│  ├── narrator_output (final output, denormalized for easy export)   │
│  ├── created_at                                                     │
│  ├── completed_at                                                   │
│                                                                     │
│  events (the granular log)                                          │
│  ├── id (UUID)                                                      │
│  ├── turn_id  ◄── which turn this belongs to                        │
│  ├── parent_event_id (ancestry within the turn)                     │
│  ├── step_type ('validation', 'constraint', 'meta', 'interaction',  │
│  │              'narrator', 'stack_update', etc.)                   │
│  ├── module_name ('time', 'npc', 'narrator', etc.)                  │
│  ├── payload (JSONB - the actual data/decision)                     │
│  ├── is_head (boolean) ◄── is this the "active" version of step?    │
│  ├── created_at                                                     │
│                                                                     │
│  sessions                                                           │
│  ├── id                                                             │
│  ├── active_branch_id  ◄── current branch                           │
│  ├── active_turn_id    ◄── current turn (if in progress)            │
│  └── ...                                                            │
└─────────────────────────────────────────────────────────────────────┘
```

---

## How Operations Work

### Starting a New Turn
```
1. Create turn record: branch_id=active_branch, status='in_progress'
2. Insert first event (validation) with parent_event_id=NULL
3. Each subsequent step points to previous: parent_event_id=last_event
4. When narrator completes: status='complete', narrator_output=final_text
```

### Editing Mid-Turn (Turn Still in Progress)
```
1. Find the event to edit (E7)
2. Insert E7' with same turn_id, parent_event_id=E7's parent (E6)
3. Mark E7.is_head=false, E7'.is_head=true
4. Trigger Inngest to regenerate from E7' onward
5. E7 and any children stay in DB but are not on the "head" path
```

### Editing a Sealed Turn (Must Branch)
```
1. Player wants to edit Turn 2 on main (but Turn 3 exists)
2. Create new branch: forked_from=main, forked_at_turn=1
3. Copy Turn 2 structure to new branch (or just re-run from player_input)
4. Player makes edit, regeneration happens on new branch
5. Old branch remains intact
```

### Loading a Save
```
1. Player selects branch "before_boss"
2. Set session.active_branch_id = that branch
3. Find latest complete turn on that branch
4. Load narrator_output for display, events for context
```

### Exporting the Story
```sql
SELECT turn_number, player_input, narrator_output 
FROM turns 
WHERE branch_id = ? AND status = 'complete'
ORDER BY turn_number;
```

Clean. No log details, just the narrative.

---

## Schema Layout (Hybrid Approach)

Based on your confirmation of the hybrid model:

```
┌─────────────────────────────────────────────────────────────────────┐
│  SCHEMA: core                                                       │
│  ─────────────────────────────────────────────────────────────────  │
│  This is the source of truth. Everything flows through here.        │
│                                                                     │
│  sessions          ← user sessions                                  │
│  branches          ← save points / timelines                        │
│  turns             ← sealed turn records + exportable narrative     │
│  events            ← the granular log (THE source of truth)         │
│  prompts           ← versioned prompt templates                     │
│  artifacts         ← AI call records (input/output/cost)            │
│  loop_stack        ← current nested goals (Stage 3)                 │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  SCHEMA: mod_npc (complex - needs relationships)                    │
│  ─────────────────────────────────────────────────────────────────  │
│  npcs              ← NPC definitions                                │
│  npc_memories      ← what NPCs remember about player                │
│  npc_relationships ← NPC-to-NPC and NPC-to-player                   │
│  npc_state         ← current location, mood, etc.                   │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  SCHEMA: mod_meta_events (complex - needs queue/templates)          │
│  ─────────────────────────────────────────────────────────────────  │
│  event_templates   ← reusable world event patterns                  │
│  pending_events    ← events waiting to fire                         │
│  event_triggers    ← conditions that activate events                │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  Simple modules: JUST COLUMNS IN core.events                        │
│  ─────────────────────────────────────────────────────────────────  │
│  Time Module       → payload: { "hours_passed": 2 }                 │
│  Difficulty Module → payload: { "modifier": -2 }                    │
│  Validation Module → payload: { "valid": true, "reason": null }     │
│                                                                     │
│  No separate schemas. They just log to core.events.                 │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Answering Your Specific Questions

**Should the log be in its own schema?**

No. Keep it in `core`. The event log IS the core. It's not narrator-specific—every module writes to it. Separating it would just add complexity.

**Should narrator have its own schema?**

I'd say no, at least for Stage 1. The narrator is actually pretty simple in terms of storage:
- Its **prompts** go in `core.prompts`
- Its **outputs** go in `core.events` (step_type='narrator')
- Its **final text** gets denormalized to `core.turns.narrator_output`

The narrator doesn't have "narrator state" separate from the event log. The event log IS the state.

**Story export without log?**

Exactly right—`turns.narrator_output` gives you that. It's denormalized specifically for this use case. One query, clean export.

---

## The Flow Visualized

```
┌──────────────────────────────────────────────────────────────────┐
│                         PLAYER VIEW                              │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  Turn 1: "I enter the tavern"                               │ │
│  │  ──────────────────────────────                             │ │
│  │  The wooden door creaks as you push it open...              │ │
│  │                                            [Edit] [Branch]  │ │
│  └─────────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  Turn 2: "I talk to the bartender"         ◄── CURRENT      │ │
│  │  ──────────────────────────────────                         │ │
│  │  [Processing... Time: ✓  NPC: ✓  Narrator: ◐]              │ │
│  │                                            [Cancel]         │ │
│  └─────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                     WORLD EDITOR VIEW                            │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  Turn 2 - Event Log                                         │ │
│  │  ──────────────────────────────────────────────────────     │ │
│  │  ▶ E5: validation    { valid: true }              [Edit]    │ │
│  │  ▶ E6: time          { hours: 0.1 }               [Edit]    │ │
│  │  ▶ E7: npc/bartender { mood: "suspicious" } ◄──── [Edit]    │ │
│  │    └─ E7' (edited)   { mood: "friendly" }    ✓ HEAD         │ │
│  │  ◐ E8: narrator      [Regenerating...]                      │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  Branches: [main ▼]  [+ New Branch]  [Export Story]              │
└──────────────────────────────────────────────────────────────────┘
```

---

## Remaining Questions Before Code

1. **Turn sealing trigger**: Does the turn seal when the narrator completes, or when the player submits their next action? (Affects when mid-turn edits are allowed)

2. **Branch limits**: Any cap on branches per session? Or infinite with lazy cleanup?

3. **Event head tracking**: I used `is_head` boolean above, but alternatively we could store `head_event_id` on the turn. Preference?

4. **Inngest state**: Should Inngest read from `core.events` directly to know where to resume, or does your app reconstruct context and pass it in?

5. **Prompt sliders**: You mentioned world editor sliders that modify prompts. Should slider positions be stored:
   - In the `prompts` table itself (as settings JSONB)?
   - In a separate `prompt_settings` table per session?
   - Or are prompts global (not per-session)?

Once we nail these down, I think we're ready to sketch out the actual schema DDL and Inngest function signatures.


---
