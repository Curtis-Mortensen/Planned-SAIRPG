"use server";

import { auth } from "@/app/(auth)/auth";
import {
  getGameByChatId,
  getOrCreateActiveGame,
  getGames,
  getSavesByGame,
  createSave,
  deleteSave,
  getSaveById,
  updateSave,
  getMessagesByChatId,
  saveChat,
  saveMessages,
  copyEventsToSave,
  updateGame,
} from "@/lib/db/queries";
import type { SaveSlot } from "@/lib/db/schema";
import { ChatSDKError } from "@/lib/errors";
import { generateUUID } from "@/lib/utils";
import { getSessionStatsAction } from "./turns";

/**
 * Check if current game state is already saved
 * Returns true if there's an existing save with matching turn number and message count
 */
export async function isCurrentStateSavedAction(chatId: string): Promise<boolean> {
  try {
    const session = await auth();
    if (!session?.user) {
      return false;
    }

    // Look up the game by chatId
    const game = await getGameByChatId(chatId);
    if (!game) {
      return false;
    }

    // Verify the game belongs to the user
    if (game.userId !== session.user.id) {
      return false;
    }

    // Get current stats
    const stats = await getSessionStatsAction(chatId);
    const currentTurnNumber = String(stats.turnNumber);
    const currentMessageCount = String(stats.messageCount);

    // Get all saves for this game
    const saves = await getSavesByGame(game.id);

    // Check if any save matches the current state
    return saves.some(
      (save) =>
        save.turnNumber === currentTurnNumber &&
        save.messageCount === currentMessageCount
    );
  } catch (error) {
    console.error("Failed to check if current state is saved:", error);
    return false;
  }
}

/**
 * Save current game
 */
export async function saveGameAction(params: {
  chatId: string;
  name?: string;
}): Promise<{ success: boolean; save?: SaveSlot; error?: string }> {
  try {
    const session = await auth();
    if (!session?.user) {
      return {
        success: false,
        error: "Unauthorized",
      };
    }

    // Look up game by chatId to ensure we save to the correct game
    const game = await getGameByChatId(params.chatId);
    if (!game) {
      return {
        success: false,
        error: "No game found for this chat. Please start a new game first.",
      };
    }

    // Verify the game belongs to the current user
    if (game.userId !== session.user.id) {
      return {
        success: false,
        error: "Unauthorized",
      };
    }

    // Get current stats to determine turn number and message count
    const stats = await getSessionStatsAction(params.chatId);
    const turnNumber = String(stats.turnNumber);
    const messageCount = String(stats.messageCount);

    // Use default name if not provided
    const saveName = params.name || `Turn ${turnNumber}`;

    // Get messages from current chat
    const messages = await getMessagesByChatId({ id: params.chatId });

    // Create a NEW chat (copy messages from current chat)
    const copiedChatId = generateUUID();
    await saveChat({
      id: copiedChatId,
      userId: session.user.id,
      title: `Save: ${saveName}`,
      visibility: "private",
    });

    // Copy messages to the new chat
    const copiedMessages = messages.map((m) => ({
      ...m,
      id: generateUUID(),
      chatId: copiedChatId,
    }));
    await saveMessages({ messages: copiedMessages });

    // Create save with the copied chatId
    const newSave = await createSave({
      gameId: game.id,
      chatId: copiedChatId,
      name: saveName,
      turnNumber,
      messageCount,
    });

    // Copy events to the new save
    await copyEventsToSave({
      gameId: game.id,
      saveId: newSave.id,
    });

    return {
      success: true,
      save: newSave,
    };
  } catch (error) {
    console.error("Failed to save game:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to save game",
    };
  }
}

/**
 * Load a save (returns confirmation data, doesn't execute load)
 */
export async function prepareSaveLoadAction(
  saveId: string
): Promise<{
  save: SaveSlot;
  currentTurnNumber: number;
  willLoseProgress: boolean;
}> {
  try {
    const session = await auth();
    if (!session?.user) {
      throw new ChatSDKError("unauthorized:chat", "Unauthorized");
    }

    const save = await getSaveById(saveId);
    if (!save) {
      throw new ChatSDKError("not_found:database", "Save not found");
    }

    // Get current game
    const game = await getOrCreateActiveGame(session.user.id);
    
    // Get current stats from the game's active chat
    let currentTurnNumber = 0;
    if (game.chatId) {
      const stats = await getSessionStatsAction(game.chatId);
      currentTurnNumber = stats.turnNumber;
    }
    
    const saveTurnNumber = Number.parseInt(save.turnNumber, 10);

    // Check if loading will lose progress
    const willLoseProgress = currentTurnNumber > saveTurnNumber;

    return {
      save,
      currentTurnNumber,
      willLoseProgress,
    };
  } catch (error) {
    if (error instanceof ChatSDKError) {
      throw error;
    }
    throw new ChatSDKError(
      "bad_request:database",
      error instanceof Error ? error.message : "Failed to prepare save load"
    );
  }
}

/**
 * Execute the load (after confirmation)
 */
export async function loadSaveAction(params: {
  saveId: string;
  saveCurrentFirst?: boolean;
  currentSaveName?: string;
}): Promise<{ success: boolean; newChatId?: string; error?: string }> {
  try {
    const session = await auth();
    if (!session?.user) {
      return {
        success: false,
        error: "Unauthorized",
      };
    }

    const save = await getSaveById(params.saveId);
    if (!save) {
      return {
        success: false,
        error: "Save not found",
      };
    }

    // Get current game
    const game = await getOrCreateActiveGame(session.user.id);

    // If requested, save current state first
    if (params.saveCurrentFirst && game.chatId) {
      await saveGameAction({
        chatId: game.chatId,
        name: params.currentSaveName,
      });
    }

    // Get the save's chat messages
    const savedChatMessages = await getMessagesByChatId({ id: save.chatId });

    // Create a NEW chat copying from save's chat
    const newChatId = generateUUID();
    await saveChat({
      id: newChatId,
      userId: session.user.id,
      title: game.title,
      visibility: "private",
    });

    // Copy messages to the new chat
    const copiedMessages = savedChatMessages.map((m) => ({
      ...m,
      id: generateUUID(),
      chatId: newChatId,
    }));
    await saveMessages({ messages: copiedMessages });

    // Update game to use new chat
    await updateGame({
      gameId: save.gameId,
      chatId: newChatId,
    });

    return {
      success: true,
      newChatId,
    };
  } catch (error) {
    console.error("Failed to load save:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to load save",
    };
  }
}

/**
 * Get saves list for game by chatId
 * Looks up the game from the chatId and returns all saves for that game
 */
export async function getSavesAction(
  chatId: string
): Promise<SaveSlot[]> {
  try {
    const session = await auth();
    if (!session?.user) {
      return [];
    }

    // Look up the game by chatId
    const game = await getGameByChatId(chatId);
    if (!game) {
      return [];
    }

    // Verify the game belongs to the user
    if (game.userId !== session.user.id) {
      return [];
    }

    return getSavesByGame(game.id);
  } catch (error) {
    console.error("Failed to get saves:", error);
    return [];
  }
}

/**
 * Delete a save
 */
export async function deleteSaveAction(
  saveId: string
): Promise<{ success: boolean }> {
  try {
    const session = await auth();
    if (!session?.user) {
      return { success: false };
    }

    // Verify the save belongs to the user
    const save = await getSaveById(saveId);
    if (!save) {
      return { success: false };
    }

    // Verify the game belongs to the user
    const userGames = await getGames({ userId: session.user.id });
    const gameBelongsToUser = userGames.some((g) => g.id === save.gameId);
    
    if (!gameBelongsToUser) {
      return { success: false };
    }

    await deleteSave(saveId);
    return { success: true };
  } catch (error) {
    console.error("Failed to delete save:", error);
    return { success: false };
  }
}

/**
 * Update a save's name
 */
export async function updateSaveNameAction(params: {
  saveId: string;
  name: string;
}): Promise<{ success: boolean; save?: SaveSlot; error?: string }> {
  try {
    const session = await auth();
    if (!session?.user) {
      return {
        success: false,
        error: "Unauthorized",
      };
    }

    // Verify the save belongs to the user
    const save = await getSaveById(params.saveId);
    if (!save) {
      return {
        success: false,
        error: "Save not found",
      };
    }

    // Verify the game belongs to the user
    const userGames = await getGames({ userId: session.user.id });
    const gameBelongsToUser = userGames.some((g) => g.id === save.gameId);
    
    if (!gameBelongsToUser) {
      return {
        success: false,
        error: "Unauthorized",
      };
    }

    // Update the save
    const updatedSave = await updateSave({
      saveId: params.saveId,
      name: params.name,
    });

    return {
      success: true,
      save: updatedSave,
    };
  } catch (error) {
    console.error("Failed to update save name:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to update save name",
    };
  }
}
