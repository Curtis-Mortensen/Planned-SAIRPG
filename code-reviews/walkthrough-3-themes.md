File: 
components/play/context-panel.tsx

Added controls (colored dots) to the context panel header to switch between Default, Dark, and Blue modes.
Implemented state management to toggle these visual styles dynamically.
Verification Results
Manual Testing
 Settings Page Access: Verified that /settings loads the new profile card.
 Sidebar Icon: Confirmed the gear icon in the sidebar links to /settings.
 Dropdown Menu: Confirmed the "Settings" item in the user menu links to /settings.
 Context Modes:
Default: Standard light/sidebar theme.
Dark: Dark background (bg-neutral-900) with light text.
Blue: Blue background (bg-blue-600) with white text.