CREATE TABLE IF NOT EXISTS "Artifact" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sessionId" uuid,
	"eventId" uuid,
	"promptId" uuid,
	"moduleName" varchar(100) NOT NULL,
	"model" varchar(100) NOT NULL,
	"inputText" text NOT NULL,
	"outputText" text,
	"tokensIn" text,
	"tokensOut" text,
	"latencyMs" text,
	"costUsd" text,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"errorMessage" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Branch" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sessionId" uuid NOT NULL,
	"parentBranchId" uuid,
	"forkEventId" uuid,
	"name" varchar(255),
	"description" text,
	"isActive" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "EventLog" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sessionId" uuid NOT NULL,
	"branchId" uuid NOT NULL,
	"sequenceNum" text NOT NULL,
	"turnId" uuid,
	"eventType" varchar(100) NOT NULL,
	"moduleName" varchar(100) DEFAULT 'system' NOT NULL,
	"actor" varchar(50) DEFAULT 'system' NOT NULL,
	"payload" json DEFAULT '{}'::json NOT NULL,
	"parentEventId" uuid,
	"validFromBranch" uuid,
	"invalidatedAtBranch" uuid,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "GameSession" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"worldId" uuid,
	"title" text DEFAULT 'Untitled Adventure' NOT NULL,
	"branchId" uuid DEFAULT gen_random_uuid(),
	"parentBranchId" uuid,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Prompt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"moduleName" varchar(100) NOT NULL,
	"name" varchar(255) NOT NULL,
	"version" text DEFAULT '1' NOT NULL,
	"content" text NOT NULL,
	"settings" json DEFAULT '{}'::json NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Artifact" ADD CONSTRAINT "Artifact_sessionId_GameSession_id_fk" FOREIGN KEY ("sessionId") REFERENCES "public"."GameSession"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Artifact" ADD CONSTRAINT "Artifact_eventId_EventLog_id_fk" FOREIGN KEY ("eventId") REFERENCES "public"."EventLog"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Artifact" ADD CONSTRAINT "Artifact_promptId_Prompt_id_fk" FOREIGN KEY ("promptId") REFERENCES "public"."Prompt"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Branch" ADD CONSTRAINT "Branch_sessionId_GameSession_id_fk" FOREIGN KEY ("sessionId") REFERENCES "public"."GameSession"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Branch" ADD CONSTRAINT "Branch_forkEventId_EventLog_id_fk" FOREIGN KEY ("forkEventId") REFERENCES "public"."EventLog"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "EventLog" ADD CONSTRAINT "EventLog_sessionId_GameSession_id_fk" FOREIGN KEY ("sessionId") REFERENCES "public"."GameSession"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "GameSession" ADD CONSTRAINT "GameSession_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "Chat" DROP COLUMN IF EXISTS "lastContext";