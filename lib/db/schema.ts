import type { InferSelectModel } from "drizzle-orm";
import {
  boolean,
  foreignKey,
  integer,
  json,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uuid,
  varchar,
  index,
} from "drizzle-orm/pg-core";

export const user = pgTable("User", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  email: varchar("email", { length: 64 }).notNull(),
  password: varchar("password", { length: 64 }),
});

export type User = InferSelectModel<typeof user>;

export const chat = pgTable("Chat", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  createdAt: timestamp("createdAt").notNull(),
  title: text("title").notNull(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id),
  visibility: varchar("visibility", { enum: ["public", "private"] })
    .notNull()
    .default("private"),
});

export type Chat = InferSelectModel<typeof chat>;

// DEPRECATED: The following schema is deprecated and will be removed in the future.
// Read the migration guide at https://chat-sdk.dev/docs/migration-guides/message-parts
export const messageDeprecated = pgTable("Message", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  chatId: uuid("chatId")
    .notNull()
    .references(() => chat.id),
  role: varchar("role").notNull(),
  content: json("content").notNull(),
  createdAt: timestamp("createdAt").notNull(),
});

export type MessageDeprecated = InferSelectModel<typeof messageDeprecated>;

export const message = pgTable("Message_v2", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  chatId: uuid("chatId")
    .notNull()
    .references(() => chat.id),
  role: varchar("role").notNull(),
  parts: json("parts").notNull(),
  attachments: json("attachments").notNull(),
  createdAt: timestamp("createdAt").notNull(),
});

export type DBMessage = InferSelectModel<typeof message>;

// DEPRECATED: The following schema is deprecated and will be removed in the future.
// Read the migration guide at https://chat-sdk.dev/docs/migration-guides/message-parts
export const voteDeprecated = pgTable(
  "Vote",
  {
    chatId: uuid("chatId")
      .notNull()
      .references(() => chat.id),
    messageId: uuid("messageId")
      .notNull()
      .references(() => messageDeprecated.id),
    isUpvoted: boolean("isUpvoted").notNull(),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.chatId, table.messageId] }),
    };
  }
);

export type VoteDeprecated = InferSelectModel<typeof voteDeprecated>;

export const vote = pgTable(
  "Vote_v2",
  {
    chatId: uuid("chatId")
      .notNull()
      .references(() => chat.id),
    messageId: uuid("messageId")
      .notNull()
      .references(() => message.id),
    isUpvoted: boolean("isUpvoted").notNull(),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.chatId, table.messageId] }),
    };
  }
);

export type Vote = InferSelectModel<typeof vote>;

export const document = pgTable(
  "Document",
  {
    id: uuid("id").notNull().defaultRandom(),
    createdAt: timestamp("createdAt").notNull(),
    title: text("title").notNull(),
    content: text("content"),
    kind: varchar("text", { enum: ["text", "code", "image", "sheet"] })
      .notNull()
      .default("text"),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.id, table.createdAt] }),
    };
  }
);

export type Document = InferSelectModel<typeof document>;

export const suggestion = pgTable(
  "Suggestion",
  {
    id: uuid("id").notNull().defaultRandom(),
    documentId: uuid("documentId").notNull(),
    documentCreatedAt: timestamp("documentCreatedAt").notNull(),
    originalText: text("originalText").notNull(),
    suggestedText: text("suggestedText").notNull(),
    description: text("description"),
    isResolved: boolean("isResolved").notNull().default(false),
    userId: uuid("userId")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("createdAt").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id] }),
    documentRef: foreignKey({
      name: "Suggestion_document_fk",
      columns: [table.documentId, table.documentCreatedAt],
      foreignColumns: [document.id, document.createdAt],
    }),
  })
);

export type Suggestion = InferSelectModel<typeof suggestion>;

export const stream = pgTable(
  "Stream",
  {
    id: uuid("id").notNull().defaultRandom(),
    chatId: uuid("chatId").notNull(),
    createdAt: timestamp("createdAt").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id] }),
    chatRef: foreignKey({
      columns: [table.chatId],
      foreignColumns: [chat.id],
    }),
  })
);

export type Stream = InferSelectModel<typeof stream>;

// =============================================================================
// SAIRPG CORE TABLES
// =============================================================================

// Game Sessions (represents a Game in the new architecture)
export const gameSession = pgTable("GameSession", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id),
  title: text("title").notNull().default("Untitled Adventure"),
  chatId: uuid("chatId").references(() => chat.id, { onDelete: "set null" }), // The ACTIVE chat for this game
  isActive: boolean("isActive").notNull().default(true),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export type GameSession = InferSelectModel<typeof gameSession>;

// Event Log: Append-only log of all game events
export const eventLog = pgTable("EventLog", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  gameId: uuid("gameId")
    .notNull()
    .references(() => gameSession.id, { onDelete: "cascade" }),
  saveId: uuid("saveId").references(() => saveSlot.id, { onDelete: "cascade" }), // If this is a copied event for a save
  sequenceNum: text("sequenceNum").notNull(), // Using text for bigint compatibility
  eventType: varchar("eventType", { length: 100 }).notNull(),
  moduleName: varchar("moduleName", { length: 100 }).notNull().default("system"),
  actor: varchar("actor", { length: 50 }).notNull().default("system"),
  payload: json("payload").notNull().default({}),
  cost: text("cost"), // Storing as text for precision, similar to other numeric fields if needed, or real/numeric
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export type EventLog = InferSelectModel<typeof eventLog>;

// Prompts: Versioned prompts for all modules
export const prompt = pgTable("Prompt", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  moduleName: varchar("moduleName", { length: 100 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  version: text("version").notNull().default("1"),
  content: text("content").notNull(),
  settings: json("settings").notNull().default({}),
  isActive: boolean("isActive").notNull().default(true),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export type Prompt = InferSelectModel<typeof prompt>;

// Artifacts: Every AI call is logged for debugging/replay
export const artifact = pgTable("Artifact", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  gameId: uuid("gameId").references(() => gameSession.id, { onDelete: "cascade" }),
  eventId: uuid("eventId").references(() => eventLog.id, { onDelete: "set null" }),
  promptId: uuid("promptId").references(() => prompt.id, { onDelete: "set null" }),
  moduleName: varchar("moduleName", { length: 100 }).notNull(),
  model: varchar("model", { length: 100 }).notNull(),
  inputText: text("inputText").notNull(),
  outputText: text("outputText"),
  tokensIn: text("tokensIn"),
  tokensOut: text("tokensOut"),
  latencyMs: text("latencyMs"),
  costUsd: text("costUsd"),
  status: varchar("status", { length: 50 }).notNull().default("pending"),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export type Artifact = InferSelectModel<typeof artifact>;

// Save slots for player saves
export const saveSlot = pgTable("SaveSlot", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  gameId: uuid("gameId")
    .notNull()
    .references(() => gameSession.id, { onDelete: "cascade" }),
  chatId: uuid("chatId")
    .notNull()
    .references(() => chat.id, { onDelete: "cascade" }), // The COPIED chat with messages at save time
  name: varchar("name", { length: 255 }).notNull(),
  turnNumber: text("turnNumber").notNull(),
  messageCount: text("messageCount").notNull(), // Number of messages at save time
  description: text("description"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export type SaveSlot = InferSelectModel<typeof saveSlot>;

// =============================================================================
// GAME PHASE STATE MACHINE
// =============================================================================

export const gamePhaseEnum = pgEnum("game_phase", [
  "idle",
  "validating",
  "meta_proposal",
  "meta_review",
  "probability_roll",
  "in_meta_event",
  "in_combat",
  "resolving_action",
]);

export const metaEventTypeEnum = pgEnum("meta_event_type", [
  "encounter",
  "discovery",
  "hazard",
  "opportunity",
]);

export const severityLevelEnum = pgEnum("severity_level", [
  "minor",
  "moderate",
  "major",
]);

export const playerDecisionEnum = pgEnum("player_decision", [
  "accepted",
  "rejected",
]);

export const pendingAction = pgTable(
  "PendingAction",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    gameId: uuid("gameId")
      .notNull()
      .references(() => gameSession.id, { onDelete: "cascade" }),
    chatId: uuid("chatId")
      .notNull()
      .references(() => chat.id, { onDelete: "cascade" }),
    originalInput: text("originalInput").notNull(),
    timeEstimate: varchar("timeEstimate", { length: 50 }),
    phase: gamePhaseEnum("phase").notNull().default("validating"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
    completedAt: timestamp("completedAt"),
  },
  (table) => ({
    gameIdIdx: index("PendingAction_gameId_idx").on(table.gameId),
    chatIdIdx: index("PendingAction_chatId_idx").on(table.chatId),
    phaseIdx: index("PendingAction_phase_idx").on(table.phase),
  })
);

export type PendingAction = InferSelectModel<typeof pendingAction>;

export const metaEvent = pgTable(
  "MetaEvent",
  {
    id: uuid("id").primaryKey().notNull().defaultRandom(),
    pendingActionId: uuid("pendingActionId")
      .notNull()
      .references(() => pendingAction.id, { onDelete: "cascade" }),
    sequenceNum: integer("sequenceNum").notNull().default(0),
    type: metaEventTypeEnum("type").notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description").notNull(),
    probability: real("probability").notNull(),
    severity: severityLevelEnum("severity").notNull(),
    triggersCombat: boolean("triggersCombat").notNull().default(false),
    timeImpact: varchar("timeImpact", { length: 50 }),
    playerDecision: playerDecisionEnum("playerDecision"),
    rollResult: real("rollResult"),
    triggered: boolean("triggered"),
    resolvedAt: timestamp("resolvedAt"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
  },
  (table) => ({
    pendingActionIdIdx: index("MetaEvent_pendingActionId_idx").on(table.pendingActionId),
  })
);

export type MetaEvent = InferSelectModel<typeof metaEvent>;
