# Inngest & Docker Setup - What's Been Configured

## ✅ Completed Setup

### 1. **Package Dependencies**
- ✅ Added `inngest@^3.48.1` to `package.json`
- ✅ Run `pnpm install` to pull in the dependency

### 2. **Docker Compose**
- ✅ Updated `docker-compose.yml` to include Inngest service
- ✅ Postgres service already configured
- ✅ Health checks for both services

### 3. **Inngest Client**
- ✅ Created `lib/inngest/client.ts` with:
  - Inngest client initialization
  - Game event types and payloads
  - Event definitions for full workflow

### 4. **Inngest Workflows**
- ✅ Created `lib/inngest/functions.ts` with:
  - Main game loop workflow (`gameLoopWorkflow`)
  - Turn failure handler (`handleTurnFailure`)
  - Placeholder steps for each module stage

### 5. **Inngest API Route**
- ✅ Created `app/api/inngest/route.ts`
- ✅ Serves GET, POST, PUT for Inngest communication

### 6. **Utilities**
- ✅ Created `lib/inngest/utils.ts` with:
  - `triggerGameTurn()` - Start a workflow
  - `generateNarrativeFallback()` - Fallback when Inngest unavailable
  - `getTurnStatus()` - Check turn status

### 7. **Configuration**
- ✅ Updated `.env.example` with Inngest variables
- ✅ Created `DOCKER_INNGEST_SETUP.md` comprehensive guide

## 🚀 Quick Start

```bash
# 1. Install dependencies
pnpm install

# 2. Start Docker services
docker-compose up -d

# 3. Create .env.local from .env.example
cp .env.example .env.local

# 4. Run migrations
pnpm run db:push

# 5. Start dev server
pnpm run dev

# 6. Access Inngest dashboard
open http://localhost:8288
```

## 📋 Architecture Overview

```
Player submits action
        ↓
app/(chat)/api/chat/route.ts (or similar)
        ↓
triggerGameTurn() from lib/inngest/utils.ts
        ↓
Inngest receives event (game/action.submitted)
        ↓
gameLoopWorkflow executes:
  1. Validate input
  2. Run constraint modules
  3. Run meta modules
  4. Run interaction modules
  5. Run narrator module
  6. Finalize turn
        ↓
Emit game/turn.completed
        ↓
Send response to player
```

## 🔧 Next Steps to Complete

### 1. **Integrate with Chat Routes**
- Modify `/app/(chat)/api/chat/route.ts` to call `triggerGameTurn()`
- Instead of default chat, trigger the game loop workflow

### 2. **Implement Module Functions**
Replace the placeholder `step.run()` calls in `lib/inngest/functions.ts` with:
- `validate-input`: Call Valid Input Module
- `run-constraints`: Call Time, Difficulty, Inventory modules
- `run-meta`: Call Meta Nesting and Meta Events modules
- `run-interactions`: Call NPC and Background modules
- `run-narrator`: Call the Narrator module with all context

### 3. **Implement Fallback Behavior**
- Enhance `generateNarrativeFallback()` with more sophisticated responses
- Integrate with chat routes to use fallback when Inngest fails

### 4. **Build Narrator Module UI**
- Create prompt editor (you were working on this)
- Add sliders: verbosity, tone, challenge
- Include lore file editor
- Save prompts to database

### 5. **Create Module Implementations**
Once the workflow scaffold is in place:
- Constraint modules (DB queries + LLM calls)
- Meta modules (Nesting logic + LLM calls)
- Interaction modules (NPC state + LLM calls)
- Narrator module (Main orchestrator + LLM call)

## 🧪 Testing the Setup

### Test Inngest Health
```bash
curl http://localhost:8288/health
```

### Test Database Connection
```bash
docker exec ai-chatbot-postgres psql -U postgres -d ai_chatbot -c "SELECT 1;"
```

### Manually Test a Workflow
1. Go to http://localhost:8288
2. Click on the `game-loop-main` function
3. Click "Test"
4. Enter test payload:
   ```json
   {
     "sessionId": "test-session-123",
     "userId": "test-user-456",
     "playerInput": "I attack the goblin"
   }
   ```
5. Watch execution in real-time

## 📚 Documentation

- **Docker Setup**: See `DOCKER_INNGEST_SETUP.md` for detailed instructions
- **Inngest Client**: See `lib/inngest/client.ts` for event types
- **Workflows**: See `lib/inngest/functions.ts` for workflow structure
- **Utilities**: See `lib/inngest/utils.ts` for helper functions

## 🔐 Environment Variables

Add to `.env.local`:

```env
# Required
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ai_chatbot
INNGEST_BASE_URL=http://inngest:8288

# Optional (for production Inngest Cloud)
INNGEST_EVENT_KEY=your_key_here
```

## ⚠️ Important Notes

1. **Local Dev Inngest Dashboard**: Only works when using `inngest:latest` Docker image. Not available in Inngest Cloud.
2. **Event Sourcing**: All turns will be logged to database once you implement the `finalize-turn` step.
3. **Retries**: Configured with exponential backoff (2^attempt * 1000ms)
4. **Fallback**: When Inngest is down, use `generateNarrativeFallback()` to still serve users

---

You're now ready to:
1. Start Docker services
2. Integrate chat routes with game loop
3. Build out the module implementations
4. Test end-to-end gameplay!
