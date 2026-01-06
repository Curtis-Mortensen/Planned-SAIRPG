import { inngest, GameEvents, PlayerActionEvent } from '@/lib/inngest/client';

/**
 * Trigger a player action to start the game loop workflow.
 * This should be called from your chat submission handler.
 */
export async function triggerGameTurn(payload: PlayerActionEvent) {
  try {
    const result = await inngest.send({
      name: GameEvents.PLAYER_ACTION_SUBMITTED,
      data: payload,
    });
    
    console.log('[GAME LOOP] Turn triggered:', result);
    return result;
  } catch (error) {
    console.error('[GAME LOOP] Error triggering turn:', error);
    throw error;
  }
}

/**
 * Fallback behavior when Inngest is unavailable.
 * This provides a simple narrative response without workflow orchestration.
 */
export async function generateNarrativeFallback(
  playerInput: string,
  verbosity: number = 3,
  tone: 'light' | 'mature' = 'mature',
  challenge: number = 3
): Promise<string> {
  // This is a simple fallback that generates a basic narrative
  // In production, this might call a simple LLM endpoint or static responses
  
  const toneDescriptor = tone === 'light' ? 'cheerful' : 'serious';
  const verbosityText = '...'.repeat(Math.min(verbosity, 3));
  
  return `[FALLBACK MODE] Your action: "${playerInput}" has been noted. The world around you shifts in a ${toneDescriptor} manner. Challenge level: ${challenge}/5 ${verbosityText}`;
}

/**
 * Get the status of a turn workflow (useful for polling)
 */
export async function getTurnStatus(turnId: string) {
  // This would query Inngest for the workflow status
  // Requires Inngest API integration
  console.log(`[GAME LOOP] Checking status for turn: ${turnId}`);
  return { status: 'pending' };
}
