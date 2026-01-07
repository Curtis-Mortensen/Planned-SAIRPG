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
    // Use Promise.allSettled for better error handling - allows partial success
    const [messagesResult, chatResult, costResult] = await Promise.allSettled([
      getMessagesByChatId({ id: chatId }),
      getChatById({ id: chatId }),
      getChatCost(chatId),
    ]);

    const messages = messagesResult.status === "fulfilled" ? messagesResult.value : [];
    const chat = chatResult.status === "fulfilled" ? chatResult.value : null;
    // Safely extract cost with type validation
    const cost = costResult.status === "fulfilled" && typeof costResult.value === "number" 
      ? costResult.value 
      : 0;

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

