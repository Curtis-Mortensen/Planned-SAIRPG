# Data storage schema review
_Exported on 1/7/2026 at 07:16:44 MST from Cursor (2.2.44)_

---

**User**

can you review @Data-Storage.md and figure out if we have the correct schemas to support the future modules

---

**Cursor**


Reviewing the document and searching the codebase for planned modules and their requirements.



Checking the current database schema to see what's already implemented:



## Schema Review: Gaps and Recommendations

### What's currently implemented
- `core`: sessions, event_log, prompts, artifacts, branches
- `mod_narrator`: state
- `mod_meta_events`: templates, pending
- `mod_time`: state
- `mod_loop_stack`: loops, stack_state

### Critical gaps

#### 1. Missing `turns` table in `core`
The two-level branching model requires a `turns` table, but it's missing from the current schema.

**Required fields:**
- `id`, `branch_id`, `turn_number`
- `status` ('in_progress' | 'complete') — for sealing
- `player_input` — the action that started the turn
- `narrator_output` — denormalized final output for export
- `created_at`, `completed_at`

**Impact:** Without this, you can't:
- Seal turns (prevent mid-turn edits after completion)
- Export story cleanly (no denormalized narrative)
- Track turn boundaries for branching

#### 2. NPC schema missing
The document says NPCs need their own schema, but `init-schemas.sql` notes "NPCs schema intentionally excluded (custom JSON structure planned)".

**Required schema: `mod_npc`**
- `npcs` — definitions
- `npc_memories` — what NPCs remember
- `npc_relationships` — NPC-to-NPC and NPC-to-player
- `npc_state` — current location, mood, etc.

**Decision needed:** Own schema vs. JSONB in `core.events`.

#### 3. Inventory module — no schema planned
This constraint module likely needs its own schema.

**Recommended schema: `mod_inventory`**
- `items` — item definitions (weight, value, durability, properties)
- `item_instances` — specific item instances
- `inventories` — who/what owns items (player, NPCs, locations)
- `item_locations` — where items are in the world

**Why:** Items have relationships, properties, and state that don't fit well in JSONB.

#### 4. Economics module — no schema planned
Mentioned in `new-ui.md` but no schema.

**Consider `mod_economics` if you need:**
- Currency systems
- Trade relationships
- Market prices (dynamic)
- Economic events

**Alternative:** If simple, use `core.events` with JSONB.

#### 5. Background module — no schema planned
Interaction module mentioned in README.

**Consider `mod_background` if you need:**
- Location definitions
- World state per location
- Background context/history
- Location relationships

**Alternative:** If simple, use `core.events`.

### Schema design inconsistencies

#### 6. Loop stack location mismatch
- Document suggests: `core.loop_stack`
- Current implementation: `mod_loop_stack` schema

**Recommendation:** Keep `mod_loop_stack` as its own schema. It's complex enough (loops table + stack_state) and aligns with the hybrid approach.

#### 7. Missing `is_head` flag in events
The document mentions `is_head` for tracking active versions within a turn, but `event_log` doesn't have it.

**Current approach:** Uses `valid_from_branch` / `invalidated_at_branch` (soft invalidation)

**Question:** Is the soft invalidation approach sufficient, or do you need explicit `is_head` tracking?

### Recommendations by module complexity

**Simple modules (use `core.events` only):**
- ✅ Valid Input Module
- ✅ Difficulty Module
- ✅ Time Module (but you have `mod_time.state` — consider if this is needed)

**Complex modules (need own schemas):**
- ✅ NPC Module → `mod_npc` schema
- ✅ Meta Events → Already have `mod_meta_events`
- ⚠️ Inventory Module → Recommend `mod_inventory`
- ⚠️ Economics Module → Evaluate complexity; likely needs schema
- ⚠️ Background Module → Evaluate complexity; might need schema

**Core infrastructure:**
- ⚠️ Missing `turns` table → Add to `core`
- ✅ Loop Stack → Keep as `mod_loop_stack` (current is fine)

### Questions to resolve

1. Turns table: Will you add `core.turns` for the two-level branching model?
2. NPC storage: Own schema or JSONB? The document suggests schema.
3. Inventory: How complex? Own schema or `core.events`?
4. Economics: How complex? Own schema or `core.events`?
5. Background: How complex? Own schema or `core.events`?
6. Event head tracking: Is soft invalidation sufficient, or do you need `is_head`?

### Recommended action items

**High priority:**
1. Add `core.turns` table (required for two-level branching)
2. Decide on NPC storage approach and implement
3. Add `is_head` or confirm soft invalidation is sufficient

**Medium priority:**
4. Design `mod_inventory` schema if inventory is complex
5. Evaluate Economics and Background modules for schema needs

**Low priority:**
6. Consider consolidating `mod_time.state` into `core.events` if it's simple

Should I draft the missing `turns` table schema or help design the Inventory/NPC schemas?

