-- ============================================
-- Agent: Outline Generator
-- Phase: 3
-- Description: Creates structured narrative outlines
--              with beats, branches, and NPC involvement
-- ============================================

-- Narrative outlines for each tick
CREATE TABLE IF NOT EXISTS narrative_outlines (
    outline_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tick_id UUID NOT NULL REFERENCES ticks(tick_id) ON DELETE CASCADE,
    
    -- The structured outline
    outline_structure JSONB NOT NULL,
    /*
    Example structure:
    {
        "beats": [
            {
                "beat_id": "beat_1",
                "type": "scene_start",
                "description": "Player enters the tavern",
                "npcs_involved": ["innkeeper_marta"],
                "branches": []
            },
            {
                "beat_id": "beat_2",
                "type": "interaction",
                "description": "Player asks about room",
                "npcs_involved": ["innkeeper_marta"],
                "branches": [
                    {"condition": "success", "next_beat": "beat_3a"},
                    {"condition": "failure", "next_beat": "beat_3b"}
                ]
            }
        ],
        "active_npcs": ["innkeeper_marta", "bard_corwin"],
        "pacing": "normal",
        "estimated_duration": "30 minutes in-game"
    }
    */
    
    -- NPCs flagged as active in this outline
    active_npc_ids JSONB DEFAULT '[]',
    
    -- Complexity metrics
    beat_count INTEGER,
    branch_count INTEGER,
    
    -- Was this a fallback (simple linear outline)?
    used_fallback BOOLEAN DEFAULT FALSE,
    
    -- LLM metadata
    llm_prompt_tokens INTEGER,
    llm_completion_tokens INTEGER,
    processing_time_ms INTEGER,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Locations table (referenced by outlines and NPCs)
CREATE TABLE IF NOT EXISTS locations (
    location_id VARCHAR(100) PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
    
    -- Location details
    location_name VARCHAR(255) NOT NULL,
    location_type VARCHAR(50),  -- settlement, wilderness, building, dungeon
    description TEXT,
    
    -- Connections to other locations
    connections JSONB DEFAULT '{}',  -- {north: "location_id", south: null, ...}
    
    -- Discovery info
    discovered_tick UUID REFERENCES ticks(tick_id),
    is_known BOOLEAN DEFAULT TRUE,
    
    -- For mapping
    coordinates JSONB,  -- Optional x,y for visual map
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for finding outlines by tick
CREATE INDEX IF NOT EXISTS idx_narrative_outlines_tick 
    ON narrative_outlines(tick_id);

-- Index for finding locations by session
CREATE INDEX IF NOT EXISTS idx_locations_session 
    ON locations(session_id);

-- Register this agent's settings schema
INSERT INTO agent_registry (agent_id, display_name, description, phase, settings_schema)
VALUES (
    'outline_generator',
    'Narrative Outline Generator',
    'Creates structured outlines with beats and branches',
    3,
    '{
        "parameters": [
            {
                "id": "outline_complexity",
                "type": "enum",
                "options": ["simple", "branching", "complex"],
                "default": "branching",
                "label": "Outline Complexity",
                "description": "How elaborate the narrative structure should be",
                "ui_component": "dropdown"
            },
            {
                "id": "max_beats",
                "type": "integer",
                "min": 2,
                "max": 10,
                "default": 5,
                "step": 1,
                "label": "Maximum Beats",
                "description": "Maximum number of narrative beats per tick",
                "ui_component": "slider"
            },
            {
                "id": "pacing",
                "type": "enum",
                "options": ["slow", "normal", "fast"],
                "default": "normal",
                "label": "Narrative Pacing",
                "description": "How quickly events unfold",
                "ui_component": "dropdown"
            },
            {
                "id": "include_environmental_beats",
                "type": "boolean",
                "default": true,
                "label": "Include Environment",
                "description": "Add beats describing the environment and atmosphere",
                "ui_component": "toggle"
            }
        ]
    }'::jsonb
)
ON CONFLICT (agent_id) DO UPDATE SET
    settings_schema = EXCLUDED.settings_schema,
    display_name = EXCLUDED.display_name;

-- ============================================
-- End Agent: Outline Generator
-- ============================================

