import { serve } from 'inngest/next';
import { inngest } from '@/lib/inngest/client';
import { gameLoopWorkflow, handleTurnFailure } from '@/lib/inngest/functions';

/**
 * This endpoint allows Inngest to invoke your functions.
 * It should be publicly accessible so Inngest can send events.
 */
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [gameLoopWorkflow, handleTurnFailure],
});
