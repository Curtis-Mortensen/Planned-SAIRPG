# Game Files Architecture Refactor

## Overview

This document outlines the refactor from the current confusing save/branch system to a cleaner "Game Files" architecture where:

- **Game** = A top-level adventure/world (has its own chat and event log)
- **Save** = A snapshot within a game (copied chat + copied events)

## Current Problems

1. "Save" tries to be both a checkpoint AND a game entry point
2. Branching architecture is overcomplicated for our needs
3. No clear UI for managing multiple games/adventures
4. Confusing relationship between Chat, GameSession, and Saves

## IMPORTANT: Revert Previous Changes

**Before implementing this plan, the following changes must be reverted:**

These changes were made in an earlier attempt to fix save/load but are based on the old branching architecture and conflict with the new game-files approach:

1. **Schema changes** (`lib/db/schema.ts`):
   - Remove `chatId` column from `SaveSlot` table (will be added back in Phase 1.2 as part of new architecture)
   - Remove `messageCount` column from `SaveSlot` table (will be added back in Phase 1.2 as part of new architecture)
   - These were added in a previous fix using the old branching approach, so they need to be reverted now, but will be re-added properly in Phase 1.2

2. **Migration file** (`lib/db/migrations/0011_add_save_chatid.sql`):
   - Delete this migration file entirely
   - It adds columns that won't be used in the new system

3. **Query changes** (`lib/db/queries.ts`):
   - Revert `createSave()` function signature to original (remove `chatId?` and `messageCount?` parameters)

4. **Action changes** (`app/actions/saves.ts`):
   - Revert `saveGameAction()` to not store `chatId`/`messageCount`
   - Revert `loadSaveAction()` to original branching-based implementation
   - Remove imports: `getMessagesByChatId`, `saveChat`, `saveMessages`, `generateUUID`

5. **Component changes** (`components/play/load-confirm-dialog.tsx`):
   - Revert `handleLoad()` to not pass `currentChatId` parameter
   - Revert navigation logic to just `router.refresh()` instead of navigating to `newChatId`

**All of these have been reverted as of the creation of this document.**

## New Mental Model

```
Game (top-level container) 
├── chatId (the active conversation for this game)
├── Event Log entries (tied to this game)
└── Saves (snapshots within this game)
    ├── Save 1 → has its own chatId (copy) + eventLogId 
    ├── Save 2 → has its own chatId (copy) + eventLogId
    └── ...
```

---

## Phase 1: Schema Changes

### 1.1 Rename/Repurpose GameSession → Game

The existing `GameSession` table becomes our "Game" concept. Update the name for clarity.

**File:** `lib/db/schema.ts`

Rename `gameSession` table to `game` (or keep as `gameSession` but treat it as "Game" conceptually).

Add/ensure these fields exist:
```
Game:
  - id (uuid, pk)
  - userId (uuid, fk to User)
  - title (text) - Display name like "Dark Forest Adventure"
  - chatId (uuid, fk to Chat) - The ACTIVE chat for this game
  - isActive (boolean) - Is this the currently selected game?
  - createdAt, updatedAt (timestamps)
```

Remove from GameSession (no longer needed):
- `branchId` - Remove branching concept
- `parentBranchId` - Remove branching concept  
- `activeBranchId` - Remove branching concept
- `worldId` - Not used currently

### 1.2 Simplify SaveSlot

**File:** `lib/db/schema.ts`

SaveSlot should store a COMPLETE snapshot:
```
SaveSlot:
  - id (uuid, pk)
  - gameId (uuid, fk to Game) - Which game this save belongs to
  - chatId (uuid, fk to Chat) - The COPIED chat with messages at save time
  - name (varchar) - User-provided name like "Before Boss Fight"
  - turnNumber (text) - Turn number at save time
  - messageCount (text) - Number of messages at save time
  - description (text, optional)
  - createdAt (timestamp)
```

Remove from SaveSlot:
- `sessionId` - Rename to `gameId`
- `branchId` - Remove branching concept
- `thumbnailEventId` - Not needed with new approach

### 1.3 Simplify EventLog

**File:** `lib/db/schema.ts`

EventLog entries are tied to a Game (not branches):
```
EventLog:
  - id (uuid, pk)
  - gameId (uuid, fk to Game) - Which game this event belongs to
  - saveId (uuid, fk to SaveSlot, nullable) - If this is a copied event for a save
  - sequenceNum (text)
  - eventType (varchar)
  - moduleName (varchar)
  - actor (varchar)
  - payload (json)
  - cost (text)
  - createdAt (timestamp)
```

Remove from EventLog:
- `sessionId` - Rename to `gameId`
- `branchId` - Remove branching concept
- `turnId` - Not used
- `parentEventId` - Not needed without branching
- `validFromBranch` - Remove branching concept
- `invalidatedAtBranch` - Remove branching concept

### 1.4 Remove Branch Table

**File:** `lib/db/schema.ts`

Delete the entire `branch` table and its type export. Branching is no longer used.

### 1.5 Create Migration

**File:** `lib/db/migrations/0012_game_files_refactor.sql`

```sql
-- Rename sessionId to gameId in SaveSlot
ALTER TABLE "SaveSlot" RENAME COLUMN "sessionId" TO "gameId";

-- Remove branch-related columns from SaveSlot
ALTER TABLE "SaveSlot" DROP COLUMN IF EXISTS "branchId";
ALTER TABLE "SaveSlot" DROP COLUMN IF EXISTS "thumbnailEventId";

-- Rename sessionId to gameId in EventLog
ALTER TABLE "EventLog" RENAME COLUMN "sessionId" TO "gameId";

-- Add saveId to EventLog for save snapshots
ALTER TABLE "EventLog" ADD COLUMN IF NOT EXISTS "saveId" uuid REFERENCES "SaveSlot"("id") ON DELETE CASCADE;

-- Remove branch-related columns from EventLog
ALTER TABLE "EventLog" DROP COLUMN IF EXISTS "branchId";
ALTER TABLE "EventLog" DROP COLUMN IF EXISTS "turnId";
ALTER TABLE "EventLog" DROP COLUMN IF EXISTS "parentEventId";
ALTER TABLE "EventLog" DROP COLUMN IF EXISTS "validFromBranch";
ALTER TABLE "EventLog" DROP COLUMN IF EXISTS "invalidatedAtBranch";

-- Remove branch-related columns from GameSession
ALTER TABLE "GameSession" DROP COLUMN IF EXISTS "branchId";
ALTER TABLE "GameSession" DROP COLUMN IF EXISTS "parentBranchId";
ALTER TABLE "GameSession" DROP COLUMN IF EXISTS "activeBranchId";
ALTER TABLE "GameSession" DROP COLUMN IF EXISTS "worldId";
ALTER TABLE "GameSession" DROP COLUMN IF EXISTS "currentTurnId";
ALTER TABLE "GameSession" DROP COLUMN IF EXISTS "currentTurnNumber";

-- Add chatId to GameSession (the active chat for this game)
ALTER TABLE "GameSession" ADD COLUMN IF NOT EXISTS "chatId" uuid REFERENCES "Chat"("id") ON DELETE SET NULL;

-- Drop Branch table
DROP TABLE IF EXISTS "Branch";

-- Drop Turn table (not used with simplified model)
DROP TABLE IF EXISTS "Turn";
```

---

## Phase 2: Query Updates

### 2.1 Update Game Queries

**File:** `lib/db/queries.ts`

Replace/update these functions:

#### `getGames(userId)` (was `getGameSessions`)
- Returns all games for a user
- Order by `updatedAt` desc

#### `getGameById(gameId)`
- Returns a single game by ID

#### `createGame({ userId, title, chatId })`
- Creates a new game with an associated chat
- Sets `isActive = true`
- Sets all other user's games to `isActive = false`

#### `setActiveGame({ userId, gameId })`
- Sets `isActive = true` for the specified game
- Sets `isActive = false` for all other user's games

#### `updateGame({ gameId, title?, chatId? })`
- Updates game fields

#### `deleteGame(gameId)`
- Deletes game and cascades to saves and events

### 2.2 Update Save Queries

**File:** `lib/db/queries.ts`

#### `getSavesByGame(gameId)` (was `getSavesBySession`)
- Returns all saves for a game
- Order by `createdAt` desc

#### `createSave({ gameId, chatId, name, turnNumber, messageCount })`
- Creates a save with the COPIED chatId
- Does NOT use branching

#### `getSaveById(saveId)`
- Returns a single save

#### `deleteSave(saveId)`
- Deletes save (events cascade)

### 2.3 Update Event Log Queries

**File:** `lib/db/queries.ts`

#### `getEventsByGame({ gameId, limit?, offset? })`
- Returns events for the current game (where `saveId IS NULL`)
- These are the "live" events

#### `getEventsBySave({ saveId, limit?, offset? })`
- Returns events that belong to a specific save snapshot

#### `createEvent({ gameId, saveId?, eventType, payload, ... })`
- Creates an event
- If `saveId` is provided, it's a copied event for a save

#### `copyEventsToSave({ gameId, saveId })`
- Copies all current events (where `saveId IS NULL`) to a new save
- Sets the `saveId` on the copies

### 2.4 Remove Branch Queries

**File:** `lib/db/queries.ts`

Delete these functions entirely:
- `createBranchFromSave`
- `setActiveBranch`
- `ensureBranchExists`
- `getBranchesBySession`
- Any other branch-related functions

---

## Phase 3: Action Updates

### 3.1 Update Save Actions

**File:** `app/actions/saves.ts`

#### `saveGameAction({ gameId, chatId, name? })`

New flow:
1. Get current game by ID
2. Get message count from current chatId
3. Create a NEW chat (copy messages from current chat)
4. Copy events to the new save
5. Create SaveSlot with the copied chatId

```typescript
// Pseudocode
const messageCount = await getMessageCount(chatId);
const messages = await getMessagesByChatId(chatId);

// Create copied chat
const copiedChatId = generateUUID();
await saveChat({ id: copiedChatId, userId, title: `Save: ${name}`, visibility: 'private' });
await saveMessages({ messages: messages.map(m => ({ ...m, id: generateUUID(), chatId: copiedChatId })) });

// Create save
const save = await createSave({ gameId, chatId: copiedChatId, name, turnNumber, messageCount });

// Copy events
await copyEventsToSave({ gameId, saveId: save.id });
```

#### `loadSaveAction({ saveId })`

New flow:
1. Get save by ID
2. Get the save's chatId (already a copy)
3. Create a NEW chat copying from save's chat
4. Update game's chatId to the new chat
5. Return new chatId for navigation

```typescript
// Pseudocode
const save = await getSaveById(saveId);
const saveMessages = await getMessagesByChatId(save.chatId);

// Create new chat from save
const newChatId = generateUUID();
await saveChat({ id: newChatId, userId, title: game.title, visibility: 'private' });
await saveMessages({ messages: saveMessages.map(m => ({ ...m, id: generateUUID(), chatId: newChatId })) });

// Update game to use new chat
await updateGame({ gameId: save.gameId, chatId: newChatId });

return { success: true, newChatId };
```

### 3.2 Create Game Actions

**File:** `app/actions/games.ts` (NEW FILE)

#### `getGamesAction()`
- Returns all games for current user

#### `createGameAction({ title })`
- Creates new game
- Creates new chat for the game
- Sets as active game
- Returns game and chatId

#### `loadGameAction({ gameId })`
- Sets game as active
- Returns game's chatId for navigation

#### `deleteGameAction({ gameId })`
- Deletes game and all associated data

#### `renameGameAction({ gameId, title })`
- Updates game title

---

## Phase 4: UI Components

### 4.1 Games View Component

**File:** `components/play/games-view.tsx` (NEW FILE)

Similar structure to `saves-view.tsx` but for games:

```typescript
interface GamesViewProps {
  currentGameId?: string;
}

export function GamesView({ currentGameId }: GamesViewProps) {
  // Fetch games list
  // Display as list with:
  //   - Game title
  //   - Last played date
  //   - Number of saves
  //   - Load button
  //   - Delete button (with confirmation)
  // Highlight current game
}
```

Features:
- List all games for user
- Click game to load it (navigates to `/play/{chatId}`)
- Delete game (with confirmation dialog)
- Rename game (inline edit or dialog)
- Show which game is currently active

### 4.2 Update Context Panel

**File:** `components/play/context-panel.tsx`

Add "Games" as a new tab option alongside Stats, Saves, Log.

Tab order: `Stats | Saves | Games | Log`

When Games tab is selected, render `<GamesView />`.

### 4.3 Update Game Store

**File:** `lib/stores/game-store.ts`

Add state for:
```typescript
interface GameStore {
  // ... existing state
  
  // Games view state
  currentGameId: string | null;
  setCurrentGameId: (id: string | null) => void;
  
  // Context panel active tab
  activeContextTab: 'stats' | 'saves' | 'games' | 'log';
  setActiveContextTab: (tab: string) => void;
}
```

### 4.4 Update Nav Sidebar

**File:** `components/layout/nav-sidebar.tsx`

Add a "Games" icon to the icon sidebar:
- Icon: Globe/World icon (use `Globe` from lucide-react)
- Position: Below Play icon, above Editor icon
- On click: Navigate to `/play` and open Games tab in context panel

### 4.5 Update New Game Button

**File:** `components/new-game-button.tsx`

Change behavior:
- Icon: Globe/World icon instead of Plus
- On click: 
  1. Create new game via `createGameAction`
  2. Navigate to `/play/{newChatId}`
  3. Open context panel to Games tab (optional)

### 4.6 Update Load Confirm Dialog

**File:** `components/play/load-confirm-dialog.tsx`

Simplify since we no longer have branching:
- Remove "Save & Load" option (saves are snapshots, loading doesn't destroy current)
- Just "Load" and "Cancel"
- Load always creates new chat from save

Actually, keep "Save current first?" option but simplify the flow:
1. If user wants to save current: call `saveGameAction` first
2. Then call `loadSaveAction`
3. Navigate to new chatId

---

## Phase 5: Page Updates

### 5.1 Play Page

**File:** `app/play/[id]/page.tsx`

Update to:
1. Load game by finding which game has this chatId
2. Pass gameId to child components
3. Ensure correct game is set as active

### 5.2 Play Layout

**File:** `app/play/layout.tsx`

Ensure context panel has access to current gameId.

---

## Phase 6: Event Logging Updates

### 6.1 Update Chat Route

**File:** `app/(chat)/api/chat/route.ts`

Update event logging to use `gameId` instead of `sessionId` and `branchId`:

```typescript
// Find or create game for this chat
const game = await getGameByChatId(chatId) || await getActiveGame(userId);

await createEvent({
  gameId: game.id,
  eventType: "player_action",
  // ... rest
});
```

### 6.2 Update Event Log Viewer

**File:** `components/log/event-log-viewer.tsx`

Update to:
- Accept `gameId` prop instead of sessionId/branchId
- Query events by gameId
- When viewing a save's log, query by saveId

---

## Implementation Order

1. **Phase 1**: Schema changes + migration (creates the structure)
2. **Phase 2**: Query updates (makes data accessible)
3. **Phase 3**: Action updates (makes operations work)
4. **Phase 4**: UI components (makes it usable)
5. **Phase 5**: Page updates (integrates everything)
6. **Phase 6**: Event logging (ensures logging works)

## Testing Checklist

After implementation, verify:

- [ ] Can create a new game
- [ ] New game has its own chat
- [ ] Can see list of all games
- [ ] Can switch between games
- [ ] Can save current game state
- [ ] Save creates copied chat with messages
- [ ] Save creates copied events
- [ ] Can load a save
- [ ] Loading save creates new chat
- [ ] Loading save navigates to new chat
- [ ] Event log shows events for current game
- [ ] Event log for a save shows only that save's events
- [ ] Can delete a game
- [ ] Can delete a save
- [ ] Can rename a game

## Notes for Implementer

1. **Remove all branching logic** - Search codebase for "branch" and remove/update all references
2. **Keep migrations backward compatible** - Old data should still work after migration
3. **Test with existing data** - Ensure existing saves/games don't break
4. **Update imports** - After renaming functions, update all import statements
5. **Check TypeScript types** - Run `pnpm typecheck` after changes
6. **Run linter** - Run `pnpm lint` to catch issues

