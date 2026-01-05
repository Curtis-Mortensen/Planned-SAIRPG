-- ============================================
-- Agent: NPC Decision Maker
-- Phase: 3
-- Description: Simulates NPC decisions and reactions
--              based on personality, goals, and relationships
-- ============================================

-- NPC identity (stable, doesn't change)
CREATE TABLE IF NOT EXISTS npcs (
    npc_id VARCHAR(100) PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
    
    -- Basic identity
    npc_name VARCHAR(255) NOT NULL,
    npc_title VARCHAR(255),  -- "the Innkeeper", "Captain of the Guard"
    
    -- Core personality matrix (stable traits)
    personality JSONB NOT NULL,
    /*
    Example:
    {
        "threat": 3,        -- 1-10: How threatening/dangerous
        "honesty": 7,       -- 1-10: How truthful
        "trust": 5,         -- 1-10: How trusting of strangers
        "cynicism": 4,      -- 1-10: How cynical/pessimistic
        "warmth": 6,        -- 1-10: How friendly/welcoming
        "impulsivity": 3    -- 1-10: How impulsive vs calculated
    }
    */
    
    -- Appearance and voice
    physical_description TEXT,
    voice_description TEXT,  -- "gruff", "melodic", "whispered"
    
    -- Background
    backstory TEXT,
    occupation VARCHAR(255),
    
    -- Is this NPC still active in the story?
    is_active BOOLEAN DEFAULT TRUE,
    
    -- When was this NPC first encountered?
    first_encountered_tick UUID REFERENCES ticks(tick_id),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- NPC dynamic state (changes over time, event-sourced)
CREATE TABLE IF NOT EXISTS npc_state (
    state_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    npc_id VARCHAR(100) NOT NULL REFERENCES npcs(npc_id) ON DELETE CASCADE,
    tick_id UUID NOT NULL REFERENCES ticks(tick_id) ON DELETE CASCADE,
    
    -- Current location
    location_id VARCHAR(100) REFERENCES locations(location_id),
    
    -- Current goals (can change based on events)
    active_goals JSONB DEFAULT '[]',
    /*
    Example:
    [
        {
            "goal_id": "goal_1",
            "description": "Expand the inn",
            "scope": "town",  -- personal, family, town, region, world
            "priority": "high",
            "progress": 0.3
        }
    ]
    */
    
    -- Relationship with player
    player_relationship JSONB DEFAULT '{}',
    /*
    {
        "friendship": 1.0,    -- 0-10 scale
        "trust": 1.0,         -- 0-10 scale
        "deference": 1.0,     -- 0-10 scale (how much they defer to player)
        "fear": 0,            -- 0-10 scale
        "romantic": 0         -- 0-10 scale
    }
    */
    
    -- Relationships with other NPCs
    npc_relationships JSONB DEFAULT '{}',
    /* 
    {
        "npc_id_2": {"friendship": 5, "trust": 7, ...},
        "npc_id_3": {"friendship": 2, "trust": 1, ...}
    }
    */
    
    -- Current emotional state
    emotional_state JSONB DEFAULT '{}',
    /*
    {
        "primary_emotion": "content",
        "intensity": 0.5,
        "secondary_emotion": null
    }
    */
    
    -- Last known info (what this NPC knows happened)
    known_events JSONB DEFAULT '[]',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Only one state per NPC per tick
    CONSTRAINT unique_npc_state_per_tick UNIQUE(npc_id, tick_id)
);

-- NPC decisions made during simulation
CREATE TABLE IF NOT EXISTS npc_decisions (
    decision_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tick_id UUID NOT NULL REFERENCES ticks(tick_id) ON DELETE CASCADE,
    outline_id UUID REFERENCES narrative_outlines(outline_id),
    npc_id VARCHAR(100) NOT NULL REFERENCES npcs(npc_id),
    
    -- The decision
    decision_type VARCHAR(50),  -- action, dialogue, reaction, internal
    decision_description TEXT NOT NULL,
    
    -- What triggered this decision?
    trigger_event TEXT,  -- "player asked for room", "heard loud noise"
    
    -- Does this decision affect other NPCs?
    affects_npcs JSONB DEFAULT '[]',  -- List of npc_ids that should react
    triggers_chain BOOLEAN DEFAULT FALSE,  -- If true, spawns more NPC decisions
    
    -- Dialogue if applicable
    dialogue_text TEXT,
    dialogue_tone VARCHAR(50),  -- friendly, suspicious, angry, etc.
    
    -- Was this a fallback (NPC takes no action)?
    used_fallback BOOLEAN DEFAULT FALSE,
    
    -- Order within tick (for chained decisions)
    decision_sequence INTEGER DEFAULT 1,
    parent_decision_id UUID REFERENCES npc_decisions(decision_id),
    
    -- LLM metadata
    llm_prompt_tokens INTEGER,
    llm_completion_tokens INTEGER,
    processing_time_ms INTEGER,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for NPC queries
CREATE INDEX IF NOT EXISTS idx_npcs_session 
    ON npcs(session_id);

CREATE INDEX IF NOT EXISTS idx_npcs_active 
    ON npcs(session_id) WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_npc_state_npc 
    ON npc_state(npc_id, tick_id DESC);

CREATE INDEX IF NOT EXISTS idx_npc_state_location 
    ON npc_state(location_id);

CREATE INDEX IF NOT EXISTS idx_npc_decisions_tick 
    ON npc_decisions(tick_id, decision_sequence);

CREATE INDEX IF NOT EXISTS idx_npc_decisions_npc 
    ON npc_decisions(npc_id);

-- Function to get current NPC state (latest for each NPC on active branch)
CREATE OR REPLACE FUNCTION get_current_npc_state(p_session_id UUID)
RETURNS TABLE (
    npc_id VARCHAR(100),
    npc_name VARCHAR(255),
    location_id VARCHAR(100),
    active_goals JSONB,
    player_relationship JSONB,
    emotional_state JSONB
) AS $$
    WITH active_branch AS (
        SELECT branch_id FROM branches 
        WHERE session_id = p_session_id AND is_active = TRUE
        LIMIT 1
    ),
    latest_ticks AS (
        SELECT DISTINCT ON (ns.npc_id) 
            ns.npc_id,
            ns.location_id,
            ns.active_goals,
            ns.player_relationship,
            ns.emotional_state
        FROM npc_state ns
        JOIN ticks t ON ns.tick_id = t.tick_id
        JOIN active_branch ab ON t.branch_id = ab.branch_id
        ORDER BY ns.npc_id, t.tick_number DESC
    )
    SELECT 
        n.npc_id,
        n.npc_name,
        lt.location_id,
        lt.active_goals,
        lt.player_relationship,
        lt.emotional_state
    FROM npcs n
    JOIN latest_ticks lt ON n.npc_id = lt.npc_id
    WHERE n.session_id = p_session_id AND n.is_active = TRUE;
$$ LANGUAGE SQL STABLE;

-- Register this agent's settings schema
INSERT INTO agent_registry (agent_id, display_name, description, phase, settings_schema)
VALUES (
    'npc_decision_maker',
    'NPC Decision Maker',
    'Simulates NPC decisions based on personality and goals',
    3,
    '{
        "parameters": [
            {
                "id": "max_npcs_per_scene",
                "type": "integer",
                "min": 1,
                "max": 10,
                "default": 2,
                "step": 1,
                "label": "Max NPCs Per Scene",
                "description": "Maximum number of NPCs that can make decisions per tick",
                "ui_component": "slider"
            },
            {
                "id": "max_decision_chain",
                "type": "integer",
                "min": 1,
                "max": 10,
                "default": 5,
                "step": 1,
                "label": "Max Decision Chain",
                "description": "Maximum NPC reactions that can chain from one action",
                "ui_component": "slider"
            },
            {
                "id": "decision_depth",
                "type": "enum",
                "options": ["shallow", "normal", "deep"],
                "default": "normal",
                "label": "Decision Depth",
                "description": "How thoroughly NPCs consider their options",
                "ui_component": "dropdown"
            },
            {
                "id": "include_internal_monologue",
                "type": "boolean",
                "default": false,
                "label": "Show NPC Thoughts",
                "description": "Include NPC internal reasoning in output (for debugging)",
                "ui_component": "toggle"
            },
            {
                "id": "relationship_volatility",
                "type": "float",
                "min": 0.1,
                "max": 2.0,
                "default": 1.0,
                "step": 0.1,
                "label": "Relationship Volatility",
                "description": "How quickly NPC relationships change (1.0 = normal)",
                "ui_component": "slider"
            }
        ]
    }'::jsonb
)
ON CONFLICT (agent_id) DO UPDATE SET
    settings_schema = EXCLUDED.settings_schema,
    display_name = EXCLUDED.display_name;

-- ============================================
-- End Agent: NPC Decision Maker
-- ============================================

