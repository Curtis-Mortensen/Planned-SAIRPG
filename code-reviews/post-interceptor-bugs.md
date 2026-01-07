Files fixed:

app/(chat)/api/chat/route.ts/api/chat/route.ts) - Fixed settings access and message type issues
app/play/[id]/page.tsx - Fixed settings access and missing variable declaration
app/api/game/[gameId]/phase/route.ts - Fixed params Promise type for Next.js 16
app/api/meta-events/[pendingActionId]/route.ts - Fixed params Promise type
app/(chat)/api/event-log/seed/route.ts/api/event-log/seed/route.ts) - Removed reference to non-existent branchId
schema.ts - Fixed drizzle index configuration syntax
message.tsx - Fixed system role comparison
meta-event-review.tsx - Fixed toast API usage
Removed empty /app/log directory that was causing route type errors

Summary
I've created the database-calls.md documentation and fixed the bug.

The Bug
When the database is reset (e.g., docker compose down -v), the browser retains a JWT session cookie with an old user ID that no longer exists in the database. The createGameAction would try to create a chat for this non-existent user, causing saveChat to throw an error.

The Fix
I added user existence verification before any database write operations:

games.ts:76-82 - createGameAction now calls getUserById() to verify the user exists in the database before attempting to create a chat/game. If the user doesn't exist, it returns "Unauthorized" which triggers the guest authentication flow.

app/play/[id]/page.tsx#L40-L44 - The play page now also verifies user existence and redirects to /api/auth/guest?force=true if the user doesn't exist.

How it works now
User clicks "Start a New Game"
createGameAction is called
Session is validated via auth()
User existence is verified via getUserById(session.user.id)
If user doesn't exist → return { error: "Unauthorized" }
NewGameButton sees "Unauthorized" → redirects to /api/auth/guest
Guest endpoint creates a new user and session
User is redirected back to start a new game with valid credentials