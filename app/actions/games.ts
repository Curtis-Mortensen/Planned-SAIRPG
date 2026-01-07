"use server";

import { auth } from "@/app/(auth)/auth";
import {
  getGames,
  createGame,
  getGameById,
  getActiveGame,
  setActiveGame,
  updateGame,
  deleteGame,
  getGameByChatId,
  getSavesByGame,
  getSaveCountsByGameIds,
  getUserById,
  saveChat,
} from "@/lib/db/queries";
import type { GameSession } from "@/lib/db/schema";
import { ChatSDKError } from "@/lib/errors";
import { generateUUID } from "@/lib/utils";

export interface GameWithSaveCount extends GameSession {
  saveCount: number;
}

/**
 * Get all games for current user with save counts
 */
export async function getGamesAction(): Promise<GameWithSaveCount[]> {
  try {
    const session = await auth();
    if (!session?.user) {
      return [];
    }

    const games = await getGames({ userId: session.user.id });
    
    // Get save counts for all games in a single query (more efficient than N+1)
    const gameIds = games.map((g) => g.id);
    const saveCountsMap = await getSaveCountsByGameIds(gameIds);
    
    // Map save counts to games
    // Note: Games without saves won't be in the map, so default to 0
    const gamesWithCounts = games.map((game) => ({
      ...game,
      saveCount: saveCountsMap.get(game.id) ?? 0,
    }));

    return gamesWithCounts;
  } catch (error) {
    console.error("Failed to get games:", error);
    return [];
  }
}

/**
 * Create a new game
 */
export async function createGameAction(params: {
  title?: string;
}): Promise<{ success: boolean; game?: GameSession; chatId?: string; error?: string }> {
  try {
    const session = await auth();
    if (!session?.user) {
      return {
        success: false,
        error: "Unauthorized",
      };
    }

    // Verify user exists in database (handles stale session after DB reset)
    const existingUser = await getUserById(session.user.id);
    if (!existingUser) {
      // User ID from session doesn't exist in database
      // Return Unauthorized to trigger re-authentication flow
      return {
        success: false,
        error: "Unauthorized",
      };
    }

    // Create a new chat for the game
    const chatId = generateUUID();
    await saveChat({
      id: chatId,
      userId: session.user.id,
      title: params.title || "New Adventure",
      visibility: "private",
    });

    // Create the game with the chat
    const game = await createGame({
      userId: session.user.id,
      title: params.title || "New Adventure",
      chatId,
    });

    return {
      success: true,
      game,
      chatId,
    };
  } catch (error) {
    console.error("Failed to create game:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create game",
    };
  }
}

/**
 * Load a game (set as active)
 */
export async function loadGameAction(params: {
  gameId: string;
}): Promise<{ success: boolean; chatId?: string; error?: string }> {
  try {
    const session = await auth();
    if (!session?.user) {
      return {
        success: false,
        error: "Unauthorized",
      };
    }

    // Verify the game belongs to the user
    const game = await getGameById(params.gameId);
    if (!game) {
      return {
        success: false,
        error: "Game not found",
      };
    }

    if (game.userId !== session.user.id) {
      return {
        success: false,
        error: "Unauthorized",
      };
    }

    // Set as active game
    await setActiveGame({
      userId: session.user.id,
      gameId: params.gameId,
    });

    return {
      success: true,
      chatId: game.chatId ?? undefined,
    };
  } catch (error) {
    console.error("Failed to load game:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to load game",
    };
  }
}

/**
 * Delete a game
 */
export async function deleteGameAction(params: {
  gameId: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await auth();
    if (!session?.user) {
      return {
        success: false,
        error: "Unauthorized",
      };
    }

    // Verify the game belongs to the user
    const game = await getGameById(params.gameId);
    if (!game) {
      return {
        success: false,
        error: "Game not found",
      };
    }

    if (game.userId !== session.user.id) {
      return {
        success: false,
        error: "Unauthorized",
      };
    }

    await deleteGame(params.gameId);

    return {
      success: true,
    };
  } catch (error) {
    console.error("Failed to delete game:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete game",
    };
  }
}

/**
 * Rename a game
 */
export async function renameGameAction(params: {
  gameId: string;
  title: string;
}): Promise<{ success: boolean; game?: GameSession; error?: string }> {
  try {
    const session = await auth();
    if (!session?.user) {
      return {
        success: false,
        error: "Unauthorized",
      };
    }

    // Verify the game belongs to the user
    const game = await getGameById(params.gameId);
    if (!game) {
      return {
        success: false,
        error: "Game not found",
      };
    }

    if (game.userId !== session.user.id) {
      return {
        success: false,
        error: "Unauthorized",
      };
    }

    const updatedGame = await updateGame({
      gameId: params.gameId,
      title: params.title,
    });

    return {
      success: true,
      game: updatedGame,
    };
  } catch (error) {
    console.error("Failed to rename game:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to rename game",
    };
  }
}

/**
 * Get game by chatId
 */
export async function getGameByChatIdAction(
  chatId: string
): Promise<GameSession | null> {
  try {
    const session = await auth();
    if (!session?.user) {
      return null;
    }

    const game = await getGameByChatId(chatId);
    if (!game || game.userId !== session.user.id) {
      return null;
    }

    return game;
  } catch (error) {
    console.error("Failed to get game by chatId:", error);
    return null;
  }
}

/**
 * Get the currently active game for the user
 */
export async function getActiveGameAction(): Promise<GameSession | null> {
  try {
    const session = await auth();
    if (!session?.user) {
      return null;
    }

    const game = await getActiveGame(session.user.id);
    return game;
  } catch (error) {
    console.error("Failed to get active game:", error);
    return null;
  }
}

