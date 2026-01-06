import "server-only";

import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  lt,
  type SQL,
} from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { ArtifactKind } from "@/components/artifact";
import type { VisibilityType } from "@/components/visibility-selector";
import { ChatSDKError } from "../errors";
import { generateUUID } from "../utils";
import {
  type Chat,
  chat,
  type DBMessage,
  document,
  eventLog,
  type EventLog,
  gameSession,
  type GameSession,
  message,
  prompt,
  type Prompt,
  type Suggestion,
  stream,
  suggestion,
  type User,
  user,
  vote,
} from "./schema";
import { generateHashedPassword } from "./utils";

// Optionally, if not using email/pass login, you can
// use the Drizzle adapter for Auth.js / NextAuth
// https://authjs.dev/reference/adapter/drizzle

// biome-ignore lint: Forbidden non-null assertion.
const client = postgres(process.env.POSTGRES_URL!);
const db = drizzle(client);

export async function getUser(email: string): Promise<User[]> {
  try {
    return await db.select().from(user).where(eq(user.email, email));
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get user by email"
    );
  }
}

export async function createUser(email: string, password: string) {
  const hashedPassword = generateHashedPassword(password);

  try {
    return await db.insert(user).values({ email, password: hashedPassword });
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to create user");
  }
}

export async function createGuestUser() {
  const email = `guest-${Date.now()}`;
  const password = generateHashedPassword(generateUUID());

  try {
    return await db.insert(user).values({ email, password }).returning({
      id: user.id,
      email: user.email,
    });
  } catch (error) {
    throw new ChatSDKError(
      "bad_request:database",
      `Failed to create guest user: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export async function getUserById(id: string): Promise<User | null> {
  try {
    const [existingUser] = await db
      .select()
      .from(user)
      .where(eq(user.id, id))
      .limit(1);
    return existingUser || null;
  } catch (_error) {
    // Return null instead of throwing - the user simply doesn't exist
    return null;
  }
}

export async function saveChat({
  id,
  userId,
  title,
  visibility,
}: {
  id: string;
  userId: string;
  title: string;
  visibility: VisibilityType;
}) {
  try {
    // Check if user exists before creating chat
    const [existingUser] = await db.select().from(user).where(eq(user.id, userId)).limit(1);
    
    if (!existingUser) {
      throw new ChatSDKError(
        "not_found:database",
        `User with id ${userId} does not exist in database. Please sign out and sign in again.`
      );
    }

    return await db.insert(chat).values({
      id,
      createdAt: new Date(),
      userId,
      title,
      visibility,
    });
  } catch (error) {
    // If it's already a ChatSDKError, re-throw it
    if (error instanceof ChatSDKError) {
      throw error;
    }
    
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Handle duplicate key error gracefully (race condition)
    if (errorMessage.includes("duplicate key") || errorMessage.includes("unique constraint")) {
      // Chat already exists, which is fine - just return without error
      // This can happen in race conditions where two requests try to create the same chat
      return;
    }
    
    throw new ChatSDKError(
      "bad_request:database",
      `Failed to save chat: ${errorMessage}`
    );
  }
}

export async function deleteChatById({ id }: { id: string }) {
  try {
    await db.delete(vote).where(eq(vote.chatId, id));
    await db.delete(message).where(eq(message.chatId, id));
    await db.delete(stream).where(eq(stream.chatId, id));

    const [chatsDeleted] = await db
      .delete(chat)
      .where(eq(chat.id, id))
      .returning();
    return chatsDeleted;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to delete chat by id"
    );
  }
}

export async function deleteAllChatsByUserId({ userId }: { userId: string }) {
  try {
    const userChats = await db
      .select({ id: chat.id })
      .from(chat)
      .where(eq(chat.userId, userId));

    if (userChats.length === 0) {
      return { deletedCount: 0 };
    }

    const chatIds = userChats.map((c) => c.id);

    await db.delete(vote).where(inArray(vote.chatId, chatIds));
    await db.delete(message).where(inArray(message.chatId, chatIds));
    await db.delete(stream).where(inArray(stream.chatId, chatIds));

    const deletedChats = await db
      .delete(chat)
      .where(eq(chat.userId, userId))
      .returning();

    return { deletedCount: deletedChats.length };
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to delete all chats by user id"
    );
  }
}

export async function getChatsByUserId({
  id,
  limit,
  startingAfter,
  endingBefore,
}: {
  id: string;
  limit: number;
  startingAfter: string | null;
  endingBefore: string | null;
}) {
  try {
    const extendedLimit = limit + 1;

    const query = (whereCondition?: SQL<any>) =>
      db
        .select()
        .from(chat)
        .where(
          whereCondition
            ? and(whereCondition, eq(chat.userId, id))
            : eq(chat.userId, id)
        )
        .orderBy(desc(chat.createdAt))
        .limit(extendedLimit);

    let filteredChats: Chat[] = [];

    if (startingAfter) {
      const [selectedChat] = await db
        .select()
        .from(chat)
        .where(eq(chat.id, startingAfter))
        .limit(1);

      if (!selectedChat) {
        throw new ChatSDKError(
          "not_found:database",
          `Chat with id ${startingAfter} not found`
        );
      }

      filteredChats = await query(gt(chat.createdAt, selectedChat.createdAt));
    } else if (endingBefore) {
      const [selectedChat] = await db
        .select()
        .from(chat)
        .where(eq(chat.id, endingBefore))
        .limit(1);

      if (!selectedChat) {
        throw new ChatSDKError(
          "not_found:database",
          `Chat with id ${endingBefore} not found`
        );
      }

      filteredChats = await query(lt(chat.createdAt, selectedChat.createdAt));
    } else {
      filteredChats = await query();
    }

    const hasMore = filteredChats.length > limit;

    return {
      chats: hasMore ? filteredChats.slice(0, limit) : filteredChats,
      hasMore,
    };
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get chats by user id"
    );
  }
}

export async function getChatById({ id }: { id: string }) {
  try {
    const [selectedChat] = await db.select().from(chat).where(eq(chat.id, id));
    if (!selectedChat) {
      return null;
    }

    return selectedChat;
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to get chat by id");
  }
}

export async function saveMessages({ messages }: { messages: DBMessage[] }) {
  try {
    return await db.insert(message).values(messages);
  } catch (error) {
    throw new ChatSDKError(
      "bad_request:database",
      `Failed to save messages: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export async function updateMessage({
  id,
  parts,
}: {
  id: string;
  parts: DBMessage["parts"];
}) {
  try {
    return await db.update(message).set({ parts }).where(eq(message.id, id));
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to update message");
  }
}

export async function getMessagesByChatId({ id }: { id: string }) {
  try {
    return await db
      .select()
      .from(message)
      .where(eq(message.chatId, id))
      .orderBy(asc(message.createdAt));
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get messages by chat id"
    );
  }
}

export async function voteMessage({
  chatId,
  messageId,
  type,
}: {
  chatId: string;
  messageId: string;
  type: "up" | "down";
}) {
  try {
    const [existingVote] = await db
      .select()
      .from(vote)
      .where(and(eq(vote.messageId, messageId)));

    if (existingVote) {
      return await db
        .update(vote)
        .set({ isUpvoted: type === "up" })
        .where(and(eq(vote.messageId, messageId), eq(vote.chatId, chatId)));
    }
    return await db.insert(vote).values({
      chatId,
      messageId,
      isUpvoted: type === "up",
    });
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to vote message");
  }
}

export async function getVotesByChatId({ id }: { id: string }) {
  try {
    return await db.select().from(vote).where(eq(vote.chatId, id));
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get votes by chat id"
    );
  }
}

export async function saveDocument({
  id,
  title,
  kind,
  content,
  userId,
}: {
  id: string;
  title: string;
  kind: ArtifactKind;
  content: string;
  userId: string;
}) {
  try {
    return await db
      .insert(document)
      .values({
        id,
        title,
        kind,
        content,
        userId,
        createdAt: new Date(),
      })
      .returning();
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to save document");
  }
}

export async function getDocumentsById({ id }: { id: string }) {
  try {
    const documents = await db
      .select()
      .from(document)
      .where(eq(document.id, id))
      .orderBy(asc(document.createdAt));

    return documents;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get documents by id"
    );
  }
}

export async function getDocumentById({ id }: { id: string }) {
  try {
    const [selectedDocument] = await db
      .select()
      .from(document)
      .where(eq(document.id, id))
      .orderBy(desc(document.createdAt));

    return selectedDocument;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get document by id"
    );
  }
}

export async function deleteDocumentsByIdAfterTimestamp({
  id,
  timestamp,
}: {
  id: string;
  timestamp: Date;
}) {
  try {
    await db
      .delete(suggestion)
      .where(
        and(
          eq(suggestion.documentId, id),
          gt(suggestion.documentCreatedAt, timestamp)
        )
      );

    return await db
      .delete(document)
      .where(and(eq(document.id, id), gt(document.createdAt, timestamp)))
      .returning();
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to delete documents by id after timestamp"
    );
  }
}

export async function saveSuggestions({
  suggestions,
}: {
  suggestions: Suggestion[];
}) {
  try {
    return await db.insert(suggestion).values(suggestions);
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to save suggestions"
    );
  }
}

export async function getSuggestionsByDocumentId({
  documentId,
}: {
  documentId: string;
}) {
  try {
    return await db
      .select()
      .from(suggestion)
      .where(eq(suggestion.documentId, documentId));
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get suggestions by document id"
    );
  }
}

export async function getMessageById({ id }: { id: string }) {
  try {
    return await db.select().from(message).where(eq(message.id, id));
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get message by id"
    );
  }
}

export async function deleteMessagesByChatIdAfterTimestamp({
  chatId,
  timestamp,
}: {
  chatId: string;
  timestamp: Date;
}) {
  try {
    const messagesToDelete = await db
      .select({ id: message.id })
      .from(message)
      .where(
        and(eq(message.chatId, chatId), gte(message.createdAt, timestamp))
      );

    const messageIds = messagesToDelete.map(
      (currentMessage) => currentMessage.id
    );

    if (messageIds.length > 0) {
      await db
        .delete(vote)
        .where(
          and(eq(vote.chatId, chatId), inArray(vote.messageId, messageIds))
        );

      return await db
        .delete(message)
        .where(
          and(eq(message.chatId, chatId), inArray(message.id, messageIds))
        );
    }
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to delete messages by chat id after timestamp"
    );
  }
}

export async function updateChatVisibilityById({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: "private" | "public";
}) {
  try {
    return await db.update(chat).set({ visibility }).where(eq(chat.id, chatId));
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to update chat visibility by id"
    );
  }
}

export async function updateChatTitleById({
  chatId,
  title,
}: {
  chatId: string;
  title: string;
}) {
  try {
    return await db.update(chat).set({ title }).where(eq(chat.id, chatId));
  } catch (error) {
    console.warn("Failed to update title for chat", chatId, error);
    return;
  }
}

export async function getMessageCountByUserId({
  id,
  differenceInHours,
}: {
  id: string;
  differenceInHours: number;
}) {
  try {
    const twentyFourHoursAgo = new Date(
      Date.now() - differenceInHours * 60 * 60 * 1000
    );

    const [stats] = await db
      .select({ count: count(message.id) })
      .from(message)
      .innerJoin(chat, eq(message.chatId, chat.id))
      .where(
        and(
          eq(chat.userId, id),
          gte(message.createdAt, twentyFourHoursAgo),
          eq(message.role, "user")
        )
      )
      .execute();

    return stats?.count ?? 0;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get message count by user id"
    );
  }
}

export async function createStreamId({
  streamId,
  chatId,
}: {
  streamId: string;
  chatId: string;
}) {
  try {
    await db
      .insert(stream)
      .values({ id: streamId, chatId, createdAt: new Date() });
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to create stream id"
    );
  }
}

export async function getStreamIdsByChatId({ chatId }: { chatId: string }) {
  try {
    const streamIds = await db
      .select({ id: stream.id })
      .from(stream)
      .where(eq(stream.chatId, chatId))
      .orderBy(asc(stream.createdAt))
      .execute();

    return streamIds.map(({ id }) => id);
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get stream ids by chat id"
    );
  }
}

// =============================================================================
// SAIRPG Event Log Queries
// =============================================================================

export async function getEventLogs({
  sessionId,
  branchId,
  limit = 100,
  offset = 0,
  eventType,
  moduleName,
}: {
  sessionId?: string;
  branchId?: string;
  limit?: number;
  offset?: number;
  eventType?: string;
  moduleName?: string;
}) {
  try {
    const conditions: SQL<any>[] = [];
    
    if (sessionId) {
      conditions.push(eq(eventLog.sessionId, sessionId));
    }
    if (branchId) {
      conditions.push(eq(eventLog.branchId, branchId));
    }
    if (eventType) {
      conditions.push(eq(eventLog.eventType, eventType));
    }
    if (moduleName) {
      conditions.push(eq(eventLog.moduleName, moduleName));
    }

    const query = conditions.length > 0
      ? db
          .select()
          .from(eventLog)
          .where(and(...conditions))
          .orderBy(desc(eventLog.createdAt))
          .limit(limit)
          .offset(offset)
      : db
          .select()
          .from(eventLog)
          .orderBy(desc(eventLog.createdAt))
          .limit(limit)
          .offset(offset);

    return await query;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get event logs"
    );
  }
}

export async function getEventLogCount({
  sessionId,
  branchId,
}: {
  sessionId?: string;
  branchId?: string;
}) {
  try {
    const conditions: SQL<any>[] = [];
    
    if (sessionId) {
      conditions.push(eq(eventLog.sessionId, sessionId));
    }
    if (branchId) {
      conditions.push(eq(eventLog.branchId, branchId));
    }

    const result = conditions.length > 0
      ? await db
          .select({ count: count() })
          .from(eventLog)
          .where(and(...conditions))
      : await db.select({ count: count() }).from(eventLog);

    return result[0]?.count ?? 0;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get event log count"
    );
  }
}

export async function createEventLog({
  sessionId,
  branchId,
  sequenceNum,
  turnId,
  eventType,
  moduleName = "system",
  actor = "system",
  payload = {},
  parentEventId,
}: {
  sessionId: string;
  branchId: string;
  sequenceNum: string;
  turnId?: string;
  eventType: string;
  moduleName?: string;
  actor?: string;
  payload?: Record<string, unknown>;
  parentEventId?: string;
}) {
  try {
    const [newEvent] = await db
      .insert(eventLog)
      .values({
        sessionId,
        branchId,
        sequenceNum,
        turnId,
        eventType,
        moduleName,
        actor,
        payload,
        parentEventId,
        validFromBranch: branchId,
      })
      .returning();

    return newEvent;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      `Failed to create event log: ${_error instanceof Error ? _error.message : String(_error)}`
    );
  }
}

export async function getGameSessions({ userId }: { userId: string }) {
  try {
    return await db
      .select()
      .from(gameSession)
      .where(eq(gameSession.userId, userId))
      .orderBy(desc(gameSession.updatedAt));
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get game sessions"
    );
  }
}

export async function createGameSession({
  userId,
  title,
  worldId,
}: {
  userId: string;
  title?: string;
  worldId?: string;
}) {
  try {
    // Check if user exists before creating game session
    const [existingUser] = await db.select().from(user).where(eq(user.id, userId)).limit(1);
    
    if (!existingUser) {
      throw new ChatSDKError(
        "not_found:database",
        `User with id ${userId} does not exist in database`
      );
    }

    const [newSession] = await db
      .insert(gameSession)
      .values({
        userId,
        title: title ?? "Untitled Adventure",
        worldId,
      })
      .returning();

    return newSession;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      `Failed to create game session: ${_error instanceof Error ? _error.message : String(_error)}`
    );
  }
}

// ============================================================================
// Prompt Management
// ============================================================================

export async function getPromptByModule(
  moduleName: string,
  name = "default"
): Promise<Prompt | null> {
  try {
    const prompts = await db
      .select()
      .from(prompt)
      .where(
        and(
          eq(prompt.moduleName, moduleName),
          eq(prompt.name, name),
          eq(prompt.isActive, true)
        )
      )
      .orderBy(desc(prompt.version))
      .limit(1);

    return prompts[0] ?? null;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      `Failed to get prompt for module ${moduleName}: ${_error instanceof Error ? _error.message : String(_error)}`
    );
  }
}

export async function upsertPrompt({
  moduleName,
  name = "default",
  content,
  settings,
}: {
  moduleName: string;
  name?: string;
  content: string;
  settings: Record<string, unknown>;
}): Promise<Prompt> {
  try {
    // Check if prompt exists
    const existing = await getPromptByModule(moduleName, name);

    if (existing) {
      // Update existing prompt
      const [updated] = await db
        .update(prompt)
        .set({
          content,
          settings,
          updatedAt: new Date(),
        })
        .where(eq(prompt.id, existing.id))
        .returning();

      return updated;
    }

    // Create new prompt
    const [newPrompt] = await db
      .insert(prompt)
      .values({
        moduleName,
        name,
        content,
        settings,
        version: "1",
        isActive: true,
      })
      .returning();

    return newPrompt;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      `Failed to upsert prompt: ${_error instanceof Error ? _error.message : String(_error)}`
    );
  }
}
