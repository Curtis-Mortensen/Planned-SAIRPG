Implemented a "New Game Confirmation" dialog matching the LoadConfirmDialog pattern. Changes:
Changes Made:
Added state to game-store.ts:
newGameConfirmDialogOpen and setNewGameConfirmDialogOpen for dialog state
Created NewGameConfirmDialog component (components/play/new-game-confirm-dialog.tsx):
Three buttons: Cancel, Discard & Start New, Save & Start New
Uses currentChatId from store (or optional chatId prop)
Disables save button if no active chat
Updated PlayChat to track current chat:
Sets currentChatId on mount
Clears it on unmount (when leaving play page)
Updated all "New Game" triggers:
NewGameButton: Shows confirmation if currentChatId exists, otherwise starts directly
chat-header.tsx: Always shows confirmation (on play page)
app-sidebar.tsx: Shows confirmation if currentChatId exists
Added dialog to global layout:
Rendered in AppShell so it's available from anywhere
Also in ContextPanel for consistency
How This Fixes the Cycling Bug:
Explicit confirmation before starting a new game
last-play-id cookie cleared atomically with navigation
Only one active game tracked via currentChatId in the store
Prevents accidental multiple sessions when switching views
The dialog follows the same pattern as LoadConfirmDialog:
Cancel - Stay on current game
Discard & Start New - Equivalent to "Load Without Saving"
Save & Start New - Equivalent to "Save & Load"
All changes are compatible with your recent save system changes - it uses the same saveGameAction that flows through getGameSessionByChatId → ensureBranchExists → createSave.