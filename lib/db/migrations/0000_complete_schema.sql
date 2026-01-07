-- Complete Schema Migration for SAIRPG
-- This migration sets up the entire database schema from scratch
-- Use this when resetting the database (docker-compose down/up)

-- =============================================================================
-- CORE CHAT TABLES
-- =============================================================================

-- User table
CREATE TABLE IF NOT EXISTS "User" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" varchar(64) NOT NULL,
  "password" varchar(64)
);

-- Chat table
CREATE TABLE IF NOT EXISTS "Chat" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "createdAt" timestamp NOT NULL,
  "title" text NOT NULL,
  "userId" uuid NOT NULL REFERENCES "User"("id"),
  "visibility" varchar NOT NULL DEFAULT 'private'
);

-- Deprecated Message table (for backward compatibility)
CREATE TABLE IF NOT EXISTS "Message" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "chatId" uuid NOT NULL REFERENCES "Chat"("id"),
  "role" varchar NOT NULL,
  "content" json NOT NULL,
  "createdAt" timestamp NOT NULL
);

-- Message_v2 table (current)
CREATE TABLE IF NOT EXISTS "Message_v2" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "chatId" uuid NOT NULL REFERENCES "Chat"("id"),
  "role" varchar NOT NULL,
  "parts" json NOT NULL,
  "attachments" json NOT NULL,
  "createdAt" timestamp NOT NULL
);

-- Deprecated Vote table
CREATE TABLE IF NOT EXISTS "Vote" (
  "chatId" uuid NOT NULL REFERENCES "Chat"("id"),
  "messageId" uuid NOT NULL REFERENCES "Message"("id"),
  "isUpvoted" boolean NOT NULL,
  PRIMARY KEY ("chatId", "messageId")
);

-- Vote_v2 table (current)
CREATE TABLE IF NOT EXISTS "Vote_v2" (
  "chatId" uuid NOT NULL REFERENCES "Chat"("id"),
  "messageId" uuid NOT NULL REFERENCES "Message_v2"("id"),
  "isUpvoted" boolean NOT NULL,
  PRIMARY KEY ("chatId", "messageId")
);

-- Document table
CREATE TABLE IF NOT EXISTS "Document" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "createdAt" timestamp NOT NULL,
  "title" text NOT NULL,
  "content" text,
  "text" varchar NOT NULL DEFAULT 'text',
  "userId" uuid NOT NULL REFERENCES "User"("id"),
  PRIMARY KEY ("id", "createdAt")
);

-- Suggestion table
CREATE TABLE IF NOT EXISTS "Suggestion" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "documentId" uuid NOT NULL,
  "documentCreatedAt" timestamp NOT NULL,
  "originalText" text NOT NULL,
  "suggestedText" text NOT NULL,
  "description" text,
  "isResolved" boolean NOT NULL DEFAULT false,
  "userId" uuid NOT NULL REFERENCES "User"("id"),
  "createdAt" timestamp NOT NULL,
  FOREIGN KEY ("documentId", "documentCreatedAt") REFERENCES "Document"("id", "createdAt")
);

-- Stream table
CREATE TABLE IF NOT EXISTS "Stream" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "chatId" uuid NOT NULL REFERENCES "Chat"("id"),
  "createdAt" timestamp NOT NULL
);

-- =============================================================================
-- SAIRPG CORE TABLES
-- =============================================================================

-- GameSession table (represents a Game)
CREATE TABLE IF NOT EXISTS "GameSession" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "userId" uuid NOT NULL REFERENCES "User"("id"),
  "title" text NOT NULL DEFAULT 'Untitled Adventure',
  "chatId" uuid REFERENCES "Chat"("id") ON DELETE SET NULL,
  "isActive" boolean NOT NULL DEFAULT true,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

-- SaveSlot table
CREATE TABLE IF NOT EXISTS "SaveSlot" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "gameId" uuid NOT NULL REFERENCES "GameSession"("id") ON DELETE CASCADE,
  "chatId" uuid NOT NULL REFERENCES "Chat"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "turnNumber" text NOT NULL,
  "messageCount" text NOT NULL,
  "description" text,
  "createdAt" timestamp NOT NULL DEFAULT now()
);

-- EventLog table
CREATE TABLE IF NOT EXISTS "EventLog" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "gameId" uuid NOT NULL REFERENCES "GameSession"("id") ON DELETE CASCADE,
  "saveId" uuid REFERENCES "SaveSlot"("id") ON DELETE CASCADE,
  "sequenceNum" text NOT NULL,
  "eventType" varchar(100) NOT NULL,
  "moduleName" varchar(100) NOT NULL DEFAULT 'system',
  "actor" varchar(50) NOT NULL DEFAULT 'system',
  "payload" json NOT NULL DEFAULT '{}',
  "cost" text,
  "createdAt" timestamp NOT NULL DEFAULT now()
);

-- Prompt table
CREATE TABLE IF NOT EXISTS "Prompt" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "moduleName" varchar(100) NOT NULL,
  "name" varchar(255) NOT NULL,
  "version" text NOT NULL DEFAULT '1',
  "content" text NOT NULL,
  "settings" json NOT NULL DEFAULT '{}',
  "isActive" boolean NOT NULL DEFAULT true,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

-- Artifact table
CREATE TABLE IF NOT EXISTS "Artifact" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "gameId" uuid REFERENCES "GameSession"("id") ON DELETE CASCADE,
  "eventId" uuid REFERENCES "EventLog"("id") ON DELETE SET NULL,
  "promptId" uuid REFERENCES "Prompt"("id") ON DELETE SET NULL,
  "moduleName" varchar(100) NOT NULL,
  "model" varchar(100) NOT NULL,
  "inputText" text NOT NULL,
  "outputText" text,
  "tokensIn" text,
  "tokensOut" text,
  "latencyMs" text,
  "costUsd" text,
  "status" varchar(50) NOT NULL DEFAULT 'pending',
  "errorMessage" text,
  "createdAt" timestamp NOT NULL DEFAULT now()
);

