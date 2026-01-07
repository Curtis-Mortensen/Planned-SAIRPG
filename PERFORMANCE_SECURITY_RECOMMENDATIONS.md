# Performance and Security Recommendations

This document outlines additional improvements that should be considered for the Planned-SAIRPG codebase beyond the immediate fixes already implemented.

## Already Fixed (Implemented)

1. ✅ **Authentication on Prompts API** - Added session authentication requirement
2. ✅ **Authorization on Event Log API** - Added game ownership verification
3. ✅ **N+1 Query Fix** - Implemented batched query for save counts
4. ✅ **Improved Error Handling** - Using Promise.allSettled for partial success
5. ✅ **Removed Sensitive Logging** - Eliminated chatId from console output

## High Priority Recommendations

### 1. Database Indexes

Add indexes to improve query performance on frequently accessed columns:

```sql
-- Game session queries by user
CREATE INDEX idx_game_session_user_id ON "GameSession"(userId);
CREATE INDEX idx_game_session_active ON "GameSession"(userId, isActive) WHERE isActive = true;

-- Save slot queries by game
CREATE INDEX idx_save_slot_game_id ON "SaveSlot"(gameId);

-- Event log queries
CREATE INDEX idx_event_log_game_id ON "EventLog"(gameId);
CREATE INDEX idx_event_log_save_id ON "EventLog"(saveId);
CREATE INDEX idx_event_log_payload_chat_id ON "EventLog" USING GIN ((payload->>'chatId'));

-- Message queries by chat
CREATE INDEX idx_message_chat_id ON "Message"(chatId);
CREATE INDEX idx_message_created_at ON "Message"(chatId, createdAt);
```

### 2. Implement Proper Tokenization

Replace rough estimation (`length / 4`) with actual tokenization:

**Location**: `app/(chat)/api/chat/route.ts` (lines 460-468, 588-596)

**Recommendation**: Use a proper tokenizer library like `tiktoken` or the model-specific tokenizer:

```typescript
import { encoding_for_model } from "tiktoken";

// Example usage:
const encoder = encoding_for_model(selectedChatModel);
const tokensIn = encoder.encode(userText).length;
const tokensOut = encoder.encode(assistantText).length;
```

This will provide accurate token counts for cost calculations.

### 3. Rate Limiting

Implement rate limiting at the API route level to prevent abuse:

**Location**: All public API routes in `app/(chat)/api/`

**Recommendation**: Use a rate limiting middleware or service:

```typescript
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, "10 s"),
});
```

## Medium Priority Recommendations

### 4. Replace Console Logging with Proper Logging Service

**Current State**: 22+ occurrences of `console.log`, `console.warn`, `console.error`

**Recommendation**: Implement structured logging with a service like:
- Winston
- Pino
- OpenTelemetry (already partially in place)

Benefits:
- Better log aggregation
- Log levels and filtering
- Sensitive data masking
- Performance monitoring

### 5. Implement Request/Response Caching

**Locations**:
- `getPromptByModule()` - Prompts rarely change
- `getEventLogs()` - Historical data is immutable
- `getSavesByGame()` - Save lists don't change frequently

**Recommendation**: Use Redis or in-memory cache with TTL:

```typescript
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.REDIS_URL,
  token: process.env.REDIS_TOKEN,
});

// Cache prompt for 1 hour
const cacheKey = `prompt:${moduleName}:${name}`;
const cached = await redis.get(cacheKey);
if (cached) return cached;

const prompt = await db.select()...;
await redis.set(cacheKey, prompt, { ex: 3600 });
```

### 6. Batch Event Log Writes

**Location**: `app/(chat)/api/chat/route.ts` - Multiple `createEvent()` calls

**Current Issue**: Each event is written individually to the database

**Recommendation**: Batch event creation:

```typescript
const eventsToCreate = [
  {
    gameId,
    sequenceNum: Date.now().toString(),
    eventType: "personality_sent",
    // ...
  },
  {
    gameId,
    sequenceNum: (Date.now() + 1).toString(),
    eventType: "system_prompt",
    // ...
  }
];

await db.insert(eventLog).values(eventsToCreate);
```

## Low Priority Recommendations

### 7. Optimize Message Copying in Save/Load

**Location**: `app/actions/saves.ts` - `saveGameAction()` and `loadSaveAction()`

**Current Issue**: All messages are copied individually with `map()`

**Recommendation**: Use bulk insert with single transaction:

```typescript
await db.transaction(async (tx) => {
  // Create chat and messages in one transaction
  await tx.insert(chat).values({...});
  await tx.insert(message).values(copiedMessages);
});
```

### 8. Remove Unused Helper Code

**Location**: `lib/db/helpers/01-core-to-parts.ts`

**Issue**: Entire file is commented out (254 lines)

**Recommendation**: Either remove the file or uncomment if needed for migration purposes.

### 9. Add Input Validation

**Locations**: All API routes and server actions

**Recommendation**: Use Zod schemas consistently for input validation:

```typescript
import { z } from "zod";

const eventLogParamsSchema = z.object({
  gameId: z.string().uuid(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});

// In route handler:
const params = eventLogParamsSchema.parse(searchParams);
```

### 10. Implement Connection Pooling

**Location**: `lib/db/queries.ts` - Database client initialization

**Current State**: Single postgres client instance

**Recommendation**: Configure connection pool limits:

```typescript
const client = postgres(process.env.POSTGRES_URL!, {
  max: 10, // Maximum pool size
  idle_timeout: 20, // Close idle connections after 20s
  connect_timeout: 10, // Timeout connection attempts after 10s
});
```

## Security Considerations

### 11. Content Security Policy (CSP)

Add CSP headers to prevent XSS attacks:

```typescript
// In next.config.ts
const cspHeader = `
  default-src 'self';
  script-src 'self' 'unsafe-eval' 'unsafe-inline';
  style-src 'self' 'unsafe-inline';
  img-src 'self' blob: data:;
  font-src 'self';
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
  upgrade-insecure-requests;
`;
```

### 12. SQL Injection Prevention

**Location**: `lib/db/queries.ts` - `getChatCost()` line 773

**Current State**: Uses parameterized query (already safe) ✅

**Note**: Continue using Drizzle's query builder or parameterized queries to prevent SQL injection.

### 13. Sanitize AI Responses

**Recommendation**: Sanitize AI-generated content before storing/displaying:

```typescript
import DOMPurify from "isomorphic-dompurify";

const sanitizedContent = DOMPurify.sanitize(aiResponse);
```

## Testing Recommendations

1. **Load Testing**: Test with 100+ concurrent users to identify bottlenecks
2. **Security Scanning**: Use tools like OWASP ZAP or Burp Suite
3. **Performance Monitoring**: Set up APM (e.g., New Relic, Datadog)
4. **Error Tracking**: Implement Sentry or similar for production error monitoring

## Monitoring Metrics to Track

- API response times (p50, p95, p99)
- Database query performance
- Error rates by endpoint
- Token usage and costs
- Active user sessions
- Cache hit/miss ratios
- Database connection pool usage

---

**Last Updated**: 2026-01-07
**Priority**: Review these recommendations quarterly and implement based on user load and feedback.
