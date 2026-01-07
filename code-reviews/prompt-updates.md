Summary of Changes
YAML configuration — Removed decorative bars (═══════════) and simplified formatting.
Challenge scale — Updated from 1-6 to 1-5:
Removed value 6 ("brutal" moved to 5)
Updated getChallengeLabel() and getChallengeDescription()
Updated YAML config comments
Base prompt — Simplified:
Removed system signals section
Removed duplicate personality guidance (already in YAML)
Removed {{LORE_FILE}} reference
Focused on core narrative responsibilities
Lore file handling — Changed from system prompt injection to appending to the first player action:
Lore is appended to the first user message with a separator (---)
Removed lore injection from buildNarratorSystemPrompt()
System message framework — Added:
System messages display as centered boxes (distinct from AI/user messages)
"World Lore Loaded" notification appears before the opening scene
System messages are saved to the database with proper ordering
Message component updated to render system messages as boxes
Message ordering — Ensured:
System message appears first (before opening scene)
Opening scene appears second
User message appears last
All changes are complete and linting passes. The system now supports system messages displayed as boxes, and the lore file is appended to the player's first action rather than being injected into the system prompt.