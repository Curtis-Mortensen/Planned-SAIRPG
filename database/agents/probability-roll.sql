-- ============================================
-- Agent: Probability Roll
-- Phase: 1
-- Description: Rolls against difficulty to determine
--              success, partial success, or failure
-- ============================================

-- Stores all rolls for transparency and replay
CREATE TABLE IF NOT EXISTS probability_rolls (
    roll_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tick_id UUID NOT NULL REFERENCES ticks(tick_id) ON DELETE CASCADE,
    evaluation_id UUID REFERENCES evaluated_actions(evaluation_id),
    
    -- The roll itself
    roll_value INTEGER NOT NULL CHECK (roll_value BETWEEN 1 AND 100),
    
    -- Difficulty threshold from evaluator
    difficulty_score INTEGER NOT NULL,
    
    -- Any modifiers applied
    modifiers JSONB DEFAULT '[]',  -- [{name: "tired", value: -10}, ...]
    final_threshold INTEGER NOT NULL,  -- difficulty + modifiers
    
    -- Outcome
    outcome VARCHAR(50) NOT NULL,  -- success, partial, failure
    margin INTEGER NOT NULL,  -- How much over/under threshold
    
    -- Was this a fallback roll?
    used_fallback BOOLEAN DEFAULT FALSE,
    
    -- For reproducibility
    random_seed BIGINT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for finding rolls by tick
CREATE INDEX IF NOT EXISTS idx_probability_rolls_tick 
    ON probability_rolls(tick_id);

-- Index for analytics (outcome distribution)
CREATE INDEX IF NOT EXISTS idx_probability_rolls_outcome 
    ON probability_rolls(outcome);

-- Register this agent's settings schema
INSERT INTO agent_registry (agent_id, display_name, description, phase, settings_schema)
VALUES (
    'probability_roll',
    'Probability Roll',
    'Determines success or failure based on difficulty',
    1,
    '{
        "parameters": [
            {
                "id": "use_player_stats",
                "type": "boolean",
                "default": false,
                "label": "Use Player Stats",
                "description": "Apply player stat bonuses to rolls (when stats system is implemented)",
                "ui_component": "toggle"
            },
            {
                "id": "base_difficulty_modifier",
                "type": "integer",
                "min": -20,
                "max": 20,
                "default": 0,
                "step": 5,
                "label": "Difficulty Modifier",
                "description": "Global adjustment to all difficulty checks (negative = easier)",
                "ui_component": "slider"
            },
            {
                "id": "partial_success_range",
                "type": "integer",
                "min": 5,
                "max": 25,
                "default": 15,
                "step": 5,
                "label": "Partial Success Range",
                "description": "How close to threshold counts as partial success",
                "ui_component": "slider"
            }
        ]
    }'::jsonb
)
ON CONFLICT (agent_id) DO UPDATE SET
    settings_schema = EXCLUDED.settings_schema,
    display_name = EXCLUDED.display_name;

-- ============================================
-- End Agent: Probability Roll
-- ============================================

