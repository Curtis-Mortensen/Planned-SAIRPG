# Docker & Inngest Setup Guide for SAIRPG

## Overview

This guide covers:
1. Running the full stack with Docker (Postgres + Inngest)
2. Local development with Inngest
3. Configuration and troubleshooting

## Quick Start with Docker

### Prerequisites
- Docker and Docker Compose installed
- pnpm for Node dependencies
- Node.js 18+ (for local dev server)

### Running the Full Stack

```bash
# Start all services (Postgres + Inngest)
docker-compose up -d

# Install dependencies (if not already done)
pnpm install

# Set up environment variables
cp .env.example .env.local

# Update .env.local with your values:
# INNGEST_BASE_URL=http://inngest:8288  (for Docker)
# DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ai_chatbot

# Run migrations
pnpm run db:push

# Start the dev server (runs on your host machine)
pnpm run dev
```

The app will be available at `http://localhost:3000`

### Accessing Services

- **App**: http://localhost:3000
- **Postgres**: localhost:5432
- **Inngest Dashboard**: http://localhost:8288 (local dev only)

## Docker Services

### postgres (ai-chatbot-postgres)
- **Image**: postgres:16-alpine
- **Container Port**: 5432
- **Host Port**: 5432
- **Volume**: `postgres_data` (persistent)
- **Init Script**: `docker/init-schemas.sql`

```bash
# Connect to postgres
docker exec -it ai-chatbot-postgres psql -U postgres -d ai_chatbot

# View logs
docker logs ai-chatbot-postgres
```

### inngest (ai-chatbot-inngest)
- **Image**: inngest/inngest:latest
- **Container Port**: 8288
- **Host Port**: 8288
- **Dev Mode**: Enabled

```bash
# Access Inngest dashboard
open http://localhost:8288

# View logs
docker logs ai-chatbot-inngest
```

## Local Development Without Docker

If you prefer to run services locally:

### 1. Install Inngest CLI
```bash
# macOS
brew install inngest/tap/inngest-cli

# Linux (using Node)
npm install -g inngest

# Or use Docker to run a single Inngest instance
docker run -d -p 8288:8288 inngest/inngest:latest
```

### 2. Start Dev Server with Inngest
```bash
# Terminal 1: Start Inngest locally
inngest run

# Terminal 2: Start Next.js dev server
INNGEST_BASE_URL=http://localhost:8288 pnpm run dev
```

## Inngest Architecture

### Workflow Flow

```
Player Action Submitted
    ↓
[Input Validation Gate]
    ↓
[Constraint Modules: Time, Difficulty, Inventory]
    ↓
[Meta Modules: Nesting Decision, Meta Events]
    ↓
[Interaction Modules: NPC Reactions, Background]
    ↓
[Narrator Module: Hub - Synthesizes all inputs]
    ↓
[Game State Update]
    ↓
Display to Player
```

### Event Types

All events are defined in `lib/inngest/client.ts`:

- `game/action.submitted` - Player submits an action
- `game/turn.started` - Workflow begins processing
- `game/validation.completed` - Input validation complete
- `game/constraints.completed` - Constraint modules done
- `game/meta.completed` - Meta modules done
- `game/interaction.completed` - Interaction modules done
- `game/narrator.completed` - Narrator module done
- `game/turn.completed` - Turn finished successfully
- `game/turn.failed` - Turn failed with error

## Configuration

### Environment Variables

```env
# Required for Docker setup
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ai_chatbot
INNGEST_BASE_URL=http://inngest:8288

# For local development (no Docker)
INNGEST_BASE_URL=http://localhost:8288

# Optional: Inngest API key for production
INNGEST_EVENT_KEY=your_api_key
```

### Inngest Function Registration

Functions are defined in `lib/inngest/functions.ts` and automatically registered through the API route at `/api/inngest`.

When your Next.js app starts, Inngest is informed of all available functions via the API endpoint.

## Troubleshooting

### Inngest Can't Connect to App

**Error**: Inngest dashboard shows "Failed to connect"

**Solution**:
1. Ensure `/api/inngest` route exists and is accessible
2. Check that app is running on port 3000
3. From Inngest perspective, your app is at `http://host.docker.internal:3000` (on Docker Desktop)
4. Verify `INNGEST_BASE_URL` matches your Inngest instance

### Database Connection Issues

```bash
# Test connection
docker exec ai-chatbot-postgres psql -U postgres -d ai_chatbot -c "SELECT 1;"

# View logs
docker logs ai-chatbot-postgres

# Restart service
docker-compose restart postgres
```

### Inngest Not Processing Events

```bash
# Check Inngest health
curl http://localhost:8288/health

# View Inngest logs
docker logs ai-chatbot-inngest

# Restart Inngest
docker-compose restart inngest
```

### Clear Volumes and Start Fresh

```bash
# Stop containers
docker-compose down

# Remove all volumes (⚠️  WARNING: Deletes all data)
docker-compose down -v

# Rebuild
docker-compose up -d
```

## Production Deployment

### Inngest for Production

In production, you'll want to use Inngest Cloud instead of the local dev server:

1. Sign up at https://www.inngest.com
2. Get your Event API key and Backend ID
3. Configure environment:

```env
INNGEST_EVENT_KEY=your_event_key
INNGEST_BACKEND_ID=your_backend_id
```

The `/api/inngest` endpoint remains the same. Inngest Cloud will connect directly.

### Database for Production

- Use a managed Postgres service (e.g., Vercel Postgres, AWS RDS)
- Update `DATABASE_URL` to production database
- Run migrations: `pnpm run db:push`

## Development Workflow

### Making Changes to Inngest Functions

1. Edit `lib/inngest/functions.ts`
2. Restart dev server (functions are auto-discovered)
3. Inngest dashboard will show updated function definitions

### Testing Workflows

1. Open Inngest dashboard (http://localhost:8288)
2. Click on a function
3. Click "Test" to manually trigger
4. View execution logs in real-time

### Debugging

- Check `/api/inngest` route logs
- Review Inngest dashboard for function execution traces
- Use `step.run()` to break workflows into debuggable steps

## Next Steps

- Implement constraint modules (Time, Difficulty, Inventory)
- Implement meta modules (Nesting, Meta Events)
- Implement interaction modules (NPC, Background)
- Integrate LLM calls within Narrator module
- Add fallback behavior for LLM failures
