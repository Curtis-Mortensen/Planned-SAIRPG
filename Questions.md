# Open Questions & Decisions

*Questions that need answers before or during implementation.*

---

## 1. Agent Workers — Where Do They Run?

The agent workers (Action Evaluator, Narrator, etc.) need to consume events from Redis Streams and process them. Three main architectural options:

### Option A: Long-Running Node Processes

```
┌─────────────────┐     ┌─────────────────┐
│  Next.js App    │     │  Worker Process │
│  (API + UI)     │     │  (Node.js)      │
│                 │     │                 │
│  Publishes to   │────▶│  XREADGROUP     │
│  Redis Stream   │     │  (blocking)     │
└─────────────────┘     └─────────────────┘
```

**How it works**: Separate Node.js process(es) that run continuously, using `XREADGROUP` with `BLOCK` to wait for new events.

**Pros**:
- Simple mental model
- True parallelism (multiple workers)
- No cold start latency
- Works great for local dev

**Cons**:
- Need to manage worker lifecycle (PM2, systemd, K8s)
- Doesn't fit Vercel's serverless model
- Needs separate hosting for workers (Railway, Fly.io, etc.)
- Scaling = deploying more worker instances

**Best for**: Self-hosted, VPS, or container platforms (Railway, Fly, Render)

---

### Option B: Serverless Functions (Polling/Webhook)

```
┌─────────────────┐     ┌─────────────────┐
│  Next.js App    │     │  Cron/Webhook   │
│  (API + UI)     │────▶│  Trigger        │
│                 │     │                 │
│  Publishes to   │     │  Invokes        │
│  Redis Stream   │     │  /api/worker    │
└─────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌─────────────────┐
                        │  Serverless Fn  │
                        │  (10-30s limit) │
                        │                 │
                        │  XREAD (poll)   │
                        │  Process batch  │
                        └─────────────────┘
```

**How it works**: Cron job or webhook triggers a serverless function every N seconds. Function polls Redis, processes available events, exits.

**Pros**:
- Works on Vercel
- No worker management
- Scales automatically
- Pay per invocation

**Cons**:
- Latency: events wait for next poll cycle (1-5 seconds typical)
- 10-30 second function timeout limits
- Cold starts add latency
- Polling feels wasteful

**Best for**: Vercel, Netlify, or when you want zero infra management

---

### Option C: Managed Background Jobs (Inngest / QStash / Trigger.dev)

```
┌─────────────────┐     ┌─────────────────┐
│  Next.js App    │     │  Inngest/QStash │
│  (API + UI)     │────▶│  (managed)      │
│                 │     │                 │
│  Sends event    │     │  Queues job     │
│  to Inngest     │     │  Invokes fn     │
└─────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌─────────────────┐
                        │  Your Function  │
                        │  (via webhook)  │
                        │                 │
                        │  Long timeout   │
                        │  Retries built-in│
                        └─────────────────┘
```

**How it works**: Instead of Redis Streams, you send events to a managed queue service. They handle delivery, retries, and invoke your functions via webhook.

**Pros**:
- Works perfectly on Vercel
- Built-in retries, dead-letter, observability
- Long timeouts (Inngest: 15 min, QStash: configurable)
- Event replay built-in
- No Redis Streams complexity

**Cons**:
- Adds a dependency (Inngest, QStash)
- Slightly different mental model than Redis Streams
- Cost at scale (though usually cheap)
- Less control over exactly-once semantics

**Best for**: Vercel + wanting a "just works" solution

---

### Recommendation Needed

**Question**: What's your deployment target?

- If **Vercel**: Option C (Inngest) is probably cleanest
- If **Railway/Fly/self-hosted**: Option A (long-running workers) is simplest
- If **hybrid** (Next.js on Vercel, workers elsewhere): Option A for workers

This decision affects:
- Whether we use Redis Streams at all (Option C might replace it)
- How we structure the worker code
- Deployment configuration

---

## 2. Chatbot History & Persistence — Use Existing or Build Custom?

The existing chatbot implementation handles auth and likely has its own approach to:
- Message history storage
- Conversation state
- Session management

### Questions to Answer After Reviewing Chatbot Code

1. **How does it store messages?**
   - In-memory only?
   - Database (which one)?
   - Local storage?

2. **Does it have a concept of "sessions" or "conversations"?**
   - If yes, can we extend it with our `session_id` / `branch_id`?
   - If no, we need to add session management

3. **How does it handle message streaming?**
   - Vercel AI SDK `useChat`?
   - Custom SSE?
   - WebSockets?

4. **Can we hook into its message lifecycle?**
   - We need to capture the player's message as `PLAYER_ACTION_SUBMITTED`
   - We need to inject agent outputs as assistant messages

### Options

**Option A: Extend the Chatbot**
- Keep its auth, history, and streaming
- Add hooks for our event system
- Messages become events, events become messages

**Option B: Replace with Our Own**
- Use chatbot only for auth
- Build our own message/event display
- More control, more work

**Option C: Parallel Systems**
- Chatbot handles "chat" (casual conversation with AI narrator)
- Our system handles "game" (structured events, dice rolls, etc.)
- Merge at the UI layer

### Decision Needed After Codebase Review

Once the chatbot repo is available, review and decide which option makes sense.

---

## 3. Redis Streams vs. Simpler Alternatives

Related to Question 1. If we go with Option C (Inngest/QStash), do we still need Redis Streams?

**With Inngest**: 
- Inngest IS the event bus
- Redis becomes just a cache/ephemeral store
- Simpler architecture, fewer moving parts

**Without Inngest**:
- Redis Streams is our event bus
- Need consumer groups, ACKs, dead-letter handling
- More control, more complexity

**Decision**: Defer until Question 1 is answered.

---

## 4. Testing Approach

What testing framework and strategy should we use?

### Option A: Vitest

**Pros**:
- Fast (uses esbuild/native ES modules)
- Built for modern TypeScript/Next.js
- Compatible with Jest API (easy migration)
- Great watch mode for TDD

**Cons**:
- Slightly newer, less ecosystem
- Some edge cases with certain Node APIs

### Option B: Jest

**Pros**:
- Industry standard, huge ecosystem
- Well-documented
- Mature tooling

**Cons**:
- Slower than Vitest
- More configuration needed for ESM/TypeScript
- Heavier

### E2E Testing (Later)

- **Playwright** — Best for modern web apps, great debugging
- **Cypress** — More popular, good DX, but slower

### Strategy Questions

1. **Tests as we go or after?**
   - Recommended: Write contract tests (Zod schemas) first, then implementation
   - Integration tests after each story completes

2. **What to test?**
   - Agent contracts (schema validation)
   - Idempotency (process same event twice → same result)
   - Determinism (seeded rolls produce same output)
   - Fallbacks trigger correctly

3. **LLM testing?**
   - Mock LLM calls in unit tests
   - Use cheap model (gpt-4o-mini) for integration tests
   - Consider recorded responses for deterministic tests

### Decision Needed

- Which test runner: Vitest or Jest?
- Tests written alongside stories or after?

---

## Questions Already Answered

| Question | Answer | Decided |
|----------|--------|---------|
| Round vs Tick | Tick = one loop, whatever triggers it | ✅ |
| World State Stage 1 | Text blob, no structured data | ✅ |
| Location tracking | Stage 5 | ✅ |
| Player character | Stage 6 | ✅ |
| World scenario selection | Stage 0 | ✅ |
| Auth | Stage 0, handled by chatbot | ✅ |
| Meta-events | Stage 3 | ✅ |
| Outline + NPC decisions | Stage 4 | ✅ |
| Player can edit prompts | Yes, Stage 2 (triggers re-loop) | ✅ |
| DB-stored prompts | Stage 1 | ✅ |
| Saves + editing | Stage 2 (split from original Stage 1) | ✅ |

---

*Last Updated: December 31, 2024*

