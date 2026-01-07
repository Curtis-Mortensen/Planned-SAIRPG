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
  isNull,
  lt,
  sql,
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
  metaEvent,
  type MetaEvent,
  pendingAction,
  type PendingAction,
  prompt,
  type Prompt,
  type Suggestion,
  stream,
  suggestion,
  type User,
  user,
  vote,
  saveSlot,
  type SaveSlot,
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

export async function getEventsByGame({
  gameId,
  limit = 100,
  offset = 0,
  eventType,
  moduleName,
}: {
  gameId: string;
  limit?: number;
  offset?: number;
  eventType?: string;
  moduleName?: string;
}) {
  try {
    const conditions: SQL<any>[] = [
      eq(eventLog.gameId, gameId),
      sql`${eventLog.saveId} IS NULL`, // Only live events
    ];
    
    if (eventType) {
      conditions.push(eq(eventLog.eventType, eventType));
    }
    if (moduleName) {
      conditions.push(eq(eventLog.moduleName, moduleName));
    }

    return await db
      .select()
      .from(eventLog)
      .where(and(...conditions))
      .orderBy(desc(eventLog.createdAt))
      .limit(limit)
      .offset(offset);
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get events by game"
    );
  }
}

export async function getEventsBySave({
  saveId,
  limit = 100,
  offset = 0,
}: {
  saveId: string;
  limit?: number;
  offset?: number;
}) {
  try {
    return await db
      .select()
      .from(eventLog)
      .where(eq(eventLog.saveId, saveId))
      .orderBy(desc(eventLog.createdAt))
      .limit(limit)
      .offset(offset);
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get events by save"
    );
  }
}

// Legacy function for backward compatibility
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
  // Map old parameters to new function
  if (sessionId) {
    return getEventsByGame({
      gameId: sessionId,
      limit,
      offset,
      eventType,
      moduleName,
    });
  }
  
  // Fallback: return empty array if no gameId provided
  return [];
}

export async function getChatCost(chatId: string) {
  try {
    // We need to sum up the cost column from eventLog
    // However, eventLog doesn't have a direct chatId column, it's in the payload
    // BUT, traversing JSON in SQL for summing might be slow or complex depending on indexed paths
    // A better approach for now might be to filter by sessionId if we can link it,
    // OR just use the payload filter.
    // Given the current architecture, we might have to rely on the fact that we put chatId in payload.

    // Drizzle approach with raw SQL for casting + summing text columns.
    // We use sql generic for the query.

    const result = await db.execute(
      sql`SELECT SUM(CAST(${eventLog.cost} AS REAL)) as total_cost FROM ${eventLog} WHERE ${eventLog.payload}->>'chatId' = ${chatId}`
    );

    return result[0]?.total_cost ?? 0;
  } catch (error) {
    console.warn("Failed to get chat cost:", error);
    return 0;
  }
}

export async function getEventLogCount({
  gameId,
  saveId,
}: {
  gameId?: string;
  saveId?: string;
}) {
  try {
    const conditions: SQL<any>[] = [];
    
    if (gameId) {
      conditions.push(eq(eventLog.gameId, gameId));
      conditions.push(sql`${eventLog.saveId} IS NULL`); // Only live events
    }
    if (saveId) {
      conditions.push(eq(eventLog.saveId, saveId));
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

export async function createEvent({
  gameId,
  saveId,
  sequenceNum,
  eventType,
  moduleName = "system",
  actor = "system",
  payload = {},
  cost,
}: {
  gameId: string;
  saveId?: string;
  sequenceNum: string;
  eventType: string;
  moduleName?: string;
  actor?: string;
  payload?: Record<string, unknown>;
  cost?: string; // Stored as text to match schema
}) {
  try {
    const [newEvent] = await db
      .insert(eventLog)
      .values({
        gameId,
        saveId,
        sequenceNum,
        eventType,
        moduleName,
        actor,
        payload,
        cost,
      })
      .returning();

    return newEvent;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      `Failed to create event: ${_error instanceof Error ? _error.message : String(_error)}`
    );
  }
}

// Legacy function for backward compatibility
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
  cost,
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
  cost?: string;
}) {
  return createEvent({
    gameId: sessionId,
    sequenceNum,
    eventType,
    moduleName,
    actor,
    payload,
    cost,
  });
}

export async function getGames({ userId }: { userId: string }) {
  try {
    return await db
      .select()
      .from(gameSession)
      .where(eq(gameSession.userId, userId))
      .orderBy(desc(gameSession.updatedAt));
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get games"
    );
  }
}

// Legacy function for backward compatibility
export async function getGameSessions({ userId }: { userId: string }) {
  return getGames({ userId });
}

export async function createGame({
  userId,
  title,
  chatId,
}: {
  userId: string;
  title?: string;
  chatId?: string;
}) {
  try {
    // Check if user exists before creating game
    const [existingUser] = await db.select().from(user).where(eq(user.id, userId)).limit(1);
    
    if (!existingUser) {
      throw new ChatSDKError(
        "not_found:database",
        `User with id ${userId} does not exist in database`
      );
    }

    // Set all other games to inactive
    await db
      .update(gameSession)
      .set({ isActive: false })
      .where(eq(gameSession.userId, userId));

    const [newGame] = await db
      .insert(gameSession)
      .values({
        userId,
        title: title ?? "Untitled Adventure",
        chatId,
        isActive: true,
      })
      .returning();

    return newGame;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      `Failed to create game: ${_error instanceof Error ? _error.message : String(_error)}`
    );
  }
}

// Legacy function for backward compatibility
export async function createGameSession({
  userId,
  title,
  worldId,
}: {
  userId: string;
  title?: string;
  worldId?: string;
}) {
  return createGame({ userId, title });
}

// ============================================================================
// Save System Queries
// ============================================================================

/**
 * Get game by chatId (the active chat for this game)
 */
export async function getGameByChatId(
  chatId: string
): Promise<GameSession | null> {
  try {
    const [game] = await db
      .select()
      .from(gameSession)
      .where(eq(gameSession.chatId, chatId))
      .limit(1);

    return game ?? null;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get game by chatId"
    );
  }
}

/**
 * Get game by ID
 */
export async function getGameById(
  gameId: string
): Promise<GameSession | null> {
  try {
    const [game] = await db
      .select()
      .from(gameSession)
      .where(eq(gameSession.id, gameId))
      .limit(1);

    return game ?? null;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get game by id"
    );
  }
}

/**
 * Get active game for a user
 */
export async function getActiveGame(
  userId: string
): Promise<GameSession | null> {
  try {
    const [game] = await db
      .select()
      .from(gameSession)
      .where(and(eq(gameSession.userId, userId), eq(gameSession.isActive, true)))
      .limit(1);

    return game ?? null;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get active game"
    );
  }
}

/**
 * Set active game for a user
 */
export async function setActiveGame({
  userId,
  gameId,
}: {
  userId: string;
  gameId: string;
}): Promise<void> {
  try {
    // Set all games to inactive
    await db
      .update(gameSession)
      .set({ isActive: false })
      .where(eq(gameSession.userId, userId));

    // Set the specified game to active
    await db
      .update(gameSession)
      .set({ isActive: true, updatedAt: new Date() })
      .where(eq(gameSession.id, gameId));
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to set active game"
    );
  }
}

/**
 * Update game fields
 */
export async function updateGame({
  gameId,
  title,
  chatId,
}: {
  gameId: string;
  title?: string;
  chatId?: string;
}): Promise<GameSession> {
  try {
    const updateData: { title?: string; chatId?: string; updatedAt: Date } = {
      updatedAt: new Date(),
    };
    if (title !== undefined) {
      updateData.title = title;
    }
    if (chatId !== undefined) {
      updateData.chatId = chatId;
    }

    const [updatedGame] = await db
      .update(gameSession)
      .set(updateData)
      .where(eq(gameSession.id, gameId))
      .returning();

    if (!updatedGame) {
      throw new ChatSDKError(
        "not_found:database",
        "Game not found"
      );
    }

    return updatedGame;
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      `Failed to update game: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Delete game and all associated data
 */
export async function deleteGame(gameId: string): Promise<void> {
  try {
    await db.delete(gameSession).where(eq(gameSession.id, gameId));
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to delete game"
    );
  }
}

// Legacy function for backward compatibility
export async function getGameSessionByChatId(
  chatId: string
): Promise<GameSession | null> {
  return getGameByChatId(chatId);
}

/**
 * Get or create active game for a user
 * Helper function for save/load operations
 */
export async function getOrCreateActiveGame(
  userId: string
): Promise<GameSession> {
  const games = await getGames({ userId });
  const activeGame = games.find((g) => g.isActive);

  if (activeGame) {
    return activeGame;
  }

  return createGame({
    userId,
    title: "New Adventure",
  });
}

// Legacy function for backward compatibility
export async function getOrCreateActiveGameSession(
  userId: string
): Promise<GameSession> {
  return getOrCreateActiveGame(userId);
}

// Save Slot Queries
export async function getSavesByGame(
  gameId: string
): Promise<SaveSlot[]> {
  try {
    return await db
      .select()
      .from(saveSlot)
      .where(eq(saveSlot.gameId, gameId))
      .orderBy(desc(saveSlot.createdAt));
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get saves by game"
    );
  }
}

export async function createSave(params: {
  gameId: string;
  chatId: string;
  name: string;
  turnNumber: string;
  messageCount: string;
  description?: string;
}): Promise<SaveSlot> {
  try {
    const [newSave] = await db
      .insert(saveSlot)
      .values({
        gameId: params.gameId,
        chatId: params.chatId,
        name: params.name,
        turnNumber: params.turnNumber,
        messageCount: params.messageCount,
        description: params.description,
      })
      .returning();

    return newSave;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      `Failed to create save: ${_error instanceof Error ? _error.message : String(_error)}`
    );
  }
}

/**
 * Copy events to a save snapshot
 */
export async function copyEventsToSave({
  gameId,
  saveId,
}: {
  gameId: string;
  saveId: string;
}): Promise<void> {
  try {
    // Get all live events for this game
    const liveEvents = await db
      .select()
      .from(eventLog)
      .where(and(
        eq(eventLog.gameId, gameId),
        sql`${eventLog.saveId} IS NULL`
      ));

    // Copy each event with the saveId set
    if (liveEvents.length > 0) {
      const copiedEvents = liveEvents.map((event) => ({
        gameId: event.gameId,
        saveId,
        sequenceNum: event.sequenceNum,
        eventType: event.eventType,
        moduleName: event.moduleName,
        actor: event.actor,
        payload: event.payload,
        cost: event.cost,
        createdAt: event.createdAt,
      }));

      await db.insert(eventLog).values(copiedEvents);
    }
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      `Failed to copy events to save: ${_error instanceof Error ? _error.message : String(_error)}`
    );
  }
}

// Legacy function for backward compatibility
export async function getSavesBySession(
  sessionId: string
): Promise<SaveSlot[]> {
  return getSavesByGame(sessionId);
}

export async function deleteSave(saveId: string): Promise<void> {
  try {
    await db.delete(saveSlot).where(eq(saveSlot.id, saveId));
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to delete save"
    );
  }
}

export async function getSaveById(saveId: string): Promise<SaveSlot | null> {
  try {
    const [save] = await db
      .select()
      .from(saveSlot)
      .where(eq(saveSlot.id, saveId))
      .limit(1);

    return save ?? null;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get save by id"
    );
  }
}

export async function updateSave(params: {
  saveId: string;
  name?: string;
  description?: string;
}): Promise<SaveSlot> {
  try {
    const updateData: { name?: string; description?: string } = {};
    if (params.name !== undefined) {
      updateData.name = params.name;
    }
    if (params.description !== undefined) {
      updateData.description = params.description;
    }

    const [updatedSave] = await db
      .update(saveSlot)
      .set(updateData)
      .where(eq(saveSlot.id, params.saveId))
      .returning();

    if (!updatedSave) {
      throw new ChatSDKError(
        "not_found:database",
        "Save not found"
      );
    }

    return updatedSave;
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      `Failed to update save: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// Legacy turn number helper (now calculated from messages/events, not stored)
export async function getCurrentTurnNumber(
  gameId: string
): Promise<number> {
  // Turn number is now calculated from messages/events, not stored
  // This function is kept for backward compatibility but returns 0
  // The actual turn number should be calculated from message count or events
  return 0;
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

// =============================================================================
// PENDING ACTION QUERIES
// =============================================================================

/**
 * Get the active (non-completed) pending action for a game
 * There should only ever be one active pending action per game
 */
export async function getActivePendingAction(gameId: string) {
  const [result] = await db
    .select()
    .from(pendingAction)
    .where(
      and(
        eq(pendingAction.gameId, gameId),
        isNull(pendingAction.completedAt)
      )
    )
    .limit(1);
  return result ?? null;
}

/**
 * Get a pending action by ID
 */
export async function getPendingActionById(id: string) {
  const [result] = await db
    .select()
    .from(pendingAction)
    .where(eq(pendingAction.id, id))
    .limit(1);
  return result ?? null;
}

/**
 * Create a new pending action
 * Throws if there's already an active pending action for this game
 */
export async function createPendingAction({
  gameId,
  chatId,
  originalInput,
  timeEstimate,
  phase = "validating",
}: {
  gameId: string;
  chatId: string;
  originalInput: string;
  timeEstimate?: string;
  phase?: string;
}) {
  const [result] = await db
    .insert(pendingAction)
    .values({
      gameId,
      chatId,
      originalInput,
      timeEstimate,
      phase: phase as any,
    })
    .returning();
  return result;
}

/**
 * Update a pending action's phase
 */
export async function updatePendingActionPhase(
  id: string,
  phase: string
) {
  const [result] = await db
    .update(pendingAction)
    .set({ 
      phase: phase as any, 
      updatedAt: new Date() 
    })
    .where(eq(pendingAction.id, id))
    .returning();
  return result;
}

/**
 * Mark a pending action as completed
 */
export async function completePendingAction(id: string) {
  const [result] = await db
    .update(pendingAction)
    .set({ 
      phase: "idle" as any,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(pendingAction.id, id))
    .returning();
  return result;
}

/**
 * Get the current game phase for a game
 * Returns "idle" if no active pending action
 */
export async function getCurrentGamePhase(gameId: string): Promise<string> {
  const active = await getActivePendingAction(gameId);
  return active?.phase ?? "idle";
}

// =============================================================================
// META EVENT QUERIES
// =============================================================================

/**
 * Get all meta events for a pending action, ordered by sequence
 */
export async function getMetaEventsByPendingAction(pendingActionId: string) {
  return db
    .select()
    .from(metaEvent)
    .where(eq(metaEvent.pendingActionId, pendingActionId))
    .orderBy(asc(metaEvent.sequenceNum));
}

/**
 * Get triggered (but not yet resolved) meta events
 */
export async function getTriggeredUnresolvedEvents(pendingActionId: string) {
  return db
    .select()
    .from(metaEvent)
    .where(
      and(
        eq(metaEvent.pendingActionId, pendingActionId),
        eq(metaEvent.triggered, true),
        isNull(metaEvent.resolvedAt)
      )
    )
    .orderBy(asc(metaEvent.sequenceNum));
}

/**
 * Get the next unresolved event for a pending action
 * Returns the first triggered but unresolved event by sequence number
 * This avoids drift issues from using an index counter
 */
export async function getNextUnresolvedEvent(pendingActionId: string) {
  const [result] = await db
    .select()
    .from(metaEvent)
    .where(
      and(
        eq(metaEvent.pendingActionId, pendingActionId),
        eq(metaEvent.triggered, true),
        isNull(metaEvent.resolvedAt)
      )
    )
    .orderBy(asc(metaEvent.sequenceNum))
    .limit(1);
  return result ?? null;
}

/**
 * Create a meta event (used by meta event proposal module)
 */
export async function createMetaEvent({
  pendingActionId,
  sequenceNum,
  type,
  title,
  description,
  probability,
  severity,
  triggersCombat = false,
  timeImpact,
}: {
  pendingActionId: string;
  sequenceNum: number;
  type: string;
  title: string;
  description: string;
  probability: number;
  severity: string;
  triggersCombat?: boolean;
  timeImpact?: string;
}) {
  const [result] = await db
    .insert(metaEvent)
    .values({
      pendingActionId,
      sequenceNum,
      type: type as any,
      title,
      description,
      probability,
      severity: severity as any,
      triggersCombat,
      timeImpact,
    })
    .returning();
  return result;
}

/**
 * Update a meta event's player decision (accept/reject)
 */
export async function updateMetaEventDecision(
  id: string,
  playerDecision: "accepted" | "rejected"
) {
  const [result] = await db
    .update(metaEvent)
    .set({ playerDecision: playerDecision as any })
    .where(eq(metaEvent.id, id))
    .returning();
  return result;
}

/**
 * Update a meta event after probability roll
 */
export async function updateMetaEventRoll(
  id: string,
  rollResult: number,
  triggered: boolean
) {
  const [result] = await db
    .update(metaEvent)
    .set({ rollResult, triggered })
    .where(eq(metaEvent.id, id))
    .returning();
  return result;
}

/**
 * Mark a meta event as resolved
 */
export async function resolveMetaEvent(id: string) {
  const [result] = await db
    .update(metaEvent)
    .set({ resolvedAt: new Date() })
    .where(eq(metaEvent.id, id))
    .returning();
  return result;
}

/**
 * Delete all meta events for a pending action (for regeneration)
 */
export async function deleteMetaEventsByPendingAction(pendingActionId: string) {
  await db
    .delete(metaEvent)
    .where(eq(metaEvent.pendingActionId, pendingActionId));
}
