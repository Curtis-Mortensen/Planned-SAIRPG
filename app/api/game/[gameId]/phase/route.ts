import { auth } from "@/app/(auth)/auth";
import { 
  getActivePendingAction, 
  getCurrentGamePhase,
  getGameById,
} from "@/lib/db/queries";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ gameId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { gameId } = await params;
  
  // CRITICAL: Verify user has access to this game
  const game = await getGameById(gameId);
  if (!game) {
    return Response.json({ error: "Game not found" }, { status: 404 });
  }
  
  // Check if user owns or has access to this game
  if (game.userId !== session.user.id) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  
  const phase = await getCurrentGamePhase(gameId);
  const pendingAction = await getActivePendingAction(gameId);

  return Response.json({
    phase,
    pendingActionId: pendingAction?.id ?? null,
    originalInput: pendingAction?.originalInput ?? null,
  });
}
