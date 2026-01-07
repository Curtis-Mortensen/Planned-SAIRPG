# Save System Bug #1: Missing Database Columns

**Date**: January 7, 2026  
**Status**: Fixed  
**Severity**: High - Blocks save functionality and event log viewing

---

## Problem Summary

After implementing the save/load system, two critical database issues were discovered:

1. **EventLog table missing `cost` column** - Causes event log API to fail with 500 errors
2. **GameSession table missing save system columns** - Causes save game action to fail with database errors

---

## Root Cause

### Issue 1: Missing `cost` Column in EventLog

**Schema Definition** (`lib/db/schema.ts:213`):
```typescript
cost: text("cost"), // Storing as text for precision
```

**Migration 0008** (`lib/db/migrations/0008_late_trish_tilby.sql`):
- Created `EventLog` table (lines 30-44)
- **Did NOT include the `cost` column**

**Impact**: When queries try to select from `EventLog` and include the `cost` column (as defined in the schema), PostgreSQL throws:
```
Error [PostgresError]: column EventLog.cost does not exist
```

### Issue 2: Invalid PostgreSQL Syntax in Migration 0009

**Migration 0009** (`lib/db/migrations/0009_add_save_system.sql:29-32`):
```sql
ALTER TABLE "GameSession"
  ADD COLUMN IF NOT EXISTS "activeBranchId" UUID,
  ADD COLUMN IF NOT EXISTS "currentTurnId" UUID,
  ADD COLUMN IF NOT EXISTS "currentTurnNumber" TEXT NOT NULL DEFAULT '0';
```

**Problem**: PostgreSQL **does not support** `IF NOT EXISTS` clause with `ADD COLUMN`. This is MySQL syntax. In PostgreSQL:
- `ADD COLUMN IF NOT EXISTS` is invalid syntax
- The migration likely failed silently or the columns were never added
- Drizzle ORM queries fail because the schema expects these columns to exist

**Impact**: When `saveGameAction` runs:
1. Calls `getOrCreateActiveGameSession()`
2. Which calls `getGameSessions()`
3. Drizzle generates SQL based on schema expecting `activeBranchId`, `currentTurnId`, `currentTurnNumber`
4. PostgreSQL throws "column does not exist" errors
5. Error bubbles up: `Failed to get game sessions`

---

## Error Chain

### Event Log Error
```
GET /api/event-log?limit=100 500
Failed to fetch event logs: Error: An error occurred while executing a database query.
    at getEventLogs (lib/db/queries.ts:714:11)
```

**Root cause**: Query selects `cost` column that doesn't exist in database.

### Save Game Error
```
Failed to save game: Error: An error occurred while executing a database query.
    at getGameSessions (lib/db/queries.ts:835:11)
    at async getOrCreateActiveGameSession (lib/db/queries.ts:926:20)
    at async saveGameAction (app/actions/saves.ts:40:21)
```

**Root cause**: `getGameSessions()` query fails because GameSession table is missing columns that the schema expects.

---

## Solution

Created migration `0010_fix_missing_columns.sql` that:

1. **Adds missing `cost` column** to `EventLog` table using proper PostgreSQL syntax
2. **Adds missing GameSession columns** using `DO $$ BEGIN ... END $$` blocks with `information_schema` checks

### Key Fix: Proper PostgreSQL Column Addition

Instead of:
```sql
ALTER TABLE "GameSession" ADD COLUMN IF NOT EXISTS "activeBranchId" UUID;
```

Use:
```sql
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'GameSession' AND column_name = 'activeBranchId'
    ) THEN
        ALTER TABLE "GameSession" ADD COLUMN "activeBranchId" UUID;
    END IF;
END $$;
```

---

## Files Changed

- ✅ `lib/db/migrations/0010_fix_missing_columns.sql` - New migration file
- 📝 `code-reviews/save-bug-1.md` - This document

---

## Testing

After running `pnpm db:migrate`:

1. ✅ Event log API should return 200 instead of 500
2. ✅ Save game action should work without database errors
3. ✅ GameSession queries should succeed

---

## Prevention

### Migration Best Practices

1. **Always verify schema matches migrations**: After generating migrations, manually verify all columns exist
2. **Use proper PostgreSQL syntax**: Don't use MySQL-specific features like `IF NOT EXISTS` with `ADD COLUMN`
3. **Test migrations on clean database**: Run migrations on a fresh database to catch missing columns early
4. **Use Drizzle's migration generation**: Consider using `drizzle-kit generate` to auto-generate migrations from schema changes

### Code Review Checklist

- [ ] Verify all schema columns have corresponding migration entries
- [ ] Check PostgreSQL syntax compatibility (not MySQL)
- [ ] Test migrations on clean database
- [ ] Verify no silent failures in migration files

---

## Related Issues

- Event log tab in world editor shows error instead of events
- Save button throws database error when clicked
- `getGameSessions()` query fails intermittently

---

*End of Bug Report*

