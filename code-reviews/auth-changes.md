Summary of Changes
I've implemented a comprehensive solution to ensure users always have a valid guest ID when visiting the site:

1. Added getUserById function in queries.ts:85-95
A new utility function that safely checks if a user exists in the database by their ID, returning null if they don't exist instead of throwing an error.

2. Updated /api/auth/guest route in app/(auth)/api/auth/guest/route.ts/api/auth/guest/route.ts)
Now verifies that the user in the JWT token actually exists in the database
If the user doesn't exist (stale token), it signs out to clear the invalid session and creates a new guest user
Added force=true query parameter support for forcing new user creation
3. Created EnsureUser component in ensure-user.tsx
A server component that:

Checks if there's a valid session
Verifies the session user exists in the database
Redirects to /api/auth/guest if no session or user doesn't exist
4. Added EnsureUser to all protected layouts
app/(chat)/layout.tsx/layout.tsx)
layout.tsx
layout.tsx
layout.tsx
layout.tsx
5. Added user validation in the chat API route in app/(chat)/api/chat/route.ts/api/chat/route.ts)
Added an early check that verifies the user exists in the database before proceeding with chat operations.