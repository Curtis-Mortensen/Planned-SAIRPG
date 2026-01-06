# SAIRPG UI Update: Always Collapsed Sidebar with Hover Text

## Task
Update the far left sidebar to be always collapsed and display text on hover to explain what icons do.

## Steps
- [x] Analyze current sidebar implementation
- [x] Identify navigation components that need modification
- [x] Update sidebar to be always collapsed (48px width)
- [x] Add hover-tooltip functionality to show icon labels
- [ ] Test the implementation
- [ ] Verify the changes work as expected

## Notes
- Current spec mentions optional hover-to-expand behavior
- User wants always collapsed with text on hover instead
- Target width: 48px (collapsed state)
- Icons should have hover tooltips showing their labels/descriptions

## Implementation Details
- Updated `lib/stores/game-store.ts` to set `sidebarExpanded: false` as default
- The existing `NavItem` component already has tooltip functionality that shows when sidebar is collapsed
- Navigation items include "Play" and "World Editor" with their respective descriptions
