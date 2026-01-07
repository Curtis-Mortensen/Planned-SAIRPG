All changes are complete. Here's what I've implemented to ensure "New Game" creates a truly fresh slate:
Summary of Changes
1. /app/play/page.tsx
Added ?new=true query param support to force new game creation
Bypasses the last-play-id cookie when ?new=true is present
2. /components/new-game-button.tsx (NEW)
Created a reusable client component for starting new games
Clears localStorage "input" cache (removes any typed text)
Clears last-play-id cookie
Navigates to /play?new=true
3. /app/page.tsx (Landing page)
Now uses NewGameButton component instead of a Link
"Start a New Game" button clears all cached state before navigation
4. /components/chat-header.tsx
"New Game" button now always visible (removed sidebar/mobile conditional)
Clears localStorage and cookie before navigation
Links to /play?new=true
5. /components/app-sidebar.tsx
Updated sidebar button to also clear cached state
Renamed tooltip from "New Chat" to "New Game"
6. /components/suggested-actions.tsx
Fixed URL path - now detects if we're in /play or /chat context
Uses correct base path for history state updates
7. /components/multimodal-input.tsx
Same fix as suggested-actions - uses correct base path based on current URL
What Gets Cleared on "New Game"
localStorage "input" - Any partially typed message
last-play-id cookie - Previous game session reference
New UUID generated - Fresh game ID
Opening scene rendered - With fresh suggestions displayed
This gives you a completely fresh state to test the opening prompt and suggestions logic every time you click "New Game".