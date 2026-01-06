# Found Bug #1: Drizzle Migration Silent Failure

## Date Discovered
January 6, 2026

## Summary
Running `npx drizzle-kit push` appears to complete but tables are not actually created in the database. The migration process shows warnings and requires interactive confirmation that doesn't work in automated/piped scenarios.

## Symptoms

### 1. Migration Output Shows Warnings
```
Warning › You are about to change Stream table primary key. This action may cause data loss. 
Do you want to add primary key to Stream table?
No, abort

Warning › stream_session_id_session_id_fk (truncated to 63 characters from stream_session_id_session_id_fk) -->
stream_session_id_session_id_fk
```

### 2. Database Tables Not Created
When querying the database for tables:
```sql
SELECT tablename FROM pg_tables WHERE schemaname = 'public';
```
Result: Empty - no tables exist.

### 3. Interactive Prompt Blocking
The migration requires user confirmation ("Do you want to add primary key to Stream table?") but:
- Piping `echo "y"` doesn't work
- The process exits with code 130 (SIGINT) when interrupted
- Non-interactive environments cannot proceed

## Root Cause Analysis (Best Guess)

### Primary Issue: Interactive Confirmation Required
Drizzle-kit's `push` command detects schema changes that could cause data loss and requires explicit user confirmation. When running in a non-interactive terminal or with piped input, the confirmation prompt fails and the migration aborts silently.

### Secondary Issue: Stream Table Primary Key
Looking at the schema definition in `lib/db/schema.ts`, the `Stream` table likely has a primary key configuration issue:

```typescript
export const stream = pgTable('Stream', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  // ...
});
```

The warning suggests drizzle-kit is trying to ADD a primary key, which implies:
1. The table might exist in the database without a primary key (from a previous partial migration)
2. OR drizzle-kit is misinterpreting the schema diff
3. OR there's a mismatch between the introspected schema and the defined schema

### Tertiary Issue: Identifier Truncation
PostgreSQL has a 63-character limit for identifiers. The foreign key constraint name:
```
stream_session_id_session_id_fk
```
Is being truncated. While this is just a warning, it indicates the naming convention may need adjustment.

## Reproduction Steps

1. Ensure PostgreSQL is running via Docker:
   ```bash
   docker-compose up -d postgres
   ```

2. Run the migration:
   ```bash
   npx drizzle-kit push
   ```

3. Observe the warning about Stream table primary key

4. Try to confirm with piped input:
   ```bash
   echo "y" | npx drizzle-kit push
   ```

5. Check if tables were created:
   ```bash
   docker exec -it ai-chatbot-postgres psql -U postgres -d ai_chatbot -c "SELECT tablename FROM pg_tables WHERE schemaname = 'public';"
   ```

## Potential Solutions

### Option 1: Use `--force` Flag (If Available)
```bash
npx drizzle-kit push --force
```
Need to verify if this flag exists in the current drizzle-kit version.

### Option 2: Generate and Run SQL Manually
```bash
npx drizzle-kit generate
# Then manually apply the SQL files
```

### Option 3: Use `drizzle-kit migrate` Instead
The `migrate` command might have different interactive behavior:
```bash
npx drizzle-kit migrate
```

### Option 4: Fix Schema Definition
Review the `Stream` table definition in `lib/db/schema.ts` to ensure primary key is correctly defined. May need to explicitly set composite keys or adjust the definition.

### Option 5: Drop and Recreate (Development Only)
Since the database is empty anyway:
```bash
# Drop the database
docker exec -it ai-chatbot-postgres psql -U postgres -c "DROP DATABASE IF EXISTS ai_chatbot;"
docker exec -it ai-chatbot-postgres psql -U postgres -c "CREATE DATABASE ai_chatbot;"

# Re-run migration
npx drizzle-kit push
```

### Option 6: Use expect Script
Create an expect script to handle interactive prompts:
```bash
#!/usr/bin/expect
spawn npx drizzle-kit push
expect "Do you want to add primary key"
send "y\r"
expect eof
```

## Files Involved

- `lib/db/schema.ts` - Schema definitions
- `drizzle.config.ts` - Drizzle configuration
- `docker-compose.yml` - Database container setup

## Environment

- Drizzle ORM version: Check `package.json`
- PostgreSQL version: 15 (from docker-compose.yml)
- Node version: Check with `node -v`

## Status
**UNRESOLVED** - Requires further investigation and testing of solutions.

## Next Steps

1. [ ] Check drizzle-kit version and available flags
2. [ ] Review Stream table schema definition
3. [ ] Test `drizzle-kit generate` as alternative
4. [ ] Consider if database needs to be reset
5. [ ] Update docker-compose or scripts to handle interactive migration
