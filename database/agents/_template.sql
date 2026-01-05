-- ============================================
-- Agent: [AGENT NAME]
-- Phase: [1/2/3]
-- Description: [What this agent does]
-- ============================================

-- ===========================================
-- TABLES
-- Tables this agent owns and is responsible for
-- ===========================================

-- CREATE TABLE IF NOT EXISTS [table_name] (
--     ...
-- );

-- ===========================================
-- INDEXES
-- Indexes needed for this agent's queries
-- ===========================================

-- CREATE INDEX IF NOT EXISTS idx_[name] 
--     ON [table]([columns]);

-- ===========================================
-- FUNCTIONS
-- Helper functions for this agent
-- ===========================================

-- CREATE OR REPLACE FUNCTION [function_name](...)
-- RETURNS ... AS $$
--     ...
-- $$ LANGUAGE SQL;

-- ===========================================
-- AGENT REGISTRATION
-- Register this agent with its settings schema
-- ===========================================

INSERT INTO agent_registry (agent_id, display_name, description, phase, settings_schema)
VALUES (
    '[agent_id]',
    '[Display Name]',
    '[Description]',
    [1/2/3],
    '{
        "parameters": [
            {
                "id": "[param_id]",
                "type": "[integer/float/boolean/enum]",
                "default": [default_value],
                "label": "[User Label]",
                "description": "[Help text]",
                "ui_component": "[slider/toggle/dropdown/text]"
            }
        ]
    }'::jsonb
)
ON CONFLICT (agent_id) DO UPDATE SET
    settings_schema = EXCLUDED.settings_schema,
    display_name = EXCLUDED.display_name;

-- ============================================
-- End Agent: [AGENT NAME]
-- ============================================

