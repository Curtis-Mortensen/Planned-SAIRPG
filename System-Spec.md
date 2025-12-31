# AI D&D Simulation Engine - System Specification

## Document Purpose

This document describes the architecture, design decisions, and phased implementation plan for an AI-powered D&D simulation engine. It contains no code—only descriptions of what will be built and why.

---

## 1. Vision

A single-player (eventually multiplayer) AI-driven RPG experience where:
- The world simulates autonomously around the player
- NPCs have their own goals, make their own decisions, and react to events
- Every action and outcome is editable, rewindable, and transparent
- The system scales from one player to many concurrent players

---

## 2. Core Architecture Decision: Event-Driven Message System

### Why Events Over Orchestrator

The simulation has highly dynamic control flow:
- Some ticks involve NPC decision chains; others don't
- Player responses may trigger cascading NPC reactions
- Meta-events may or may not occur based on probability
- The number of agents involved varies per tick

An orchestrator pattern would require deeply nested conditionals. An event-driven pattern allows:
- Each agent to operate independently
- Dynamic flows to emerge from event routing
- Easy addition of new agents without modifying existing code
- Natural audit trail (every event is logged)

### Event Flow Model

```
┌─────────────────────────────────────────────────────────────┐
│                     Event Bus (Message Queue)                │
│         Redis Streams (dev) / managed queue (prod)          │
└──────────────────────────┬──────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
   ┌─────────┐       ┌─────────┐       ┌─────────┐
   │ Agent A │       │ Agent B │       │ Agent C │
   │         │       │         │       │         │
   │ Listens │       │ Listens │       │ Listens │
   │ for X   │       │ for Y   │       │ for Z   │
   │         │       │         │       │         │
   │ Emits Y │       │ Emits Z │       │ Emits W │
   └─────────┘       └─────────┘       └─────────┘
        │                  │                  │
        └──────────────────┼──────────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │ Event Store │
                    │  (Postgres) │
                    └─────────────┘
```

Each agent:
1. Subscribes to specific event types
2. Processes the event
3. Emits zero or more new events
4. All events are persisted to the Event Store

---

## 3. Agent Design Principles

### 3.1 Agents Are Independent Workers

Each agent is a standalone process/function that:
- Receives events from the message queue
- Has access only to the data it needs (strict context windows)
- Produces deterministic output given the same input
- Can be tested in complete isolation

### 3.2 Agents Have Configurable Settings

Every agent has an associated settings schema that defines:
- What parameters it accepts (e.g., "number of events to generate")
- Valid ranges for each parameter (e.g., 1-20)
- Default values
- User-facing labels and descriptions

Example settings schema (conceptual):
```
MetaEventGenerator:
  parameters:
    event_count:
      type: integer
      min: 4
      max: 20
      default: 8
      label: "Events per tick"
      description: "How many possible events to generate each round"
    
    creativity:
      type: float
      min: 0.0
      max: 1.0
      default: 0.7
      label: "Creativity"
      description: "Higher values produce more unusual events"
```

The settings UI is **dynamically generated** from these schemas—no hardcoded settings pages.

### 3.3 Agents Have Default Fallbacks

If an agent fails (connection timeout, malformed response, API error):
1. The error is logged with full context
2. The agent returns a predefined default output
3. The tick continues with degraded but functional behavior
4. The player is notified of the fallback

This ensures the game never hard-crashes due to a single agent failure.

### 3.4 Agents Stream Output to Frontend

Every agent posts its activity back to the Next.js frontend in real-time:
- Event received
- Processing started
- Intermediate steps (if applicable)
- Output produced
- Event emitted

The player can watch the "thinking" process unfold, similar to watching an AI chain-of-thought.

---

## 4. Logging and Observability

### 4.1 Comprehensive Event Log

Every event in the system is captured in a structured log:
- Timestamp
- Event type
- Source agent
- Target agent(s)
- Payload (full data)
- Tick ID (correlation)
- Session ID

This log serves multiple purposes:
- Debugging during development
- Player transparency (viewable in UI)
- Replay/rewind functionality
- Analytics and tuning

### 4.2 Agent Activity Log

Separate from the event log, each agent maintains an activity log:
- Input received
- LLM prompts sent (if applicable)
- LLM responses received
- Processing decisions made
- Output produced
- Errors encountered

This enables detailed debugging of individual agent behavior.

---

## 5. Frontend Architecture

### 5.1 Base: Vercel AI Chatbot Template

Starting point is the Vercel AI SDK chatbot template, which provides:
- Next.js App Router structure
- AI SDK integration
- Chat UI components
- Authentication scaffolding

This will be heavily modified but provides a solid starting point.

### 5.2 Core UI Components

**Main Game View**
- Narrative display (the story as it unfolds)
- Player action input
- Current world state summary

**Event Inspector Panel** (collapsible)
- Real-time feed of agent activity
- Expandable event details
- Visual representation of event flow

**Settings Panel**
- Dynamically generated from agent settings schemas
- Sliders, toggles, and inputs based on parameter types
- Changes persist to agent settings store

**History/Timeline View**
- Visual timeline of all ticks
- Ability to select any point and view state
- Edit/rewind controls (later phases)

### 5.3 Dynamic Settings UI Generation

The settings page reads agent settings schemas and generates UI:

```
For each agent in registered_agents:
  Create collapsible section with agent name
  For each parameter in agent.settings_schema:
    If type is integer or float with min/max:
      Render slider with label and current value
    If type is boolean:
      Render toggle switch
    If type is enum:
      Render dropdown
    If type is text:
      Render text input
    
    Attach onChange handler that:
      1. Validates against schema constraints
      2. Updates agent settings store
      3. Persists to database
```

This means adding a new agent with settings requires only:
1. Creating the agent
2. Defining its settings schema
3. The UI automatically includes it

---

## 6. Phased Implementation Plan

### Phase 0: Foundation

**Goal**: Establish UI shell and infrastructure

**Components**:
- Clone and customize Vercel chatbot template
- Design and implement main game UI layout
- Set up message queue infrastructure (Redis Streams)
- Set up event store (Postgres)
- Create agent settings schema format and storage
- Build dynamic settings UI generator
- Implement event logging system
- Create agent activity viewer component

**Deliverables**:
- Working UI with placeholder content
- Settings page that can display/modify test settings
- Event log that displays test events
- Infrastructure ready for agents

**Testing Focus**:
- Settings changes persist correctly
- Events flow through queue to UI
- Logs capture all expected data

---

### Phase 1: Minimal Playable Loop

**Goal**: Player can take an action, receive narrated outcome, and save/load their game

**Event Chain**:
```
PLAYER_ACTION_SUBMITTED
       │
       ▼
┌──────────────────┐
│ Action Evaluator │  ← Determines difficulty, interprets intent
└────────┬─────────┘
         │
         ▼
   ACTION_EVALUATED
         │
         ▼
┌──────────────────┐
│ Probability Roll │  ← Rolls against difficulty, determines success/partial/fail
└────────┬─────────┘
         │
         ▼
   OUTCOME_DETERMINED
         │
         ▼
┌──────────────────┐
│    Narrator      │  ← Writes the story of what happened
└────────┬─────────┘
         │
         ▼
   NARRATION_COMPLETE
         │
         ▼
   [Display to player]
```

**Agents**:

1. **Action Evaluator**
   - Input: Player's raw action text, current world state summary
   - Output: Interpreted action, difficulty rating, relevant skills
   - Settings: interpretation_strictness (how literally to read player input)
   - Fallback: Treat as "moderate difficulty generic action"

2. **Probability Roll**
   - Input: Difficulty rating, relevant modifiers
   - Output: Roll result, success level (success/partial/failure)
   - Settings: use_player_stats (boolean), base_difficulty_modifier
   - Fallback: 50% success rate roll

3. **Narrator**
   - Input: Player action, outcome, world state, recent narrative
   - Output: Narrative paragraph describing what happened
   - Settings: verbosity (brief/normal/elaborate), tone (gritty/neutral/heroic)
   - Fallback: Generic "[Action] resulted in [outcome]" text

**Save/Load System** (Core Feature from Phase 1):

Save and load functionality is essential from the beginning, not an afterthought.

*Save Game*:
- Triggered manually by player or auto-save after each tick
- Captures complete game state:
  - Current tick ID (pointer into event history)
  - World state snapshot (locations, time, narrative)
  - Agent settings at time of save
  - Session metadata (name, created date, last played)
- Save slots: Multiple saves per session allowed
- Save format: JSON blob stored in Postgres `game_saves` table

*Load Game*:
- Player selects from list of saves (sorted by date)
- System reconstructs state:
  - Load snapshot directly (fast path)
  - Or replay events from earlier snapshot if needed (for older saves)
- Resume play from exact saved state
- Loading creates a branch point (original timeline preserved)

*Auto-Save*:
- Automatic save after each completed tick
- Configurable: on/off, frequency (every tick, every N ticks)
- Auto-saves use rotating slots (keep last 5, configurable)

*New Game*:
- Creates fresh session with default world state
- Player names their game
- Initial world setup (location, starting conditions)

*UI Components*:
- Save button (always visible)
- Load button → opens save browser modal
- Save browser: list of saves with name, date, preview
- New game flow: name input → world selection → start
- Auto-save indicator (subtle, non-intrusive)

**Testing Focus**:
- Each agent produces valid output for various inputs
- Event chain completes end-to-end
- Fallbacks trigger correctly on simulated failures
- Settings modifications affect agent behavior
- All activity logged correctly
- Save captures complete state correctly
- Load restores exact saved state
- Auto-save triggers after each tick
- Multiple saves coexist without corruption
- New game creates valid initial state

---

### Phase 2: World Events and Approval

**Goal**: World generates events that the player can approve/reject before resolution

**New Event Chain** (extends Phase 1):
```
TICK_STARTED
     │
     ▼
┌────────────────────┐
│ MetaEvent Generator│  ← Proposes 8-12 possible world events
└─────────┬──────────┘
          │
          ▼
   EVENTS_PROPOSED
          │
          ▼
┌────────────────────┐
│  Player Approval   │  ← UI step: player reviews, approves, rejects, regenerates
└─────────┬──────────┘
          │
          ▼
   EVENTS_APPROVED
          │
          ▼
┌────────────────────┐
│ Probability Lookup │  ← Pulls event probabilities from database
└─────────┬──────────┘
          │
          ▼
   PROBABILITIES_RESOLVED
          │
          ▼
   [Continue to Phase 1 chain for player action]
```

**New Agents**:

4. **MetaEvent Generator**
   - Input: Current world state, location, time, recent events
   - Output: Array of possible events with base probabilities
   - Settings: event_count (4-20), category_weights (positive/negative/neutral ratios)
   - Fallback: Empty event list (no world events this tick)

5. **Probability Lookup** (may be a simple function, not full agent)
   - Input: Event IDs, world state modifiers
   - Output: Final probabilities for each event
   - Settings: probability_modifier (global adjustment)
   - Fallback: Use base probabilities from event definitions

**New UI Components**:
- Event approval modal/panel
- Event cards showing: description, category, probability, approve/reject buttons
- "Regenerate events" button
- Event history in inspector panel

**Database Additions**:
- Meta events table (event definitions, base probabilities)
- Approved events per tick
- Rejected events per tick (for learning/tuning)

**Testing Focus**:
- Event generation produces valid, varied events
- Approval UI correctly gates progression
- Rejected events don't appear in later ticks
- Probability lookup correctly modifies base values

---

### Phase 3: Outlines and NPC Decisions

**Goal**: NPCs react to events and player actions; narrative has structured outline

**New Event Chain** (extends Phase 2):
```
   EVENTS_APPROVED
          │
          ▼
┌────────────────────┐
│  Outline Generator │  ← Creates branching narrative structure
└─────────┬──────────┘
          │
          ▼
   OUTLINE_CREATED
          │
          ▼
┌────────────────────┐
│NPC Decision Maker  │  ← Each relevant NPC decides how to react
└─────────┬──────────┘
          │
    (may loop if NPC action affects other NPCs)
          │
          ▼
   NPC_DECISIONS_COMPLETE
          │
          ▼
   [Continue to Narrator with enriched context]
```

**New Agents**:

6. **Outline Generator**
   - Input: Approved events, player action, world state
   - Output: Structured outline with beats, branches, NPC involvement flags
   - Settings: outline_complexity (simple/branching/complex), pacing
   - Fallback: Linear outline with single path

7. **NPC Decision Maker**
   - Input: Outline, specific NPC profile, NPC goals, relationships
   - Output: NPC's intended action/reaction, dialogue if applicable
   - Settings: max_npcs_per_scene (default: 2, adjustable 1-10), decision_depth
   - Fallback: NPC takes no action (remains passive)

**NPC Decision Loop**:
- Outline Generator marks which NPCs are "active" in the scene
- NPC Decision Maker processes each active NPC
- If an NPC's decision affects another NPC, emit NPC_DECISION_NEEDED for that NPC
- Loop continues until no new NPC decisions needed
- Safeguard: maximum 10 NPC decisions per tick (configurable)

**Database Additions**:
- NPC profiles table (personality, goals, relationships)
- NPC decision history
- Outline templates/patterns

**Testing Focus**:
- Outline structure is valid and parseable
- NPC decisions respect personality constraints
- Loop termination works correctly
- Max NPC limit enforced
- NPCs not in scene are not processed

---

## 7. Data Architecture

**See also**: `database/README.md` for detailed schema documentation.

The database schema is **agent-driven**: each agent defines its own tables in separate SQL files. On startup, these are combined into a unified schema.

### 7.1 Core Principle: Event Sourcing for Editability

The entire game state can be reconstructed by replaying events. This enables:
- **Rollback**: Return to any previous tick
- **Edit & Replay**: Change an AI response, then replay from that point
- **Branching**: Create alternate timelines from edit points

When a player edits any output:
1. System creates a new "branch" from that tick's parent
2. Stores the edit as a new event on the branch
3. Replays all downstream agents from that point
4. Original timeline is preserved (can switch back)

### 7.2 Event Store (Postgres)

**Core System Tables** (defined in `database/init/00-core.sql`):
- `sessions`: Game sessions (one per playthrough)
- `branches`: Timeline branches for editability
- `ticks`: One cycle of the game loop
- `events`: Immutable event log (source of truth)
- `agent_registry`: Registered agents and settings schemas
- `agent_settings`: Current setting values per session

**Agent Tables** (defined in `database/agents/*.sql`):

Phase 1:
- `evaluated_actions`: Player action interpretations (action-evaluator.sql)
- `probability_rolls`: All dice rolls (probability-roll.sql)
- `narrative_segments`: Generated story text (narrator.sql)
- `game_saves`: Manual and auto-saves (save-load.sql)
- `world_snapshots`: Periodic state captures (save-load.sql)

Phase 2:
- `meta_event_templates`: Library of possible events (meta-event-generator.sql)
- `proposed_events`: Events proposed for a tick (meta-event-generator.sql)
- `approval_decisions`: Player approval history (player-approval.sql)
- `approval_stats`: Aggregate stats for tuning (player-approval.sql)

Phase 3:
- `narrative_outlines`: Structured outlines (outline-generator.sql)
- `locations`: Discovered locations (outline-generator.sql)
- `npcs`: NPC identity/personality (npc-decision-maker.sql)
- `npc_state`: NPC dynamic state (npc-decision-maker.sql)
- `npc_decisions`: NPC decisions per tick (npc-decision-maker.sql)

### 7.3 Message Queue (Redis Streams)

**Streams**:
- One stream per event type (e.g., `events:player_action_submitted`)
- Consumer groups for each agent that processes that event type
- Dead letter stream for failed processing

**Ephemeral Storage**:
- Current tick state (in-progress data)
- Agent locks (prevent duplicate processing)
- Real-time status for UI streaming

### 7.4 Event Types (Initial Set)

Phase 1:
- `PLAYER_ACTION_SUBMITTED`
- `ACTION_EVALUATED`
- `OUTCOME_DETERMINED`
- `NARRATION_COMPLETE`

Phase 2:
- `TICK_STARTED`
- `EVENTS_PROPOSED`
- `EVENTS_APPROVED`
- `PROBABILITIES_RESOLVED`

Phase 3:
- `OUTLINE_CREATED`
- `NPC_DECISION_NEEDED`
- `NPC_DECISION_MADE`
- `NPC_DECISIONS_COMPLETE`

System:
- `AGENT_ERROR`
- `FALLBACK_USED`
- `TICK_COMMITTED`

### 7.5 Branching Model for Editability

```
Timeline A (original):
  Tick 1 → Tick 2 → Tick 3 → Tick 4
                      ↑
                 Player edits Tick 3's narrative
                      ↓
Timeline B (branch):
  Tick 1 → Tick 2 → Tick 3' → Tick 4' → ...
```

The `branches` table tracks:
- `branch_id`: Unique identifier
- `parent_branch_id`: NULL for main timeline, points to parent for edits
- `fork_tick_id`: Which tick was edited to create this branch
- `is_active`: Only one branch active per session at a time

Players can switch between branches via the UI.

---

## 8. Settings System Deep Dive

### 8.1 Settings Schema Format

Each agent defines its settings in a structured format:

```
agent_id: "meta_event_generator"
display_name: "World Event Generator"
description: "Creates possible events that might happen in the world"

parameters:
  - id: "event_count"
    type: "integer"
    min: 4
    max: 20
    default: 8
    step: 1
    label: "Events to Generate"
    description: "Number of possible events to propose each tick"
    ui_component: "slider"
  
  - id: "positive_weight"
    type: "float"
    min: 0.0
    max: 1.0
    default: 0.33
    step: 0.05
    label: "Positive Event Weight"
    description: "Likelihood of generating beneficial events"
    ui_component: "slider"
  
  - id: "include_recurring"
    type: "boolean"
    default: true
    label: "Include Recurring Events"
    description: "Whether to include events that happened recently"
    ui_component: "toggle"
```

### 8.2 Settings Flow

1. Agent registers its settings schema on startup
2. Schema stored in `agent_settings_schemas` table
3. Frontend fetches schemas, generates UI components
4. Player adjusts settings via generated UI
5. Changes written to `agent_settings_values` table
6. Agent reads current settings when processing events
7. Settings changes take effect on next tick

### 8.3 Settings Scopes

- **Session**: Apply to current game session (primary scope)
- **Tick Override**: One-time override for next tick only

Note: User-level defaults (settings that carry across sessions) may be added in future phases.

---

## 9. Error Handling and Fallbacks

### 9.1 Fallback Philosophy

The game should never hard-stop due to a single component failure. Every agent has a fallback behavior that:
- Produces valid (if boring) output
- Allows the tick to complete
- Notifies the player something went wrong
- Logs full error context for debugging

### 9.2 Fallback Examples

| Agent | Failure Mode | Fallback Behavior |
|-------|--------------|-------------------|
| Action Evaluator | LLM timeout | Treat as "moderate difficulty, generic action" |
| Probability Roll | Invalid difficulty | Use 50% success rate |
| Narrator | LLM error | "[Your action] resulted in [outcome]." |
| MetaEvent Generator | No events generated | Empty event list (quiet tick) |
| NPC Decision Maker | NPC profile missing | NPC takes no action |
| Outline Generator | Complex state | Linear single-path outline |

### 9.3 Error Visibility

When a fallback is used:
- Event log shows `FALLBACK_USED` event with details
- UI displays subtle indicator (not intrusive)
- Full error available in Event Inspector
- Automatic retry on next tick if appropriate

---

## 10. Future Expansion Points

These are not in the current implementation plan but the architecture should accommodate:

### 10.1 Additional Agents (Future)
- **Tick Length Agent**: Determines how much world time passes
- **Event Reviewer**: Filters inappropriate or unbalanced events
- **Difficulty Scorer**: Analyzes player actions for challenge rating
- **Relationship Tracker**: Maintains NPC-to-NPC and NPC-to-player relationships
- **World State Summarizer**: Creates compressed world state for context windows

### 10.2 Multiplayer (Future)
- Multiple players in same world
- Player action ordering/priority
- Shared world events
- Player-to-player interactions

### 10.3 Advanced Editability (Future)
- Edit any past tick and replay forward
- Branch timelines from edit points
- Compare "what if" scenarios
- Export/import world states

### 10.4 Content Creation Tools (Future)
- Custom NPC creation UI
- Location/world building tools
- Event template creation
- Campaign/scenario sharing

---

## 11. Technology Stack

### Confirmed
- **Frontend**: Next.js (App Router)
- **AI SDK**: Vercel AI SDK
- **Database**: PostgreSQL (Neon or Supabase)
- **Message Queue**: Redis Streams (Upstash for serverless)
- **Hosting**: Vercel (serverless)

### To Be Decided
- **LLM Provider**: OpenAI / Anthropic / local models
- **Authentication**: NextAuth / Clerk / Supabase Auth
- **Real-time Updates**: Server-Sent Events / WebSockets / Polling

---

## 12. Success Criteria by Phase

### Phase 0 Complete When:
- [ ] UI shell renders with all major sections
- [ ] Settings page generates from test schema
- [ ] Events flow through Redis to frontend display
- [ ] Logs capture test events correctly

### Phase 1 Complete When:
- [ ] Player can type action and receive narrated response
- [ ] All three agents process in sequence
- [ ] Fallbacks trigger correctly on simulated failures
- [ ] Settings modifications change agent behavior
- [ ] Event inspector shows full chain
- [ ] Player can save game manually
- [ ] Player can load from any save
- [ ] Auto-save works after each tick
- [ ] New game creates fresh session

### Phase 2 Complete When:
- [ ] World events generate each tick
- [ ] Player can approve/reject/regenerate events
- [ ] Approved events affect narrative
- [ ] Event probabilities pull from database

### Phase 3 Complete When:
- [ ] Outlines create structured narrative beats
- [ ] NPCs make decisions based on personality
- [ ] NPC actions can trigger other NPC reactions
- [ ] Max NPC limit is respected and configurable

---

## Appendix A: Glossary

- **Tick**: One cycle of the simulation (player acts, world responds)
- **Agent**: An independent processing unit that handles specific event types
- **Event**: A message passed between agents through the message queue
- **Event Store**: Permanent database of all events (Postgres)
- **Message Queue**: Temporary routing system for events (Redis Streams)
- **Fallback**: Default behavior when an agent fails
- **Settings Schema**: Definition of what parameters an agent accepts
- **Context Window**: The limited set of data an agent receives

---

## Appendix B: Related Documents

- `Architecture-Comparison.md`: Original comparison of architecture options
- `Event-Log.md`: Example of event log structure from prototype
- `database/README.md`: Database architecture and schema documentation
- `database/docker-compose.yml`: Local development database setup
- `database/agents/*.sql`: Individual agent schema definitions

---

*Document Version: 1.2*
*Last Updated: December 30, 2024*

**Changelog**:
- v1.2: Added database architecture with agent-driven schemas; added editability/branching model
- v1.1: Added save/load to Phase 1; removed global settings scope
- v1.0: Initial specification

