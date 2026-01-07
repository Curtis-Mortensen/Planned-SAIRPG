# SAIRPG Database Architecture Documentation

## Overview

SAIRPG uses PostgreSQL as its database with Drizzle ORM for schema management and queries. The database is containerized via Docker and accessed through the `POSTGRES_URL` environment variable.

## Database Tables (16 Total)

### Core Tables

| Table | Description | Row Count* |
|-------|-------------|------------|
| `User` | User accounts (guest and registered) | Variable |
| `Chat` | Chat sessions | Variable |
| `Message_v2` | Chat messages (current schema) | Variable |
| `Message` | Chat messages (deprecated) | Variable |
| `Vote_v2` | Message votes (current schema) | Variable |
| `Vote` | Message votes (deprecated) | Variable |
| `Document` | Generated documents/artifacts | Variable |
| `Suggestion` | Document suggestions | Variable |
| `Stream` | Active stream tracking | Variable |

### SAIRPG-Specific Tables

| Table | Description | Row Count* |
|-------|-------------|------------|
| `GameSession` | Game instances per user | Variable |
| `EventLog` | Append-only game event log | Variable |
| `SaveSlot` | Save game snapshots | Variable |
| `Prompt` | Versioned prompts for modules | Variable |
| `Artifact` | AI call logs for debugging | Variable |
| `PendingAction` | In-progress game actions | Variable |
| `MetaEvent` | Meta-event proposals and state | Variable |

*Row counts vary based on usage. Check current counts with:
```sql
SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY relname;
```

## Database Connection

The database connection is established in [lib/db/queries.ts](../lib/db/queries.ts):

```typescript
const client = postgres(process.env.POSTGRES_URL!);
const db = drizzle(client);
```

**Important:** This creates a single connection pool at module load time.

## Schema Definition

Schema is defined in [lib/db/schema.ts](../lib/db/schema.ts). Key relationships:

```
User (1) ────< Chat (many)
User (1) ────< GameSession (many)
User (1) ────< Document (many)

Chat (1) ────< Message_v2 (many)
Chat (1) ────< Vote_v2 (many)
Chat (1) ────< Stream (many)

GameSession (1) ────< EventLog (many)
GameSession (1) ────< SaveSlot (many)
GameSession (1) ────< PendingAction (many)

PendingAction (1) ────< MetaEvent (many)
SaveSlot (1) ────< EventLog (many, for snapshots)
```

## Database Operations

### User Operations

| Function | Operation | Location |
|----------|-----------|----------|
| `getUser(email)` | SELECT | [queries.ts#L52](../lib/db/queries.ts#L52) |
| `getUserById(id)` | SELECT | [queries.ts#L85](../lib/db/queries.ts#L85) |
| `createUser(email, password)` | INSERT | [queries.ts#L65](../lib/db/queries.ts#L65) |
| `createGuestUser()` | INSERT | [queries.ts#L78](../lib/db/queries.ts#L78) |

### Chat Operations

| Function | Operation | Location |
|----------|-----------|----------|
| `saveChat({id, userId, title, visibility})` | INSERT | [queries.ts#L98](../lib/db/queries.ts#L98) |
| `getChatById({id})` | SELECT | [queries.ts#L279](../lib/db/queries.ts#L279) |
| `getChatsByUserId({id, limit, ...})` | SELECT | [queries.ts#L212](../lib/db/queries.ts#L212) |
| `deleteChatById({id})` | DELETE | [queries.ts#L143](../lib/db/queries.ts#L143) |
| `deleteAllChatsByUserId({userId})` | DELETE | [queries.ts#L160](../lib/db/queries.ts#L160) |
| `updateChatTitleById({chatId, title})` | UPDATE | [queries.ts#L578](../lib/db/queries.ts#L578) |
| `updateChatVisibilityById({chatId, visibility})` | UPDATE | [queries.ts#L565](../lib/db/queries.ts#L565) |

### Message Operations

| Function | Operation | Location |
|----------|-----------|----------|
| `saveMessages({messages})` | INSERT | [queries.ts#L295](../lib/db/queries.ts#L295) |
| `getMessagesByChatId({id})` | SELECT | [queries.ts#L317](../lib/db/queries.ts#L317) |
| `getMessageById({id})` | SELECT | [queries.ts#L505](../lib/db/queries.ts#L505) |
| `updateMessage({id, parts})` | UPDATE | [queries.ts#L307](../lib/db/queries.ts#L307) |
| `deleteMessagesByChatIdAfterTimestamp({chatId, timestamp})` | DELETE | [queries.ts#L516](../lib/db/queries.ts#L516) |
| `getMessageCountByUserId({id, differenceInHours})` | SELECT + COUNT | [queries.ts#L595](../lib/db/queries.ts#L595) |

### Game Session Operations

| Function | Operation | Location |
|----------|-----------|----------|
| `getGames({userId})` | SELECT | [queries.ts#L899](../lib/db/queries.ts#L899) |
| `createGame({userId, title, chatId})` | INSERT | [queries.ts#L918](../lib/db/queries.ts#L918) |
| `getGameById(gameId)` | SELECT | [queries.ts#L1002](../lib/db/queries.ts#L1002) |
| `getGameByChatId(chatId)` | SELECT | [queries.ts#L984](../lib/db/queries.ts#L984) |
| `getActiveGame(userId)` | SELECT | [queries.ts#L1019](../lib/db/queries.ts#L1019) |
| `setActiveGame({userId, gameId})` | UPDATE | [queries.ts#L1035](../lib/db/queries.ts#L1035) |
| `updateGame({gameId, title, chatId})` | UPDATE | [queries.ts#L1058](../lib/db/queries.ts#L1058) |
| `deleteGame(gameId)` | DELETE | [queries.ts#L1092](../lib/db/queries.ts#L1092) |
| `getOrCreateActiveGame(userId)` | SELECT + INSERT | [queries.ts#L1109](../lib/db/queries.ts#L1109) |

### Event Log Operations

| Function | Operation | Location |
|----------|-----------|----------|
| `getEventsByGame({gameId, ...})` | SELECT | [queries.ts#L666](../lib/db/queries.ts#L666) |
| `getEventsBySave({saveId, ...})` | SELECT | [queries.ts#L700](../lib/db/queries.ts#L700) |
| `createEvent({gameId, ...})` | INSERT | [queries.ts#L814](../lib/db/queries.ts#L814) |
| `getEventLogCount({gameId, saveId})` | SELECT + COUNT | [queries.ts#L789](../lib/db/queries.ts#L789) |
| `getChatCost(chatId)` | SELECT + SUM | [queries.ts#L762](../lib/db/queries.ts#L762) |

### Save Slot Operations

| Function | Operation | Location |
|----------|-----------|----------|
| `getSavesByGame(gameId)` | SELECT | [queries.ts#L1131](../lib/db/queries.ts#L1131) |
| `getSaveCountsByGameIds(gameIds)` | SELECT + COUNT + GROUP BY | [queries.ts#L1149](../lib/db/queries.ts#L1149) |
| `createSave({gameId, ...})` | INSERT | [queries.ts#L1181](../lib/db/queries.ts#L1181) |
| `getSaveById(saveId)` | SELECT | [queries.ts#L1254](../lib/db/queries.ts#L1254) |
| `updateSave({saveId, ...})` | UPDATE | [queries.ts#L1268](../lib/db/queries.ts#L1268) |
| `deleteSave(saveId)` | DELETE | [queries.ts#L1243](../lib/db/queries.ts#L1243) |
| `copyEventsToSave({gameId, saveId})` | SELECT + INSERT | [queries.ts#L1206](../lib/db/queries.ts#L1206) |

### Pending Action Operations

| Function | Operation | Location |
|----------|-----------|----------|
| `getActivePendingAction(gameId)` | SELECT | [queries.ts#L1479](../lib/db/queries.ts#L1479) |
| `getPendingActionById(id)` | SELECT | [queries.ts#L1495](../lib/db/queries.ts#L1495) |
| `createPendingAction({gameId, ...})` | INSERT | [queries.ts#L1508](../lib/db/queries.ts#L1508) |
| `updatePendingAction(id, data)` | UPDATE | [queries.ts#L1535](../lib/db/queries.ts#L1535) |
| `updatePendingActionPhase(id, phase)` | UPDATE | [queries.ts#L1553](../lib/db/queries.ts#L1553) |
| `completePendingAction(id)` | UPDATE | [queries.ts#L1561](../lib/db/queries.ts#L1561) |
| `getCurrentGamePhase(gameId)` | SELECT | [queries.ts#L1577](../lib/db/queries.ts#L1577) |

### Meta Event Operations

| Function | Operation | Location |
|----------|-----------|----------|
| `getMetaEventsByPendingAction(pendingActionId)` | SELECT | [queries.ts#L1588](../lib/db/queries.ts#L1588) |
| `getTriggeredUnresolvedEvents(pendingActionId)` | SELECT | [queries.ts#L1600](../lib/db/queries.ts#L1600) |
| `getNextUnresolvedEvent(pendingActionId)` | SELECT | [queries.ts#L1618](../lib/db/queries.ts#L1618) |
| `createMetaEvent({pendingActionId, ...})` | INSERT | [queries.ts#L1636](../lib/db/queries.ts#L1636) |
| `updateMetaEventDecision(id, playerDecision)` | UPDATE | [queries.ts#L1666](../lib/db/queries.ts#L1666) |
| `updateMetaEventRoll(id, rollResult, triggered)` | UPDATE | [queries.ts#L1678](../lib/db/queries.ts#L1678) |
| `resolveMetaEvent(id)` | UPDATE | [queries.ts#L1690](../lib/db/queries.ts#L1690) |
| `deleteMetaEventsByPendingAction(pendingActionId)` | DELETE | [queries.ts#L1702](../lib/db/queries.ts#L1702) |

### Prompt Operations

| Function | Operation | Location |
|----------|-----------|----------|
| `getPromptByModule(moduleName, name)` | SELECT | [queries.ts#L1396](../lib/db/queries.ts#L1396) |
| `upsertPrompt({moduleName, ...})` | SELECT + INSERT/UPDATE | [queries.ts#L1420](../lib/db/queries.ts#L1420) |

### Document Operations

| Function | Operation | Location |
|----------|-----------|----------|
| `saveDocument({id, ...})` | INSERT | [queries.ts#L380](../lib/db/queries.ts#L380) |
| `getDocumentsById({id})` | SELECT | [queries.ts#L413](../lib/db/queries.ts#L413) |
| `getDocumentById({id})` | SELECT | [queries.ts#L429](../lib/db/queries.ts#L429) |
| `deleteDocumentsByIdAfterTimestamp({id, timestamp})` | DELETE | [queries.ts#L445](../lib/db/queries.ts#L445) |

### Vote Operations

| Function | Operation | Location |
|----------|-----------|----------|
| `voteMessage({chatId, messageId, type})` | INSERT/UPDATE | [queries.ts#L333](../lib/db/queries.ts#L333) |
| `getVotesByChatId({id})` | SELECT | [queries.ts#L359](../lib/db/queries.ts#L359) |

### Suggestion Operations

| Function | Operation | Location |
|----------|-----------|----------|
| `saveSuggestions({suggestions})` | INSERT | [queries.ts#L472](../lib/db/queries.ts#L472) |
| `getSuggestionsByDocumentId({documentId})` | SELECT | [queries.ts#L485](../lib/db/queries.ts#L485) |

### Stream Operations

| Function | Operation | Location |
|----------|-----------|----------|
| `createStreamId({streamId, chatId})` | INSERT | [queries.ts#L628](../lib/db/queries.ts#L628) |
| `getStreamIdsByChatId({chatId})` | SELECT | [queries.ts#L643](../lib/db/queries.ts#L643) |

## Data Flow for Common Operations

### Creating a New Game

1. **Authentication Check** (`auth()` from NextAuth)
2. **Create Chat** → `saveChat()` → Checks user exists first!
3. **Create Game** → `createGame()` → Also checks user exists
4. **Redirect to `/play/[chatId]`**

### Playing (Sending Messages)

1. **Load Chat** → `getChatById()`
2. **Load Game** → `getGameByChatId()` or create
3. **Load Messages** → `getMessagesByChatId()`
4. **Save User Message** → `saveMessages()`
5. **Create Stream** → `createStreamId()`
6. **Process AI Response** → Various operations
7. **Save AI Message** → `saveMessages()`

### Saving a Game

1. **Get Active Game** → `getActiveGame()`
2. **Create Save Slot** → `createSave()`
3. **Copy Events** → `copyEventsToSave()`

### Loading a Save

1. **Get Save** → `getSaveById()`
2. **Clone Chat** → Creates new chat with copied messages
3. **Update Game** → `updateGame()` with new chatId

## Known Issues

### User Session Mismatch (FIXED)

**Problem:** After a database reset (`docker compose down -v && docker compose up`), the browser retains a JWT session with an old user ID that no longer exists in the database.

**Symptoms:**
- "User with id XXX does not exist in database" error when creating a new game
- Error occurs at `saveChat()` which correctly validates user existence

**Root Cause:**
1. Database is reset (all tables empty)
2. Browser has stale JWT with old user ID
3. `auth()` returns session with that old ID
4. Server action tries to create chat for non-existent user
5. `saveChat()` throws `ChatSDKError("not_found:database")`

**Solution (Applied):**
The `createGameAction` in [app/actions/games.ts](../app/actions/games.ts) now checks if the user exists in the database using `getUserById()` before attempting any database operations. If the user doesn't exist, it returns "Unauthorized" which triggers the guest authentication flow that creates a new user.

```typescript
// In createGameAction:
const existingUser = await getUserById(session.user.id);
if (!existingUser) {
  return { success: false, error: "Unauthorized" };
}
```

The `NewGameButton` component then handles this by redirecting to `/api/auth/guest?redirectUrl=/play?new=true`.

### Connection Pool

The database uses a single connection pool created at module load. Under high load, this could become a bottleneck. Consider:
- Connection pool sizing for production
- Connection timeout handling
- Graceful degradation on connection failure

### Foreign Key Cascades

Several tables use `onDelete: "cascade"` which could cause cascading data loss:
- Deleting a `GameSession` deletes all related `EventLog`, `SaveSlot`, `PendingAction` entries
- Deleting a `Chat` deletes all related `Message_v2`, `Vote_v2`, `Stream` entries

## Debugging Commands

```bash
# Check table row counts
docker compose exec postgres psql -U postgres -d ai_chatbot -c "
SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY relname;"

# Check users
docker compose exec postgres psql -U postgres -d ai_chatbot -c 'SELECT id, email FROM "User";'

# Check games
docker compose exec postgres psql -U postgres -d ai_chatbot -c 'SELECT id, title, "isActive" FROM "GameSession";'

# Check chats
docker compose exec postgres psql -U postgres -d ai_chatbot -c 'SELECT id, title, "userId" FROM "Chat";'

# Re-push schema
pnpm db:push

# Reset database (destroys all data!)
docker compose down -v && docker compose up -d && pnpm db:push
```

## Authentication Flow

```
Browser Request
    │
    ▼
NextAuth JWT Validation
    │
    ├── No session ──────────> Redirect to /api/auth/guest
    │
    ├── Has session
    │       │
    │       ▼
    │   EnsureUser component (if present)
    │       │
    │       ├── User exists ────> Continue
    │       │
    │       └── User missing ───> Redirect to /api/auth/guest?force=true
    │
    ▼
Server Action / API Route
    │
    ▼
Database Query (validates user again in saveChat/createGame)
```
