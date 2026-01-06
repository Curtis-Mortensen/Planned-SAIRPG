# SAIRPG: AI-Powered RPG Simulation Engine

An event-driven, AI-powered RPG engine where the world simulates autonomously around the player. Every action is editable, rewindable, and transparent.

## Overview

SAIRPG (Simulated AI RPG) is a next-generation RPG engine that uses AI modules to create dynamic, responsive game worlds. Unlike traditional RPGs with scripted events, SAIRPG uses a **Hub-and-Spoke architecture** where a central Narrator coordinates with specialized constraint, meta, and interaction modules to generate the story.

### Key Features

- **Hub-and-Spoke Architecture**: A central Narrator module acts as the hub, receiving context and constraints from specialized modules (Time, Difficulty, NPCs).
- **Nested Loop Gameplay**: Actions can trigger nested "loops" (scenes/goals) that act as a stack, allowing for deep, granular interactions that must resolve before returning to the parent context.
- **Full Editability**: Edit any AI output and replay from that point, creating timeline branches without mutating history.
- **Event Sourcing**: Complete history reconstruction through immutable event logs.
- **Workflow Orchestration**: Powered by Inngest to manage complex state, retries, and module sequencing.

## Architecture

### Core Mental Model

1. **The Loop**: The fundamental unit of gameplay. A loop represents a player's attempt to achieve a goal. Loops can be nested (e.g., a "Combat Loop" containing a "Grapple Loop").
2. **The Stack**: Loops act like a call stack. Players dive deeper into nested contexts and must "pop" back up (resolve) to return to the broader story.
3. **Hub-and-Spoke**: The **Narrator Module** is the core. It receives inputs from all other modules and produces the final output.
4. **AgentPacks**: Game worlds are defined by "packs" of swappable modules, allowing for entirely different gameplay loops (e.g., a "Survival Pack" vs. a "Diplomacy Pack").

### Module Taxonomy

- **Constraint Modules** (Run First): Limit possibilities or set costs (e.g., Time, Difficulty, Inventory). They generally do not need narrative context.
- **Meta Modules** (Run Second): Provide structural events or control flow (e.g., Meta Nesting, Meta Events). They need context to make decisions.
- **Interaction Modules** (Run Third): Shape narrative through reactions (e.g., NPCs, Background).
- **Narrator Module** (Runs Last): The Hub. Consumes all inputs, context, and constraints to produce the final narrative and state signals.

### Event Flow (Inngest Workflow)

Player Action Submitted

↓

[Input Gate: Valid Input Module]

↓

[Constraint Modules] (Time, Difficulty)

↓

[Meta Modules] (Nesting Decision, Meta Events)

↓

[Interaction Modules] (NPC Reactions)

↓

[Narrator Module] (Synthesizes all inputs -> Output)

↓

[Stack Controller] (Updates Loop Depth/Status)

↓

Display to Player

## Implementation Stages

### Stage 0: Foundation
- UI shell + infrastructure setup
- Authentication (via existing Chatbot implementation)
- Database (Postgres) connection
- Inngest setup for orchestration

### Stage 1: The Core Narrator ✅ (Current Focus)
- **Narrator Module Only**: Two parts (Action Validator + Narrator Proper).
- Simple flat loops (no nesting yet).
- Narrator decides outcomes based on narrative logic (no probability module yet).
- DB-stored prompts.

### Stage 2: Persistence & Branching
- Save/Load system.
- Artifact editing -> branch creation.
- Timeline/Tree view in UI.
- Event Inspector.

### Stage 3: The Nesting Module
- Introduction of the **Meta Nesting Module**.
- Enables recursive loops (e.g., entering a scene within a scene).
- "Pop" logic to resolve nests and return to parent loops.
- Depth limits and stack management.

### Stage 4: Meta Events
- **Meta Event Module**: Proposes world events based on context.
- Player approval workflow.

### Stage 5 & Beyond
- **Interaction Modules**: NPCs with distinct personalities.
- **Constraint Modules**: Time tracking, Inventory, Stats.
- **AgentPacks**: User-configurable module bundles.

## Technology Stack

- **Frontend**: Next.js (App Router)
- **Orchestration**: Inngest (Serverless Queue/Workflow)
- **AI SDK**: Vercel AI SDK
- **Database**: PostgreSQL 16
- **Language**: TypeScript

## Getting Started

[To be determined based on final repo structure]

## Contributing

See `Stage-1-Stories.md` for current development tasks.