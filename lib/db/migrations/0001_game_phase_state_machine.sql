-- Game Phase State Machine Tables
-- Run this migration to add pending action and meta event tracking

-- Ensure pgcrypto extension is available for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Enum types for game phases and meta event fields
CREATE TYPE "game_phase" AS ENUM (
  'idle',
  'validating', 
  'meta_proposal',
  'meta_review',
  'probability_roll',
  'in_meta_event',
  'in_combat',
  'resolving_action'
);

CREATE TYPE "meta_event_type" AS ENUM (
  'encounter',
  'discovery',
  'hazard',
  'opportunity'
);

CREATE TYPE "severity_level" AS ENUM (
  'minor',
  'moderate',
  'major'
);

CREATE TYPE "player_decision" AS ENUM (
  'accepted',
  'rejected'
);

-- Pending Actions: tracks the player's intended action through its lifecycle
-- NOTE: Removed currentEventIndex - use getNextUnresolvedEvent() instead to avoid drift
CREATE TABLE "PendingAction" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "gameId" uuid NOT NULL REFERENCES "GameSession"("id") ON DELETE CASCADE,
  "chatId" uuid NOT NULL REFERENCES "Chat"("id") ON DELETE CASCADE,
  "originalInput" text NOT NULL,
  "timeEstimate" varchar(50),
  "phase" game_phase NOT NULL DEFAULT 'validating',
  "createdAt" timestamp NOT NULL DEFAULT NOW(),
  "updatedAt" timestamp NOT NULL DEFAULT NOW(),
  "completedAt" timestamp
);

-- MetaEvent: individual events proposed/triggered for a pending action
CREATE TABLE "MetaEvent" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "pendingActionId" uuid NOT NULL REFERENCES "PendingAction"("id") ON DELETE CASCADE,
  "sequenceNum" integer NOT NULL DEFAULT 0,
  "type" meta_event_type NOT NULL,
  "title" varchar(255) NOT NULL,
  "description" text NOT NULL,
  "probability" real NOT NULL CHECK ("probability" >= 0 AND "probability" <= 1),
  "severity" severity_level NOT NULL,
  "triggersCombat" boolean NOT NULL DEFAULT false,
  "timeImpact" varchar(50),
  "playerDecision" player_decision,
  "rollResult" real CHECK ("rollResult" IS NULL OR ("rollResult" >= 0 AND "rollResult" <= 1)),
  "triggered" boolean,
  "resolvedAt" timestamp,
  "createdAt" timestamp NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX "PendingAction_gameId_idx" ON "PendingAction"("gameId");
CREATE INDEX "PendingAction_chatId_idx" ON "PendingAction"("chatId");
CREATE INDEX "PendingAction_phase_idx" ON "PendingAction"("phase");
CREATE INDEX "MetaEvent_pendingActionId_idx" ON "MetaEvent"("pendingActionId");

-- Unique constraint: only one active (non-completed) pending action per game
CREATE UNIQUE INDEX "PendingAction_active_per_game" 
  ON "PendingAction"("gameId") 
  WHERE "completedAt" IS NULL;

-- Unique constraint: prevent duplicate sequence numbers per pending action
CREATE UNIQUE INDEX "MetaEvent_sequence_unique"
  ON "MetaEvent" ("pendingActionId", "sequenceNum");
