-- ============================================
-- CORE SYSTEM TABLES
-- These tables are required by the system itself,
-- independent of any specific agent.
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- Sessions: A single game playthrough
-- ============================================
CREATE TABLE IF NOT EXISTS sessions (
    session_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_played_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    world_name VARCHAR(255) DEFAULT 'Default World',
    is_active BOOLEAN DEFAULT TRUE
);

-- ============================================
-- Branches: Timeline branches for editability
-- Main timeline has parent_branch = NULL
-- Edited timelines point to their fork point
-- ============================================
CREATE TABLE IF NOT EXISTS branches (
    branch_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
    parent_branch_id UUID REFERENCES branches(branch_id),
    fork_tick_id UUID,  -- References ticks(tick_id), added after ticks table exists
    branch_name VARCHAR(255),  -- Optional label like "Edit: changed combat outcome"
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT FALSE,  -- Only one branch active per session
    
    CONSTRAINT one_active_branch_per_session 
        EXCLUDE (session_id WITH =) WHERE (is_active = TRUE)
);

-- ============================================
-- Ticks: One cycle of the game loop
-- ============================================
CREATE TABLE IF NOT EXISTS ticks (
    tick_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(branch_id) ON DELETE CASCADE,
    tick_number INTEGER NOT NULL,  -- Sequential within branch
    status VARCHAR(50) DEFAULT 'in_progress',  -- in_progress, completed, failed, edited
    world_time VARCHAR(100),  -- In-game time like "Day 1, Hour 14"
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    random_seed BIGINT,  -- For reproducibility
    
    CONSTRAINT unique_tick_per_branch UNIQUE(branch_id, tick_number)
);

-- Add foreign key from branches to ticks (circular reference)
ALTER TABLE branches 
    ADD CONSTRAINT fk_fork_tick 
    FOREIGN KEY (fork_tick_id) REFERENCES ticks(tick_id);

-- ============================================
-- Events: The immutable event log
-- This is the source of truth for all state
-- ============================================
CREATE TABLE IF NOT EXISTS events (
    event_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tick_id UUID NOT NULL REFERENCES ticks(tick_id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(branch_id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    agent_id VARCHAR(100),  -- Which agent produced this event
    sequence INTEGER NOT NULL,  -- Order within tick
    payload JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- For efficient replay queries
    CONSTRAINT unique_event_sequence UNIQUE(tick_id, sequence)
);

-- ============================================
-- Agent Registry: Track which agents are active
-- Populated at startup from agent configuration
-- ============================================
CREATE TABLE IF NOT EXISTS agent_registry (
    agent_id VARCHAR(100) PRIMARY KEY,
    display_name VARCHAR(255) NOT NULL,
    description TEXT,
    phase INTEGER NOT NULL,  -- 1, 2, or 3
    is_enabled BOOLEAN DEFAULT TRUE,
    settings_schema JSONB,  -- Dynamic settings definition
    registered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- Agent Settings: Current values per session
-- ============================================
CREATE TABLE IF NOT EXISTS agent_settings (
    setting_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
    agent_id VARCHAR(100) NOT NULL REFERENCES agent_registry(agent_id),
    settings_values JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_agent_settings_per_session UNIQUE(session_id, agent_id)
);

-- ============================================
-- Indexes for common query patterns
-- ============================================

-- Find all events for a tick (for replay)
CREATE INDEX IF NOT EXISTS idx_events_tick_sequence 
    ON events(tick_id, sequence);

-- Find all events on a branch (for full replay)
CREATE INDEX IF NOT EXISTS idx_events_branch 
    ON events(branch_id, created_at);

-- Find events by type (for debugging/analytics)
CREATE INDEX IF NOT EXISTS idx_events_type 
    ON events(event_type);

-- Find ticks on a branch
CREATE INDEX IF NOT EXISTS idx_ticks_branch 
    ON ticks(branch_id, tick_number);

-- Find active branch for session
CREATE INDEX IF NOT EXISTS idx_branches_active 
    ON branches(session_id) WHERE is_active = TRUE;

-- ============================================
-- Helper Functions
-- ============================================

-- Get the current active branch for a session
CREATE OR REPLACE FUNCTION get_active_branch(p_session_id UUID)
RETURNS UUID AS $$
    SELECT branch_id FROM branches 
    WHERE session_id = p_session_id AND is_active = TRUE
    LIMIT 1;
$$ LANGUAGE SQL STABLE;

-- Get the latest tick on a branch
CREATE OR REPLACE FUNCTION get_latest_tick(p_branch_id UUID)
RETURNS UUID AS $$
    SELECT tick_id FROM ticks 
    WHERE branch_id = p_branch_id 
    ORDER BY tick_number DESC 
    LIMIT 1;
$$ LANGUAGE SQL STABLE;

-- Create a new branch from an edit point
CREATE OR REPLACE FUNCTION create_branch_from_edit(
    p_session_id UUID,
    p_fork_tick_id UUID,
    p_branch_name VARCHAR(255) DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_parent_branch UUID;
    v_new_branch UUID;
BEGIN
    -- Get the branch of the tick being edited
    SELECT branch_id INTO v_parent_branch 
    FROM ticks WHERE tick_id = p_fork_tick_id;
    
    -- Deactivate current active branch
    UPDATE branches SET is_active = FALSE 
    WHERE session_id = p_session_id AND is_active = TRUE;
    
    -- Create new branch
    INSERT INTO branches (session_id, parent_branch_id, fork_tick_id, branch_name, is_active)
    VALUES (p_session_id, v_parent_branch, p_fork_tick_id, p_branch_name, TRUE)
    RETURNING branch_id INTO v_new_branch;
    
    RETURN v_new_branch;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- End Core System Tables
-- ============================================

