# SAIRPG System Specification v3

## 1. Vision
A modular, event-driven RPG engine where the story emerges from the interaction of independent AI modules. The system supports deep, recursive gameplay through a "loop nesting" mechanic, managed by a robust workflow engine.

## 2. Core Architecture: Hub-and-Spoke via Orchestration

### 2.1 Why Inngest?
We require a system that can:
- Orchestrate complex sequences (Constraints → Meta → Interaction → Narrator).
- Manage long-running state (Waiting for player input, pausing for approval).
- Handle concurrency (Only one turn per session at a time).
- Retry failed steps without losing state.

Inngest acts as the **Workflow Engine**, replacing the need for a raw Event Bus (Redis Streams) in the early stages. It manages the "Game Loop" state machine.

### 2.2 The Hub-and-Spoke Model
Unlike a linear chain of agents, the system revolves around the **Narrator Module**.
- **Spokes**: Specialized modules (Time, NPC, Difficulty) processing specific aspects of the turn.
- **Hub**: The Narrator aggregates all "Spoke" outputs into a cohesive narrative context and final output.

## 3. The Data Model: Loops & Stacks

### 3.1 The Loop
A "Loop" represents a unit of player intent or a narrative goal.
- **Flat Loop**: "I attack the goblin." -> Outcome -> Done.
- **Nested Loop**: "I fight the goblins" (Parent) -> "I grapple the leader" (Child).

### 3.2 The Stack
The game state acts as a LIFO (Last In, First Out) stack.
1. **Push**: A Meta Nesting Module determines an action is complex enough to warrant a new context. A new Loop is pushed onto the stack.
2. **Pop**: The Narrator or Controller determines a goal is resolved (success/fail/invalid). The Loop is popped, returning control to the parent Loop.

### 3.3 Narrator Context
The "Text Blob" passed to modules is actually a structured **Narrator Context**:
- **World Summary**: Long-term state.
- **Active Stack**: Current goal hierarchy.
- **Recent History**: Last N events.
- **Module Signals**: Pending constraints or meta-events for the current turn.

## 4. Module Definitions

### 4.1 Valid Input Module (Gatekeeper)
- **Role**: Pre-check.
- **Function**: Ensures player input is coherent and feasible before starting a turn.
- **Output**: `Valid` or `RequestClarification`.

### 4.2 Narrator Module (The Core)
- **Role**: Storyteller and Resolver.
- **Inputs**: Player Action + Context + All Module Outputs.
- **Outputs**:
  - `Narrative Text`: The story.
  - `Signals`: Structured flags for the system (`nest_status`, `goal_invalidated`, `suggested_actions`).

### 4.3 Meta Nesting Module (Stage 3)
- **Role**: Stack Controller.
- **Function**: Analyzes player intent against the current stack.
- **Decisions**: Should we push a new nest? Should we force a pop? Is the current goal changed?

## 5. Persistence & Editability

### 5.1 Event Sourcing
Every "Turn" and "Step" is logged to the PostgreSQL **Event Store**. The game state is a projection of these events.

### 5.2 Branching
- **Edit**: Changing an AI output or player action creates a **Branch**.
- **Replay**: The workflow re-executes from that point on the new branch.
- **Scope**: Editing a nested loop branches from that specific point downwards. Parent loops remain on the original branch until the new branch "pops" back up (if ever).

### 5.3 Database-Stored Prompts
- All Module prompts are stored in Postgres.
- Versioned and editable.
- **Artifacts**: Every AI execution stores the *exact* prompt version and settings used, ensuring debuggability.

## 6. Implementation Phases

### Phase 1: The Narrative Loop (MVP)
- **Goal**: A solid, single-layer loop.
- **Features**:
  - Inngest workflow for turn processing.
  - Action Validator.
  - Narrator Module (decides outcomes via logic, no dice yet).
  - Basic Artifact storage.
- **Exclusions**: No nesting, no dice, no saves.

### Phase 2: Editability & Inspection
- **Goal**: Player control over the timeline.
- **Features**:
  - Save/Load.
  - Timeline UI.
  - Branching logic.
  - Event Inspector.

### Phase 3: The Stack (Nesting)
- **Goal**: Deep gameplay.
- **Features**:
  - Meta Nesting Module.
  - Stack management logic.
  - "No more actions" / Pass logic.
  - UI for nested contexts.

### Phase 4: Meta Events
- **Goal**: The world acts back.
- **Features**:
  - Meta Event Module (Proposals).
  - Player Approval UI.

## 7. Tech Stack Details

- **Database Schema**:
  - `core` schema for Sessions, Artifacts, Prompts.
  - `world_{id}` schemas (future) for custom module data.
- **Inngest Functions**:
  - `processTurn`: The main orchestrator.
  - `generateArtifact`: Helper step for calling AI modules.