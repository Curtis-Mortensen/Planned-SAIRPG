# Database Architecture

## Overview

The database schema is **agent-driven**: each agent defines what tables and columns it needs. On startup, these definitions are combined into a unified schema.

## Core Principle: Event Sourcing for Editability

The entire game state can be reconstructed by replaying events. This enables:
- **Rollback**: Return to any previous tick
- **Edit & Replay**: Change an AI response, then replay from that point
- **Branching**: Create alternate timelines from edit points

## How Editability Works

```
Timeline A (original):
  Tick 1 → Tick 2 → Tick 3 → Tick 4
                      ↑
                 Player edits Tick 3's narrative
                      ↓
Timeline B (branch):
  Tick 1 → Tick 2 → Tick 3' → Tick 4' → ...
```

When a player edits any output:
1. System identifies the tick being edited
2. Creates a new branch from that tick's parent
3. Stores the edit as a new event on the branch
4. Replays all downstream agents from that point
5. Original timeline is preserved (can switch back)

## File Structure

```
database/
├── README.md                    # This file
├── docker-compose.yml           # Runs Postgres + Redis
├── init/
│   ├── 00-core.sql             # System tables (sessions, events, ticks)
│   └── 01-combined-agents.sql  # Generated from agent schemas
├── agents/
│   ├── _template.sql           # Template for new agents
│   ├── action-evaluator.sql    # Phase 1
│   ├── probability-roll.sql    # Phase 1
│   ├── narrator.sql            # Phase 1
│   ├── save-load.sql           # Phase 1
│   ├── meta-event-generator.sql # Phase 2
│   ├── player-approval.sql     # Phase 2
│   ├── outline-generator.sql   # Phase 3
│   └── npc-decision-maker.sql  # Phase 3
└── scripts/
    └── combine-schemas.sh      # Combines agent schemas into init script
```

## Schema Combination Process

At build time (or container startup):
1. Read all agent SQL files from `agents/`
2. Combine them in alphabetical order
3. Write to `init/01-combined-agents.sql`
4. Postgres runs all scripts in `init/` on first startup

## Event Table Design

The `events` table is append-only and immutable. Every action in the system creates an event:

| Column | Purpose |
|--------|---------|
| `event_id` | Unique identifier (UUID) |
| `tick_id` | Which tick this event belongs to |
| `branch_id` | Which timeline branch (for edits) |
| `event_type` | e.g., "PLAYER_ACTION_SUBMITTED", "NARRATION_COMPLETE" |
| `agent_id` | Which agent produced this event |
| `payload` | Full event data (JSONB) |
| `created_at` | Timestamp |
| `sequence` | Order within the tick |

## Branching Model

```sql
-- Branches table tracks edit points
branches:
  branch_id       -- UUID
  session_id      -- Which game session
  parent_branch   -- NULL for main timeline, UUID for edits
  fork_tick_id    -- Which tick was edited to create this branch
  created_at      -- When the branch was created
  is_active       -- Currently active branch for this session
```

When player loads a save or edits, they may be switching branches.

## Agent Schema Template

Each agent defines its needs in a standard format:

```sql
-- ============================================
-- Agent: [Agent Name]
-- Phase: [1/2/3]
-- Description: [What this agent does]
-- ============================================

-- Tables this agent owns
CREATE TABLE IF NOT EXISTS [table_name] (
  ...
);

-- Columns this agent adds to shared tables (if any)
-- ALTER TABLE events ADD COLUMN IF NOT EXISTS ...;

-- Indexes this agent needs
CREATE INDEX IF NOT EXISTS idx_[name] ON [table]([columns]);

-- ============================================
-- End Agent: [Agent Name]
-- ============================================
```

