-- SAIRPG Database Schema Initialization
-- Creates the core schema and module schemas for stages 1-4
-- NPCs schema intentionally excluded (custom JSON structure planned)

-- =============================================================================
-- CORE SCHEMA: Sessions, Event Log, Prompts, Artifacts
-- =============================================================================
CREATE SCHEMA IF NOT EXISTS core;

-- Sessions table: represents a game session/playthrough
CREATE TABLE IF NOT EXISTS core.sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    world_id UUID,
    title TEXT NOT NULL DEFAULT 'Untitled Adventure',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    branch_id UUID DEFAULT gen_random_uuid(),
    parent_branch_id UUID,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- Event Log: Append-only log of all game events (the source of truth)
CREATE TABLE IF NOT EXISTS core.event_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES core.sessions(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL,
    sequence_num BIGINT NOT NULL,
    turn_id UUID,
    event_type VARCHAR(100) NOT NULL,
    module_name VARCHAR(100) NOT NULL DEFAULT 'system',
    actor VARCHAR(50) NOT NULL DEFAULT 'system', -- 'player', 'narrator', 'system', module name
    payload JSONB NOT NULL DEFAULT '{}',
    parent_event_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Soft invalidation for branching
    valid_from_branch UUID,
    invalidated_at_branch UUID,
    UNIQUE(session_id, branch_id, sequence_num)
);

-- Index for efficient queries
CREATE INDEX IF NOT EXISTS idx_event_log_session_branch ON core.event_log(session_id, branch_id, sequence_num);
CREATE INDEX IF NOT EXISTS idx_event_log_turn ON core.event_log(turn_id);
CREATE INDEX IF NOT EXISTS idx_event_log_type ON core.event_log(event_type);
CREATE INDEX IF NOT EXISTS idx_event_log_module ON core.event_log(module_name);

-- Prompts table: Versioned prompts for all modules
CREATE TABLE IF NOT EXISTS core.prompts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    module_name VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    content TEXT NOT NULL,
    settings JSONB NOT NULL DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(module_name, name, version)
);

-- Artifacts table: Every AI call is logged here for debugging/replay
CREATE TABLE IF NOT EXISTS core.artifacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES core.sessions(id) ON DELETE CASCADE,
    event_id UUID REFERENCES core.event_log(id) ON DELETE SET NULL,
    prompt_id UUID REFERENCES core.prompts(id) ON DELETE SET NULL,
    module_name VARCHAR(100) NOT NULL,
    model VARCHAR(100) NOT NULL,
    input_text TEXT NOT NULL,
    output_text TEXT,
    tokens_in INTEGER,
    tokens_out INTEGER,
    latency_ms INTEGER,
    cost_usd DECIMAL(10, 6),
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_artifacts_session ON core.artifacts(session_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_event ON core.artifacts(event_id);

-- Branches table: Track timeline branches for save/load/edit
CREATE TABLE IF NOT EXISTS core.branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES core.sessions(id) ON DELETE CASCADE,
    parent_branch_id UUID REFERENCES core.branches(id),
    fork_event_id UUID REFERENCES core.event_log(id),
    name VARCHAR(255),
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_branches_session ON core.branches(session_id);

-- =============================================================================
-- MOD_NARRATOR SCHEMA: Narrator module state
-- =============================================================================
CREATE SCHEMA IF NOT EXISTS mod_narrator;

-- Narrator state per session
CREATE TABLE IF NOT EXISTS mod_narrator.state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL,
    branch_id UUID NOT NULL,
    world_summary TEXT,
    current_scene TEXT,
    tone VARCHAR(100) DEFAULT 'neutral',
    settings JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(session_id, branch_id)
);

-- =============================================================================
-- MOD_META_EVENTS SCHEMA: World events that happen around the player
-- =============================================================================
CREATE SCHEMA IF NOT EXISTS mod_meta_events;

-- Event templates: Predefined events that can be triggered
CREATE TABLE IF NOT EXISTS mod_meta_events.templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    trigger_conditions JSONB NOT NULL DEFAULT '{}',
    payload_template JSONB NOT NULL DEFAULT '{}',
    priority INTEGER NOT NULL DEFAULT 0,
    cooldown_turns INTEGER DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Pending events: Events queued for player approval or execution
CREATE TABLE IF NOT EXISTS mod_meta_events.pending (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL,
    branch_id UUID NOT NULL,
    template_id UUID REFERENCES mod_meta_events.templates(id),
    event_data JSONB NOT NULL DEFAULT '{}',
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, approved, rejected, executed
    proposed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pending_session ON mod_meta_events.pending(session_id, branch_id);

-- =============================================================================
-- MOD_TIME SCHEMA: Time tracking and calendar
-- =============================================================================
CREATE SCHEMA IF NOT EXISTS mod_time;

CREATE TABLE IF NOT EXISTS mod_time.state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL,
    branch_id UUID NOT NULL,
    game_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    time_scale DECIMAL(10, 2) NOT NULL DEFAULT 1.0,
    calendar_system VARCHAR(100) DEFAULT 'gregorian',
    settings JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(session_id, branch_id)
);

-- =============================================================================
-- MOD_LOOP_STACK SCHEMA: Nested loop/goal management
-- =============================================================================
CREATE SCHEMA IF NOT EXISTS mod_loop_stack;

-- Loop definitions
CREATE TABLE IF NOT EXISTS mod_loop_stack.loops (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL,
    branch_id UUID NOT NULL,
    parent_loop_id UUID REFERENCES mod_loop_stack.loops(id),
    depth INTEGER NOT NULL DEFAULT 0,
    goal TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'active', -- active, resolved, failed, abandoned
    resolution TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_loops_session ON mod_loop_stack.loops(session_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_loops_parent ON mod_loop_stack.loops(parent_loop_id);
CREATE INDEX IF NOT EXISTS idx_loops_status ON mod_loop_stack.loops(status);

-- Current stack state (denormalized for fast access)
CREATE TABLE IF NOT EXISTS mod_loop_stack.stack_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL,
    branch_id UUID NOT NULL,
    stack_json JSONB NOT NULL DEFAULT '[]', -- Array of loop IDs from bottom to top
    current_depth INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(session_id, branch_id)
);

-- =============================================================================
-- Seed default narrator prompt
-- =============================================================================
INSERT INTO core.prompts (module_name, name, version, content, settings) VALUES
('narrator', 'default', 1, 
'You are the Narrator for an interactive RPG experience. Your role is to:
1. Describe the world and scene vividly
2. React to player actions with appropriate consequences
3. Maintain narrative consistency
4. Create engaging, immersive storytelling

Current Scene Context:
{{scene_context}}

Player Action:
{{player_action}}

Respond with the narrative outcome of this action.',
'{"temperature": 0.8, "max_tokens": 1000, "tone_slider": 50, "detail_slider": 70}'
)
ON CONFLICT (module_name, name, version) DO NOTHING;
