-- ============================================
-- Agent: Narrator
-- Phase: 1
-- Description: Generates narrative text describing
--              what happened based on action and outcome
-- ============================================

-- Stores all generated narrative segments
-- Each tick produces one narrative entry
CREATE TABLE IF NOT EXISTS narrative_segments (
    segment_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tick_id UUID NOT NULL REFERENCES ticks(tick_id) ON DELETE CASCADE,
    roll_id UUID REFERENCES probability_rolls(roll_id),
    
    -- The narrative content
    narrative_text TEXT NOT NULL,
    
    -- Metadata about what this narrates
    narrates_action TEXT,  -- What player action this describes
    narrates_outcome VARCHAR(50),  -- success/partial/failure
    
    -- For context continuity
    previous_segment_id UUID REFERENCES narrative_segments(segment_id),
    
    -- Was this a fallback narrative?
    used_fallback BOOLEAN DEFAULT FALSE,
    
    -- Version for edits (player can edit narrative)
    version INTEGER DEFAULT 1,
    is_player_edited BOOLEAN DEFAULT FALSE,
    original_text TEXT,  -- Stores AI version if player edited
    
    -- LLM metadata
    llm_prompt_tokens INTEGER,
    llm_completion_tokens INTEGER,
    processing_time_ms INTEGER,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Full narrative transcript view (for context window)
-- This combines all segments in order for a branch
CREATE OR REPLACE VIEW narrative_transcript AS
SELECT 
    b.session_id,
    b.branch_id,
    t.tick_number,
    t.world_time,
    ns.narrative_text,
    ns.is_player_edited,
    ns.created_at
FROM narrative_segments ns
JOIN ticks t ON ns.tick_id = t.tick_id
JOIN branches b ON t.branch_id = b.branch_id
ORDER BY b.session_id, b.branch_id, t.tick_number;

-- Index for finding narrative by tick
CREATE INDEX IF NOT EXISTS idx_narrative_segments_tick 
    ON narrative_segments(tick_id);

-- Index for building transcript (by branch)
CREATE INDEX IF NOT EXISTS idx_narrative_segments_branch 
    ON narrative_segments(tick_id);

-- Register this agent's settings schema
INSERT INTO agent_registry (agent_id, display_name, description, phase, settings_schema)
VALUES (
    'narrator',
    'Story Narrator',
    'Generates narrative text describing events and outcomes',
    1,
    '{
        "parameters": [
            {
                "id": "verbosity",
                "type": "enum",
                "options": ["brief", "normal", "elaborate"],
                "default": "normal",
                "label": "Narrative Length",
                "description": "How detailed the narrative descriptions should be",
                "ui_component": "dropdown"
            },
            {
                "id": "tone",
                "type": "enum",
                "options": ["gritty", "neutral", "heroic", "comedic", "dark"],
                "default": "neutral",
                "label": "Narrative Tone",
                "description": "The overall mood and style of narration",
                "ui_component": "dropdown"
            },
            {
                "id": "include_internal_thoughts",
                "type": "boolean",
                "default": true,
                "label": "Include Character Thoughts",
                "description": "Whether to narrate the player character internal thoughts",
                "ui_component": "toggle"
            },
            {
                "id": "context_paragraphs",
                "type": "integer",
                "min": 1,
                "max": 10,
                "default": 3,
                "step": 1,
                "label": "Context Length",
                "description": "How many previous paragraphs to include for context",
                "ui_component": "slider"
            }
        ]
    }'::jsonb
)
ON CONFLICT (agent_id) DO UPDATE SET
    settings_schema = EXCLUDED.settings_schema,
    display_name = EXCLUDED.display_name;

-- ============================================
-- End Agent: Narrator
-- ============================================

