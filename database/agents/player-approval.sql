-- ============================================
-- Agent: Player Approval
-- Phase: 2
-- Description: Gates event progression on player
--              approval/rejection of proposed events
-- ============================================

-- Note: This agent primarily uses the proposed_events table
-- from meta-event-generator, updating the status field.
-- It also tracks approval history for learning/analytics.

-- Approval decisions history
CREATE TABLE IF NOT EXISTS approval_decisions (
    decision_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tick_id UUID NOT NULL REFERENCES ticks(tick_id) ON DELETE CASCADE,
    proposal_id UUID NOT NULL REFERENCES proposed_events(proposal_id) ON DELETE CASCADE,
    
    -- The decision
    decision VARCHAR(50) NOT NULL,  -- approved, rejected, regenerated
    
    -- If rejected, why? (optional player input)
    rejection_reason TEXT,
    
    -- If regenerated, what was the new proposal?
    regenerated_to UUID REFERENCES proposed_events(proposal_id),
    
    -- Timing
    decision_time_ms INTEGER,  -- How long player took to decide
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Aggregate approval stats for tuning
CREATE TABLE IF NOT EXISTS approval_stats (
    stat_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
    
    -- Aggregated over time
    total_proposed INTEGER DEFAULT 0,
    total_approved INTEGER DEFAULT 0,
    total_rejected INTEGER DEFAULT 0,
    total_regenerated INTEGER DEFAULT 0,
    
    -- By category
    positive_approved INTEGER DEFAULT 0,
    positive_rejected INTEGER DEFAULT 0,
    negative_approved INTEGER DEFAULT 0,
    negative_rejected INTEGER DEFAULT 0,
    neutral_approved INTEGER DEFAULT 0,
    neutral_rejected INTEGER DEFAULT 0,
    
    -- For adaptive generation
    avg_decision_time_ms INTEGER,
    
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_stats_per_session UNIQUE(session_id)
);

-- Index for approval history
CREATE INDEX IF NOT EXISTS idx_approval_decisions_tick 
    ON approval_decisions(tick_id);

CREATE INDEX IF NOT EXISTS idx_approval_decisions_proposal 
    ON approval_decisions(proposal_id);

-- Function to record an approval decision and update stats
CREATE OR REPLACE FUNCTION record_approval_decision(
    p_tick_id UUID,
    p_proposal_id UUID,
    p_decision VARCHAR(50),
    p_rejection_reason TEXT DEFAULT NULL,
    p_decision_time_ms INTEGER DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_decision_id UUID;
    v_session_id UUID;
    v_category VARCHAR(50);
BEGIN
    -- Get session and category
    SELECT s.session_id, pe.category 
    INTO v_session_id, v_category
    FROM ticks t
    JOIN sessions s ON t.session_id = s.session_id
    JOIN proposed_events pe ON pe.proposal_id = p_proposal_id
    WHERE t.tick_id = p_tick_id;
    
    -- Record the decision
    INSERT INTO approval_decisions (tick_id, proposal_id, decision, rejection_reason, decision_time_ms)
    VALUES (p_tick_id, p_proposal_id, p_decision, p_rejection_reason, p_decision_time_ms)
    RETURNING decision_id INTO v_decision_id;
    
    -- Update the proposed_events status
    UPDATE proposed_events 
    SET status = p_decision
    WHERE proposal_id = p_proposal_id;
    
    -- Update stats
    INSERT INTO approval_stats (session_id, total_proposed)
    VALUES (v_session_id, 1)
    ON CONFLICT (session_id) DO UPDATE SET
        total_proposed = approval_stats.total_proposed + 1,
        total_approved = approval_stats.total_approved + CASE WHEN p_decision = 'approved' THEN 1 ELSE 0 END,
        total_rejected = approval_stats.total_rejected + CASE WHEN p_decision = 'rejected' THEN 1 ELSE 0 END,
        total_regenerated = approval_stats.total_regenerated + CASE WHEN p_decision = 'regenerated' THEN 1 ELSE 0 END,
        positive_approved = approval_stats.positive_approved + CASE WHEN p_decision = 'approved' AND v_category = 'positive' THEN 1 ELSE 0 END,
        positive_rejected = approval_stats.positive_rejected + CASE WHEN p_decision = 'rejected' AND v_category = 'positive' THEN 1 ELSE 0 END,
        negative_approved = approval_stats.negative_approved + CASE WHEN p_decision = 'approved' AND v_category = 'negative' THEN 1 ELSE 0 END,
        negative_rejected = approval_stats.negative_rejected + CASE WHEN p_decision = 'rejected' AND v_category = 'negative' THEN 1 ELSE 0 END,
        neutral_approved = approval_stats.neutral_approved + CASE WHEN p_decision = 'approved' AND v_category = 'neutral' THEN 1 ELSE 0 END,
        neutral_rejected = approval_stats.neutral_rejected + CASE WHEN p_decision = 'rejected' AND v_category = 'neutral' THEN 1 ELSE 0 END,
        updated_at = NOW();
    
    RETURN v_decision_id;
END;
$$ LANGUAGE plpgsql;

-- Register this agent's settings schema
INSERT INTO agent_registry (agent_id, display_name, description, phase, settings_schema)
VALUES (
    'player_approval',
    'Event Approval',
    'Allows player to approve or reject proposed world events',
    2,
    '{
        "parameters": [
            {
                "id": "auto_approve_positive",
                "type": "boolean",
                "default": false,
                "label": "Auto-Approve Positive Events",
                "description": "Automatically approve beneficial events without prompting",
                "ui_component": "toggle"
            },
            {
                "id": "skip_approval",
                "type": "boolean",
                "default": false,
                "label": "Skip Approval Step",
                "description": "Approve all events automatically (faster gameplay)",
                "ui_component": "toggle"
            },
            {
                "id": "show_probabilities",
                "type": "boolean",
                "default": true,
                "label": "Show Probabilities",
                "description": "Display event trigger probabilities during approval",
                "ui_component": "toggle"
            }
        ]
    }'::jsonb
)
ON CONFLICT (agent_id) DO UPDATE SET
    settings_schema = EXCLUDED.settings_schema,
    display_name = EXCLUDED.display_name;

-- ============================================
-- End Agent: Player Approval
-- ============================================

