-- ============================================
-- Agent: Meta Event Generator
-- Phase: 2
-- Description: Proposes world events that may occur
--              each tick, independent of player action
-- ============================================

-- Library of possible world events
-- These are templates that can be instantiated
CREATE TABLE IF NOT EXISTS meta_event_templates (
    template_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES sessions(session_id) ON DELETE CASCADE,
    
    -- Event definition
    event_name VARCHAR(255) NOT NULL,
    event_description TEXT NOT NULL,
    category VARCHAR(50) NOT NULL,  -- positive, negative, neutral
    
    -- Base probability (before modifiers)
    base_probability INTEGER NOT NULL CHECK (base_probability BETWEEN 1 AND 100),
    rarity VARCHAR(50) DEFAULT 'common',  -- common, uncommon, rare, epic
    
    -- When this event can trigger
    location_requirement JSONB,  -- NULL = any location, or {location_id: ...}
    time_requirement JSONB,  -- NULL = any time, or {min_hour: 0, max_hour: 12}
    prerequisite_events JSONB DEFAULT '[]',  -- Events that must have happened
    
    -- Cooldown (can't trigger twice in N ticks)
    cooldown_ticks INTEGER DEFAULT 0,
    last_triggered_tick INTEGER,
    
    -- Is this a system template or player-created?
    is_system_template BOOLEAN DEFAULT FALSE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Events proposed for a specific tick
CREATE TABLE IF NOT EXISTS proposed_events (
    proposal_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tick_id UUID NOT NULL REFERENCES ticks(tick_id) ON DELETE CASCADE,
    template_id UUID REFERENCES meta_event_templates(template_id),
    
    -- Event details (may be customized from template)
    event_name VARCHAR(255) NOT NULL,
    event_description TEXT NOT NULL,
    category VARCHAR(50) NOT NULL,
    
    -- Probability for this specific proposal
    calculated_probability INTEGER NOT NULL,
    modifiers_applied JSONB DEFAULT '[]',  -- What affected the probability
    
    -- Approval status (set by player-approval agent)
    status VARCHAR(50) DEFAULT 'pending',  -- pending, approved, rejected
    
    -- If triggered, what roll was made?
    trigger_roll INTEGER,
    was_triggered BOOLEAN DEFAULT FALSE,
    
    -- Was this a fallback (empty proposal)?
    used_fallback BOOLEAN DEFAULT FALSE,
    
    -- LLM metadata
    llm_prompt_tokens INTEGER,
    llm_completion_tokens INTEGER,
    processing_time_ms INTEGER,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for querying events
CREATE INDEX IF NOT EXISTS idx_meta_event_templates_session 
    ON meta_event_templates(session_id);

CREATE INDEX IF NOT EXISTS idx_meta_event_templates_category 
    ON meta_event_templates(category, rarity);

CREATE INDEX IF NOT EXISTS idx_proposed_events_tick 
    ON proposed_events(tick_id);

CREATE INDEX IF NOT EXISTS idx_proposed_events_status 
    ON proposed_events(tick_id, status);

-- Register this agent's settings schema
INSERT INTO agent_registry (agent_id, display_name, description, phase, settings_schema)
VALUES (
    'meta_event_generator',
    'World Event Generator',
    'Creates possible events that might happen in the world',
    2,
    '{
        "parameters": [
            {
                "id": "event_count",
                "type": "integer",
                "min": 4,
                "max": 20,
                "default": 8,
                "step": 1,
                "label": "Events to Generate",
                "description": "Number of possible events to propose each tick",
                "ui_component": "slider"
            },
            {
                "id": "positive_weight",
                "type": "float",
                "min": 0.0,
                "max": 1.0,
                "default": 0.33,
                "step": 0.05,
                "label": "Positive Event Weight",
                "description": "Likelihood of generating beneficial events",
                "ui_component": "slider"
            },
            {
                "id": "negative_weight",
                "type": "float",
                "min": 0.0,
                "max": 1.0,
                "default": 0.33,
                "step": 0.05,
                "label": "Negative Event Weight",
                "description": "Likelihood of generating harmful events",
                "ui_component": "slider"
            },
            {
                "id": "include_rare_events",
                "type": "boolean",
                "default": true,
                "label": "Include Rare Events",
                "description": "Whether to occasionally propose rare and epic events",
                "ui_component": "toggle"
            },
            {
                "id": "creativity",
                "type": "float",
                "min": 0.0,
                "max": 1.0,
                "default": 0.7,
                "step": 0.1,
                "label": "Creativity",
                "description": "Higher values produce more unusual events",
                "ui_component": "slider"
            }
        ]
    }'::jsonb
)
ON CONFLICT (agent_id) DO UPDATE SET
    settings_schema = EXCLUDED.settings_schema,
    display_name = EXCLUDED.display_name;

-- ============================================
-- End Agent: Meta Event Generator
-- ============================================

