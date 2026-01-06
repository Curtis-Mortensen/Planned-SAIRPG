import type { InferSelectModel } from "drizzle-orm";
import {
  boolean,
  foreignKey,
  json,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar,
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

// Game Sessions
export const gameSession = pgTable("GameSession", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id),
  worldId: uuid("worldId"),
  title: text("title").notNull().default("Untitled Adventure"),
  branchId: uuid("branchId").defaultRandom(),
  parentBranchId: uuid("parentBranchId"),
  isActive: boolean("isActive").notNull().default(true),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export type GameSession = InferSelectModel<typeof gameSession>;

// Event Log: Append-only log of all game events
export const eventLog = pgTable("EventLog", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  sessionId: uuid("sessionId")
    .notNull()
    .references(() => gameSession.id, { onDelete: "cascade" }),
  branchId: uuid("branchId").notNull(),
  sequenceNum: text("sequenceNum").notNull(), // Using text for bigint compatibility
  turnId: uuid("turnId"),
  eventType: varchar("eventType", { length: 100 }).notNull(),
  moduleName: varchar("moduleName", { length: 100 }).notNull().default("system"),
  actor: varchar("actor", { length: 50 }).notNull().default("system"),
  payload: json("payload").notNull().default({}),
  parentEventId: uuid("parentEventId"),
  validFromBranch: uuid("validFromBranch"),
  invalidatedAtBranch: uuid("invalidatedAtBranch"),
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
  sessionId: uuid("sessionId").references(() => gameSession.id, { onDelete: "cascade" }),
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

// Branches: Track timeline branches for save/load/edit
export const branch = pgTable("Branch", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  sessionId: uuid("sessionId")
    .notNull()
    .references(() => gameSession.id, { onDelete: "cascade" }),
  parentBranchId: uuid("parentBranchId"),
  forkEventId: uuid("forkEventId").references(() => eventLog.id),
  name: varchar("name", { length: 255 }),
  description: text("description"),
  isActive: boolean("isActive").notNull().default(false),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
});

export type Branch = InferSelectModel<typeof branch>;
