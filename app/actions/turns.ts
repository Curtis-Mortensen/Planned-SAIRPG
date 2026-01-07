"use server";

import { getChatById, getChatCost, getMessagesByChatId } from "@/lib/db/queries";

/**
 * Get current session stats (turn count, cost, etc.)
 * Turn count is derived from counting user messages
 */
export async function getSessionStatsAction(chatId: string): Promise<{
  turnNumber: number;
  totalCost: number;
  messageCount: number;
  lastActivity: Date | null;
}> {
  try {
    const [messages, chat, cost] = await Promise.all([
      getMessagesByChatId({ id: chatId }),
      getChatById({ id: chatId }),
      getChatCost(chatId),
    ]);

    // Derive turn count from user messages
    const turnNumber = messages.filter((m) => m.role === "user").length;

    // Get last activity from most recent message, or chat creation time
    const lastActivity =
      messages.length > 0
        ? messages[messages.length - 1]?.createdAt ?? null
        : chat?.createdAt ?? null;

    return {
      turnNumber,
      totalCost: cost,
      messageCount: messages.length,
      lastActivity,
    };
  } catch (error) {
    console.error("Failed to get session stats:", error);
    return {
      turnNumber: 0,
      totalCost: 0,
      messageCount: 0,
      lastActivity: null,
    };
  }
}

