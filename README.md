# SAIRPG: AI-Powered RPG Simulation Engine

An event-driven, AI-powered single-player RPG engine where the world simulates autonomously around the player. Every action is editable, rewindable, and transparent.

## Overview

SAIRPG (Simulated AI RPG) is a next-generation RPG engine that uses AI agents to create dynamic, responsive game worlds. Unlike traditional RPGs with scripted events, SAIRPG uses an event-driven architecture where independent AI agents process player actions and generate world events, NPC decisions, and narrative outcomes.

### Key Features

- **Event-Driven Architecture**: Dynamic agent flows that adapt to different situations
- **Full Editability**: Edit any AI output and replay from that point, creating timeline branches
- **Event Sourcing**: Complete history reconstruction through event replay
- **Transparency**: Inspect every agent decision, prompt, and output
- **Scalable**: Built for single-player now, designed to scale to multiplayer

## Architecture

### Core Principles

1. **Event Sourcing**: The entire game state can be reconstructed by replaying events
2. **Agent-Driven**: Each agent is an independent worker that subscribes to events and emits new ones
3. **Immutable History**: Events are append-only; edits create branches, never mutate history
4. **DB-Stored Prompts**: Prompts live in the database, are versioned, and can be edited without redeployment
5. **Idempotency**: Every agent operation is safe to retry

### System Components

- **Next.js Application**: UI + API endpoints
- **PostgreSQL**: Event store (canonical history) + configuration + artifacts
- **Redis Streams**: Event bus for delivering work to agent workers
- **AI Agents**: Independent workers that process events and generate outputs

### Event Flow

```
Player Action
    ↓
PLAYER_ACTION_SUBMITTED (event)
    ↓
Action Evaluator Agent → ACTION_EVALUATED
    ↓
Probability Roller Agent → ROLL_RESOLVED
    ↓
Narrator Agent → NARRATION_COMPLETE
    ↓
Display to Player
```

Each agent:
1. Subscribes to specific event types
2. Processes the event (may call LLM)
3. Stores an artifact (input/output/prompt used)
4. Emits new events that trigger downstream agents

## Implementation Stages

The project is being built in stages, with each stage adding new capabilities:

### Stage 0: Foundation
- UI shell + infrastructure setup
- Authentication (via existing chatbot implementation)
- Redis + Postgres connections
- Basic event bus

### Stage 1: Core Game Loop ✅ (Current Focus)
- Player action → evaluate → roll → narrate
- Three agents: Action Evaluator, Probability Roller, Narrator
- DB-stored prompts with versioning
- Artifacts store compiled prompts + outputs
- Idempotency from day one

**Not in Stage 1**: Saves, editing, branching, inspector (moved to Stage 2)

### Stage 2: Persistence & Observability
- Save/load system (load creates branches)
- Artifact editing → branch creation → replay
- Event inspector UI
- Settings UI (narrator tone, verbosity)
- Prompt editing UI

### Stage 3: Meta-Events & Approval
- MetaEvent Generator (proposes world events)
- Player approval gate
- Probability lookup from DB

### Stage 4: Outlines & NPC Decisions
- Outline Generator (structured narrative beats)
- NPC Decision Maker (NPCs react to events)
- NPC decision loops

### Stage 5: Location & Time
- Location discovery and tracking
- World time progression

### Stage 6: Player Character
- Character creation / stats
- Skills affecting dice rolls

## Documentation

- **[System Specification v2](System-Spec-v2.md)**: Complete architecture and design decisions
- **[Stage 1 Stories](Stage-1-Stories.md)**: Detailed implementation plan for Stage 1
- **[Stage 2 Stories](Stage-2-Stories.md)**: Detailed implementation plan for Stage 2
- **[Stages 1-2 Review](Stages-1-2-Review.md)**: Critical review and recommendations
- **[Database Architecture](database/README.md)**: Database schema and event sourcing details
- **[Questions & Decisions](Questions.md)**: Open questions and architectural decisions

## Getting Started

### Prerequisites

- Node.js 18+ 
- Docker and Docker Compose
- PostgreSQL 16+ (or use Docker)
- Redis 7+ (or use Docker)

### Local Development Setup

1. **Start database services**:
   ```bash
   cd database
   docker-compose up -d
   ```

   This starts:
   - PostgreSQL on port 5432
   - Redis on port 6379
   - Adminer (database UI) on port 8080 (dev profile)

2. **Set up the application**:
   ```bash
   npm install
   cp .env.example .env  # Configure database URLs and API keys
   npm run dev
   ```

3. **Initialize database schema**:
   The database init scripts run automatically on first Postgres startup. To regenerate agent schemas:
   ```bash
   cd database
   ./scripts/combine-schemas.sh
   ```

### Database Schema

The database schema is **agent-driven**: each agent defines its own tables in `database/agents/*.sql`. These are combined into `database/init/01-combined-agents.sql` at build time.

Core system tables (defined in `database/init/00-core.sql`):
- `sessions`: Game sessions
- `branches`: Timeline branches for editability
- `ticks`: One cycle of the game loop
- `events`: Immutable event log (source of truth)
- `artifacts`: Agent execution records (inputs/outputs/prompts)

## Technology Stack

- **Frontend**: Next.js (App Router)
- **AI SDK**: Vercel AI SDK (`generateObject` for structured outputs)
- **Database**: PostgreSQL 16
- **Message Queue**: Redis Streams
- **Language**: TypeScript
- **Validation**: Zod (runtime schema validation)

## Key Design Decisions

### Why Event-Driven?

The simulation has highly dynamic control flow:
- Some ticks involve NPC decision chains; others don't
- Player responses may trigger cascading NPC reactions
- Meta-events may or may not occur based on probability
- The number of agents involved varies per tick

An event-driven pattern allows:
- Each agent to operate independently
- Dynamic flows to emerge from event routing
- Easy addition of new agents without modifying existing code
- Natural audit trail (every event is logged)

### Why Event Sourcing?

Event sourcing enables:
- **Rollback**: Return to any previous tick
- **Edit & Replay**: Change an AI response, then replay from that point
- **Branching**: Create alternate timelines from edit points
- **Transparency**: Complete history of every decision

### Why DB-Stored Prompts?

Prompts stored in the database enable:
- Iteration without redeployment
- Versioning and rollback
- Per-agent/per-world customization
- Settings-driven prompt compilation

## Branching & Editability

When a player edits any agent output:

1. System creates a new branch from that tick
2. Stores the edit as a new event on the branch
3. Replays all downstream agents from that point
4. Original timeline is preserved (can switch back)

```
Timeline A (original):
  Tick 1 → Tick 2 → Tick 3 → Tick 4
                      ↑
                 Player edits Tick 3's narrative
                      ↓
Timeline B (branch):
  Tick 1 → Tick 2 → Tick 3' → Tick 4' → ...
```

## Contributing

This project follows a staged implementation approach. See the Stage stories documents for detailed implementation plans.

### Development Workflow

1. Review the relevant Stage story document
2. Implement according to the story's deliverables
3. Write tests as specified
4. Ensure all "Definition of Done" criteria are met

## License

[To be determined]

## Status

🚧 **In Development** - Currently implementing Stage 1 (Core Game Loop)

See [Stage-1-Stories.md](Stage-1-Stories.md) for current progress and next steps.
