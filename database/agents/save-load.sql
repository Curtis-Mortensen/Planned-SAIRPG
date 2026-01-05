-- ============================================
-- Agent: Save/Load System
-- Phase: 1
-- Description: Manages game saves, auto-saves,
--              and state restoration
-- ============================================

-- Player-created and auto-saves
CREATE TABLE IF NOT EXISTS game_saves (
    save_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(branch_id),
    tick_id UUID NOT NULL REFERENCES ticks(tick_id),
    
    -- Save metadata
    save_name VARCHAR(255) NOT NULL,
    save_type VARCHAR(50) NOT NULL,  -- manual, auto, quicksave
    
    -- Snapshot of world state at save time
    world_state_snapshot JSONB NOT NULL,
    
    -- Agent settings at save time (so loading restores settings too)
    agent_settings_snapshot JSONB,
    
    -- For save browser UI
    preview_text TEXT,  -- Last few sentences of narrative
    world_time VARCHAR(100),  -- In-game time
    play_time_seconds INTEGER,  -- Real time played
    
    -- Auto-save slot management
    auto_save_slot INTEGER,  -- 1-5 for rotating auto-saves
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Prevent duplicate auto-saves in same slot
    CONSTRAINT unique_auto_save_slot 
        UNIQUE NULLS NOT DISTINCT (session_id, auto_save_slot)
);

-- World state snapshots for faster loading
-- Created periodically (not every tick) for performance
CREATE TABLE IF NOT EXISTS world_snapshots (
    snapshot_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(branch_id),
    tick_id UUID NOT NULL REFERENCES ticks(tick_id),
    
    -- Complete world state as JSON
    snapshot_data JSONB NOT NULL,
    
    -- What's included in this snapshot
    includes_narrative BOOLEAN DEFAULT TRUE,
    includes_npcs BOOLEAN DEFAULT FALSE,  -- Phase 3
    includes_locations BOOLEAN DEFAULT TRUE,
    includes_meta_events BOOLEAN DEFAULT FALSE,  -- Phase 2
    
    -- For choosing which snapshot to load from
    tick_number INTEGER NOT NULL,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for finding saves by session
CREATE INDEX IF NOT EXISTS idx_game_saves_session 
    ON game_saves(session_id, created_at DESC);

-- Index for finding auto-saves
CREATE INDEX IF NOT EXISTS idx_game_saves_auto 
    ON game_saves(session_id, save_type, auto_save_slot) 
    WHERE save_type = 'auto';

-- Index for finding snapshots for replay
CREATE INDEX IF NOT EXISTS idx_world_snapshots_branch 
    ON world_snapshots(branch_id, tick_number DESC);

-- Function to create an auto-save with rotating slots
CREATE OR REPLACE FUNCTION create_auto_save(
    p_session_id UUID,
    p_branch_id UUID,
    p_tick_id UUID,
    p_world_state JSONB,
    p_preview_text TEXT,
    p_world_time VARCHAR(100),
    p_max_slots INTEGER DEFAULT 5
)
RETURNS UUID AS $$
DECLARE
    v_next_slot INTEGER;
    v_save_id UUID;
BEGIN
    -- Find the next slot (oldest auto-save or first empty)
    SELECT COALESCE(
        (SELECT auto_save_slot FROM game_saves 
         WHERE session_id = p_session_id AND save_type = 'auto'
         ORDER BY created_at ASC LIMIT 1),
        1
    ) INTO v_next_slot;
    
    -- Wrap around if needed
    IF v_next_slot > p_max_slots THEN
        v_next_slot := 1;
    END IF;
    
    -- Delete existing save in this slot
    DELETE FROM game_saves 
    WHERE session_id = p_session_id 
      AND save_type = 'auto' 
      AND auto_save_slot = v_next_slot;
    
    -- Create new auto-save
    INSERT INTO game_saves (
        session_id, branch_id, tick_id, 
        save_name, save_type, 
        world_state_snapshot, preview_text, world_time,
        auto_save_slot
    )
    VALUES (
        p_session_id, p_branch_id, p_tick_id,
        'Auto-save ' || v_next_slot, 'auto',
        p_world_state, p_preview_text, p_world_time,
        v_next_slot
    )
    RETURNING save_id INTO v_save_id;
    
    RETURN v_save_id;
END;
$$ LANGUAGE plpgsql;

-- Register this agent's settings schema
INSERT INTO agent_registry (agent_id, display_name, description, phase, settings_schema)
VALUES (
    'save_load',
    'Save/Load System',
    'Manages game saves and state restoration',
    1,
    '{
        "parameters": [
            {
                "id": "auto_save_enabled",
                "type": "boolean",
                "default": true,
                "label": "Auto-Save Enabled",
                "description": "Automatically save after each tick",
                "ui_component": "toggle"
            },
            {
                "id": "auto_save_slots",
                "type": "integer",
                "min": 1,
                "max": 10,
                "default": 5,
                "step": 1,
                "label": "Auto-Save Slots",
                "description": "Number of rotating auto-save slots",
                "ui_component": "slider"
            },
            {
                "id": "snapshot_frequency",
                "type": "integer",
                "min": 1,
                "max": 20,
                "default": 5,
                "step": 1,
                "label": "Snapshot Frequency",
                "description": "Create full snapshot every N ticks (for faster loading)",
                "ui_component": "slider"
            }
        ]
    }'::jsonb
)
ON CONFLICT (agent_id) DO UPDATE SET
    settings_schema = EXCLUDED.settings_schema,
    display_name = EXCLUDED.display_name;

-- ============================================
-- End Agent: Save/Load System
-- ============================================

