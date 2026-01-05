-- ============================================
-- Agent: Action Evaluator
-- Phase: 1
-- Description: Interprets player input and determines
--              difficulty rating for the attempted action
-- ============================================

-- Stores evaluated actions with their interpretations
-- This allows players to see how their input was understood
CREATE TABLE IF NOT EXISTS evaluated_actions (
    evaluation_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tick_id UUID NOT NULL REFERENCES ticks(tick_id) ON DELETE CASCADE,
    
    -- Original player input (exactly as typed)
    raw_input TEXT NOT NULL,
    
    -- How the agent interpreted the action
    interpreted_action TEXT NOT NULL,
    
    -- Difficulty assessment
    difficulty VARCHAR(50) NOT NULL,  -- trivial, easy, moderate, hard, extreme
    difficulty_score INTEGER NOT NULL CHECK (difficulty_score BETWEEN 1 AND 100),
    
    -- What skills/attributes are relevant (for future stat integration)
    relevant_skills JSONB DEFAULT '[]',
    
    -- Was this a fallback interpretation?
    used_fallback BOOLEAN DEFAULT FALSE,
    
    -- LLM metadata for debugging
    llm_prompt_tokens INTEGER,
    llm_completion_tokens INTEGER,
    processing_time_ms INTEGER,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for finding evaluations by tick
CREATE INDEX IF NOT EXISTS idx_evaluated_actions_tick 
    ON evaluated_actions(tick_id);

-- Register this agent's settings schema
INSERT INTO agent_registry (agent_id, display_name, description, phase, settings_schema)
VALUES (
    'action_evaluator',
    'Action Evaluator',
    'Interprets player input and determines difficulty rating',
    1,
    '{
        "parameters": [
            {
                "id": "interpretation_strictness",
                "type": "float",
                "min": 0.0,
                "max": 1.0,
                "default": 0.5,
                "step": 0.1,
                "label": "Interpretation Strictness",
                "description": "How literally to interpret player input (0 = creative, 1 = strict)",
                "ui_component": "slider"
            },
            {
                "id": "default_difficulty",
                "type": "enum",
                "options": ["trivial", "easy", "moderate", "hard", "extreme"],
                "default": "moderate",
                "label": "Default Difficulty",
                "description": "Fallback difficulty when unable to assess",
                "ui_component": "dropdown"
            }
        ]
    }'::jsonb
)
ON CONFLICT (agent_id) DO UPDATE SET
    settings_schema = EXCLUDED.settings_schema,
    display_name = EXCLUDED.display_name;

-- ============================================
-- End Agent: Action Evaluator
-- ============================================

