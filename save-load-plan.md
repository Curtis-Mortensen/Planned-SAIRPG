# Save/Load System Implementation Plan

**Created**: January 7, 2026
**Status**: Planning Phase

---

## Overview

This document outlines the implementation plan for a comprehensive save/load system in SAIRPG. The system will:
- Transform the context panel into a multi-view panel (Stats, Saves)
- Add turn tracking to game sessions
- Implement branching-based save/load with confirmation dialogs
- Add new sidebar navigation icons

---

## 1. Database Schema Changes

### 1.1 New Tables

Add to `lib/db/schema.ts`:

```typescript
// Save slots for player saves
export const saveSlot = pgTable("SaveSlot", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  sessionId: uuid("sessionId")
    .notNull()
    .references(() => gameSession.id, { onDelete: "cascade" }),
  branchId: uuid("branchId")
    .notNull()
    .references(() => branch.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  turnNumber: text("turnNumber").notNull(),
  description: text("description"),
  thumbnailEventId: uuid("thumbnailEventId"), // Last event for preview
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

// Turns table for tracking turn boundaries
export const turn = pgTable("Turn", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  sessionId: uuid("sessionId")
    .notNull()
    .references(() => gameSession.id, { onDelete: "cascade" }),
  branchId: uuid("branchId").notNull(),
  turnNumber: text("turnNumber").notNull(),
  playerInput: text("playerInput"),
  narratorOutput: text("narratorOutput"),
  status: varchar("status", { enum: ["in_progress", "complete"] }).notNull().default("in_progress"),
  startEventId: uuid("startEventId"),
  endEventId: uuid("endEventId"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  completedAt: timestamp("completedAt"),
});
```

### 1.2 Modify GameSession Table

Add these columns to `gameSession`:

```typescript
activeBranchId: uuid("activeBranchId"), // Current active branch
currentTurnId: uuid("currentTurnId"),   // Current turn being played
currentTurnNumber: text("currentTurnNumber").notNull().default("0"),
```

### 1.3 Migration File

Create migration at `lib/db/migrations/XXXX_add_save_system.sql`:

```sql
-- Create Turn table
CREATE TABLE "Turn" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "sessionId" UUID NOT NULL REFERENCES "GameSession"("id") ON DELETE CASCADE,
  "branchId" UUID NOT NULL,
  "turnNumber" TEXT NOT NULL,
  "playerInput" TEXT,
  "narratorOutput" TEXT,
  "status" VARCHAR(20) NOT NULL DEFAULT 'in_progress',
  "startEventId" UUID,
  "endEventId" UUID,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "completedAt" TIMESTAMP
);

-- Create SaveSlot table
CREATE TABLE "SaveSlot" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "sessionId" UUID NOT NULL REFERENCES "GameSession"("id") ON DELETE CASCADE,
  "branchId" UUID NOT NULL REFERENCES "Branch"("id") ON DELETE CASCADE,
  "name" VARCHAR(255) NOT NULL,
  "turnNumber" TEXT NOT NULL,
  "description" TEXT,
  "thumbnailEventId" UUID,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Add columns to GameSession
ALTER TABLE "GameSession"
  ADD COLUMN "activeBranchId" UUID,
  ADD COLUMN "currentTurnId" UUID,
  ADD COLUMN "currentTurnNumber" TEXT NOT NULL DEFAULT '0';

-- Create indexes
CREATE INDEX "Turn_sessionId_idx" ON "Turn"("sessionId");
CREATE INDEX "Turn_branchId_idx" ON "Turn"("branchId");
CREATE INDEX "SaveSlot_sessionId_idx" ON "SaveSlot"("sessionId");
```

---

## 2. Database Queries

Add to `lib/db/queries.ts`:

### 2.1 Turn Queries

```typescript
// Get current turn number for a session
export async function getCurrentTurnNumber(sessionId: string): Promise<number>

// Create a new turn when player submits input
export async function createTurn(params: {
  sessionId: string;
  branchId: string;
  turnNumber: string;
  playerInput: string;
}): Promise<Turn>

// Complete a turn when narrator finishes
export async function completeTurn(params: {
  turnId: string;
  narratorOutput: string;
  endEventId?: string;
}): Promise<Turn>

// Get turn count by session (for stats display)
export async function getTurnCountBySession(sessionId: string): Promise<number>

// Get turns by session with pagination
export async function getTurnsBySession(params: {
  sessionId: string;
  branchId?: string;
  limit?: number;
  offset?: number;
}): Promise<Turn[]>
```

### 2.2 Save Slot Queries

```typescript
// Get all saves for a session
export async function getSavesBySession(sessionId: string): Promise<SaveSlot[]>

// Create a new save
export async function createSave(params: {
  sessionId: string;
  branchId: string;
  name: string;
  turnNumber: string;
  description?: string;
}): Promise<SaveSlot>

// Delete a save
export async function deleteSave(saveId: string): Promise<void>

// Get save by ID with related data
export async function getSaveById(saveId: string): Promise<SaveSlot | null>
```

### 2.3 Branch/Load Queries

```typescript
// Create a new branch from an existing one
export async function createBranchFromSave(params: {
  sessionId: string;
  parentBranchId: string;
  forkEventId?: string;
  name?: string;
}): Promise<Branch>

// Switch active branch for a session
export async function setActiveBranch(params: {
  sessionId: string;
  branchId: string;
}): Promise<void>

// Get branch with its turn history
export async function getBranchWithHistory(branchId: string): Promise<{
  branch: Branch;
  turns: Turn[];
}>
```

---

## 3. Server Actions

Create `app/actions/saves.ts`:

```typescript
"use server";

// Save current game
export async function saveGameAction(params: {
  sessionId: string;
  name?: string; // Optional - defaults to "Turn {N}"
}): Promise<{ success: boolean; save?: SaveSlot; error?: string }>

// Load a save (returns confirmation data, doesn't execute load)
export async function prepareSaveLoadAction(saveId: string): Promise<{
  save: SaveSlot;
  currentTurnNumber: number;
  willLoseProgress: boolean;
}>

// Execute the load (after confirmation)
export async function loadSaveAction(params: {
  saveId: string;
  saveCurrentFirst?: boolean; // If true, save current game before loading
  currentSaveName?: string;   // Name for current game save
}): Promise<{ success: boolean; newChatId?: string; error?: string }>

// Get saves list for session
export async function getSavesAction(sessionId: string): Promise<SaveSlot[]>

// Delete a save
export async function deleteSaveAction(saveId: string): Promise<{ success: boolean }>
```

Create `app/actions/turns.ts`:

```typescript
"use server";

// Get current session stats (turn count, cost, etc.)
export async function getSessionStatsAction(chatId: string): Promise<{
  turnNumber: number;
  totalCost: number;
  messageCount: number;
  lastActivity: Date;
}>
```

---

## 4. Zustand Store Updates

### 4.1 Update `lib/stores/game-store.ts`

Add new state for context panel views:

```typescript
export type ContextPanelView = "stats" | "saves";

interface GameState {
  // ... existing state ...
  
  // Context panel view management
  contextPanelView: ContextPanelView;
  setContextPanelView: (view: ContextPanelView) => void;
  
  // Save dialog state
  saveDialogOpen: boolean;
  setSaveDialogOpen: (open: boolean) => void;
  
  // Load confirmation dialog state
  loadConfirmDialogOpen: boolean;
  setLoadConfirmDialogOpen: (open: boolean) => void;
  pendingLoadSaveId: string | null;
  setPendingLoadSaveId: (id: string | null) => void;
}
```

Add persistence for new state:

```typescript
partialize: (state) => ({
  // ... existing ...
  contextPanelView: state.contextPanelView,
}),
```

---

## 5. Navigation Updates

### 5.1 Update Navigation Constants

Modify `lib/constants/navigation.ts`:

```typescript
import {
  Gamepad2,
  Settings2,
  Save,      // New icon for saves
  BarChart3, // New icon for stats
  type LucideIcon,
} from "lucide-react";

// Update ModuleId type to include new views
export type ModuleId = "play" | "editor";
export type ContextViewId = "stats" | "saves";

// Keep existing NAVIGATION_ITEMS as is

// Add new constant for context panel tabs
export const CONTEXT_PANEL_TABS = [
  {
    id: "stats" as const,
    icon: BarChart3,
    label: "Stats",
    testId: "context-stats",
    description: "View game statistics and costs",
  },
  {
    id: "saves" as const,
    icon: Save,
    label: "Saves",
    testId: "context-saves",
    description: "Manage save games",
  },
] as const;
```

---

## 6. Component Architecture

### 6.1 New Components to Create

```
components/play/
├── context-panel.tsx          # MODIFY - Add view switching
├── context-panel-toggle.tsx   # Keep as is
├── context-panel-tabs.tsx     # NEW - Tab bar for switching views
├── cost-stats.tsx             # RENAME to stats-view.tsx
├── stats-view.tsx             # NEW - Full stats including turns
├── saves-view.tsx             # NEW - Save list and management
├── save-dialog.tsx            # NEW - Save game modal
├── load-confirm-dialog.tsx    # NEW - Load confirmation modal
├── save-button.tsx            # NEW - Top-right save button
└── play-chat.tsx              # MODIFY - Add save button to header
```

### 6.2 Context Panel Structure

The context panel should switch views based on `contextPanelView` state:

```tsx
// context-panel.tsx structure
export function ContextPanel({ chatId, children }: ContextPanelProps) {
  const contextPanelView = useGameStore((s) => s.contextPanelView);
  
  return (
    <div className="flex flex-1 overflow-hidden">
      <aside className={cn("flex flex-col border-r", /* ... */)}>
        <ContextPanelHeader />
        <ContextPanelTabs />
        <div className="flex-1 overflow-y-auto">
          {contextPanelView === "stats" && <StatsView chatId={chatId} />}
          {contextPanelView === "saves" && <SavesView chatId={chatId} />}
        </div>
      </aside>
      <div className="flex flex-1 flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
}
```

### 6.3 Stats View (`stats-view.tsx`)

Display:
- **Current Turn**: Derived from counting player messages or from `Turn` table
- **Total Cost**: Already implemented, move from `cost-stats.tsx`
- **Messages**: Count of messages in session
- **Session Duration**: Time since session started
- **Current Branch**: Name of active branch

### 6.4 Saves View (`saves-view.tsx`)

Display:
- List of saves for current session, styled like chat history
- Each save shows: name, turn number, timestamp
- Click to load (triggers confirmation dialog)
- Delete button with confirmation
- Empty state when no saves

### 6.5 Save Dialog (`save-dialog.tsx`)

Triggered by save button:
- Input field for save name
- Default value: `"Turn {currentTurnNumber}"`
- Placeholder: `"Enter save name (optional)"`
- Save and Cancel buttons
- Shows current turn number in helper text

### 6.6 Load Confirmation Dialog (`load-confirm-dialog.tsx`)

Triggered when clicking a save:
- Title: "Load Save?"
- Message: "Loading '{saveName}' will lose current progress. Would you like to save first?"
- Three buttons:
  - "Save & Load" - Saves current, then loads
  - "Load Without Saving" - Just loads
  - "Cancel"

### 6.7 Save Button (`save-button.tsx`)

Location: Top-right of play chat header
- Icon: `Save` from lucide-react
- Tooltip: "Save Game"
- Opens save dialog when clicked

---

## 7. Chat Header Modifications

### 7.1 Update `chat-header.tsx`

Add save button to the header:

```tsx
import { SaveButton } from "@/components/play/save-button";

function PureChatHeader({ chatId, /* ... */ }) {
  return (
    <header className="sticky top-0 flex items-center gap-2 ...">
      <ContextPanelToggle />
      
      {/* Existing buttons */}
      
      {/* Add save button - only show on play pages */}
      {!isReadonly && <SaveButton chatId={chatId} />}
    </header>
  );
}
```

---

## 8. Turn Tracking Implementation

### 8.1 When to Create Turns

A new turn should be created when:
1. Player submits a message (role: "user")
2. The message is processed and a response begins

### 8.2 Where to Hook Turn Creation

Modify the chat submission flow in `app/(chat)/actions.ts`:

```typescript
// In the saveMessages or chat creation flow
// After saving a user message, increment turn count

export async function saveMessagesWithTurnTracking(params: {
  messages: DBMessage[];
  chatId: string;
  sessionId: string;
  branchId: string;
}) {
  // Save messages as normal
  await saveMessages({ messages: params.messages });
  
  // If there's a user message, create/update turn
  const userMessage = params.messages.find(m => m.role === "user");
  if (userMessage) {
    await createTurn({
      sessionId: params.sessionId,
      branchId: params.branchId,
      turnNumber: String(getCurrentTurnNumber(params.sessionId) + 1),
      playerInput: extractTextFromParts(userMessage.parts),
    });
  }
}
```

### 8.3 Alternative: Derive Turn Count from Messages

For simplicity, turn count can be derived:

```typescript
// In stats action
export async function getSessionStatsAction(chatId: string) {
  const messages = await getMessagesByChatId({ id: chatId });
  const turnNumber = messages.filter(m => m.role === "user").length;
  // ...
}
```

**Recommendation**: Use derived count for MVP, migrate to `Turn` table when implementing full branching features.

---

## 9. Branching Flow (Save/Load Logic)

### 9.1 Save Flow

```
1. User clicks Save button
2. Save dialog opens with default name "Turn {N}"
3. User optionally enters custom name
4. User clicks Save
5. System:
   a. Gets current branchId from session
   b. Gets current turnNumber
   c. Gets last eventId for reference
   d. Creates SaveSlot record
   e. Shows success toast
6. Dialog closes
```

### 9.2 Load Flow

```
1. User clicks a save in saves list
2. System calls prepareSaveLoadAction(saveId)
3. If willLoseProgress is true:
   a. Show confirmation dialog
   b. User chooses: Save & Load, Load, or Cancel
4. If user confirms load:
   a. If "Save & Load": create save for current state first
   b. Create new branch forked from save's branch
   c. Set session's activeBranchId to new branch
   d. Redirect to play page (refreshes messages from new branch)
5. UI updates to show loaded state
```

### 9.3 Branch-Based Message Loading

Modify `getMessagesByChatId` or create new query:

```typescript
export async function getMessagesForBranch(params: {
  chatId: string;
  branchId?: string; // If not provided, use session's activeBranchId
}): Promise<DBMessage[]>
```

**Important**: Messages need to be associated with branches. This may require:
- Adding `branchId` column to `Message_v2` table, OR
- Using the event log to reconstruct messages per branch

---

## 10. Implementation Order

### Phase 1: Stats View & Turn Tracking (Foundation)
1. Add derived turn counting (from messages)
2. Create `stats-view.tsx` with turn count, cost, messages
3. Create `context-panel-tabs.tsx`
4. Update `context-panel.tsx` to support tabs
5. Update game store with view state

### Phase 2: Save System (Core Feature)
1. Create database migration for `SaveSlot` table
2. Add save queries to `queries.ts`
3. Create save server actions
4. Create `save-button.tsx`
5. Create `save-dialog.tsx`
6. Add save button to chat header

### Phase 3: Load System (User Flow)
1. Create `saves-view.tsx` to display saves
2. Create `load-confirm-dialog.tsx`
3. Implement load server action
4. Wire up full load flow with confirmation

### Phase 4: Full Branching (Advanced)
1. Create `Turn` table and migration
2. Update message saving to track branches
3. Implement branch-aware message loading
4. Update UI to show branch indicator

---

## 11. UI/UX Specifications

### 11.1 Context Panel Tabs

- Horizontal tabs at top of panel (below header)
- Two tabs: Stats (default), Saves
- Active tab highlighted with underline/background
- Icons + labels on desktop, icons only on narrow width

### 11.2 Save List Items

Style similar to existing sidebar history:
```
┌─────────────────────────────────────┐
│ 📁 Turn 15 - Before Boss Fight     │
│ Jan 7, 2026 • 3:45 PM              │
│                              [🗑️]  │
└─────────────────────────────────────┘
```

### 11.3 Save Dialog

```
┌─────────────────────────────────────┐
│         Save Game                  X│
├─────────────────────────────────────┤
│                                     │
│ Save Name                           │
│ ┌─────────────────────────────────┐ │
│ │ Turn 15                         │ │
│ └─────────────────────────────────┘ │
│ Current turn: 15                    │
│                                     │
│          [Cancel]  [Save]           │
└─────────────────────────────────────┘
```

### 11.4 Load Confirmation Dialog

```
┌─────────────────────────────────────┐
│         Load Save?                 X│
├─────────────────────────────────────┤
│                                     │
│ Loading "Turn 10 - Tavern" will    │
│ revert to turn 10. Current progress │
│ (turn 15) will be lost unless saved.│
│                                     │
│ [Cancel] [Load] [Save & Load]       │
└─────────────────────────────────────┘
```

---

## 12. Testing Checklist

### Unit Tests
- [ ] Turn counting from messages
- [ ] Save creation and retrieval
- [ ] Branch creation from save
- [ ] Stats calculation

### Integration Tests
- [ ] Save flow end-to-end
- [ ] Load flow with confirmation
- [ ] Save & Load combined flow
- [ ] Context panel view switching

### Manual Testing
- [ ] Save button appears in play mode
- [ ] Save dialog opens with correct default
- [ ] Saves appear in saves view
- [ ] Loading a save shows confirmation
- [ ] Stats update after each turn
- [ ] Tab switching works correctly

---

## 13. File Changes Summary

### New Files
- `lib/db/migrations/XXXX_add_save_system.sql`
- `app/actions/saves.ts`
- `app/actions/turns.ts`
- `components/play/stats-view.tsx`
- `components/play/saves-view.tsx`
- `components/play/save-dialog.tsx`
- `components/play/load-confirm-dialog.tsx`
- `components/play/save-button.tsx`
- `components/play/context-panel-tabs.tsx`

### Modified Files
- `lib/db/schema.ts` - Add SaveSlot, Turn tables, modify GameSession
- `lib/db/queries.ts` - Add save/turn queries
- `lib/stores/game-store.ts` - Add context panel view state
- `lib/constants/navigation.ts` - Add context panel tabs
- `components/play/context-panel.tsx` - Add tab switching
- `components/play/play-chat.tsx` - Wire up dialogs
- `components/chat-header.tsx` - Add save button

### Deleted Files
- `components/play/cost-stats.tsx` - Merged into stats-view.tsx

---

## 14. Code Patterns to Follow

### Server Actions
- Always wrap in try/catch
- Return `{ success, data?, error? }` shape
- Use `"use server"` directive at top

### Database Queries
- Keep in `lib/db/queries.ts`
- Use Drizzle ORM patterns from existing code
- Throw `ChatSDKError` on failures

### Components
- Use `"use client"` for client components
- Colocate types with components when specific
- Use `cn()` for conditional classnames
- Follow existing patterns for dialogs (use `@/components/ui/dialog`)

### State Management
- Use Zustand for UI state
- Use SWR for data fetching in components
- Keep server state in database, not Zustand

---

## 15. Dependencies

No new npm packages required. Uses existing:
- `lucide-react` for icons (Save, BarChart3)
- `@/components/ui/*` for UI primitives
- `swr` for data fetching
- `zustand` for state management

---

## 16. Open Questions for Implementation

1. **Branch association for messages**: Should we add `branchId` to messages table, or reconstruct from event log?
   - **Recommendation**: Add `branchId` to messages for simplicity

2. **Auto-save frequency**: Should we auto-save at turn boundaries?
   - **Recommendation**: Start with manual saves only, add auto-save later

3. **Save limit**: Should there be a max number of saves per session?
   - **Recommendation**: No limit initially, consider 50 max if storage becomes issue

4. **Save sharing**: Can saves be shared between users?
   - **Recommendation**: Out of scope for MVP, saves are per-user

---

*End of Plan*

