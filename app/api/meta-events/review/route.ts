import { auth } from "@/app/(auth)/auth";
import {
  getPendingActionById,
  getMetaEventsByPendingAction,
  updateMetaEventDecision,
  updatePendingActionPhase,
} from "@/lib/db/queries";
import type { PlayerDecision } from "@/lib/game-state/types";
import { ChatSDKError } from "@/lib/errors";

interface ReviewRequestBody {
  pendingActionId: string;
  action: "decide" | "confirm" | "regenerate";
  // For "decide" action
  eventId?: string;
  decision?: PlayerDecision;
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  const body: ReviewRequestBody = await request.json();
  const { pendingActionId, action, eventId, decision } = body;

  // Fetch the pending action
  const pendingAction = await getPendingActionById(pendingActionId);
  if (!pendingAction) {
    return Response.json(
      { error: "Pending action not found" },
      { status: 404 }
    );
  }

  // Must be in meta_review phase
  if (pendingAction.phase !== "meta_review") {
    return Response.json(
      { error: "Not in review phase", currentPhase: pendingAction.phase },
      { status: 409 }
    );
  }

  switch (action) {
    case "decide": {
      // Update single event decision
      if (!eventId || !decision) {
        return Response.json(
          { error: "eventId and decision required for decide action" },
          { status: 400 }
        );
      }

      const updatedEvent = await updateMetaEventDecision(eventId, decision);
      return Response.json({ success: true, event: updatedEvent });
    }

    case "confirm": {
      // Player confirmed all decisions, move to probability_roll phase
      // The probability rolling is handled by a separate module/workflow
      await updatePendingActionPhase(pendingActionId, "probability_roll");

      // Get all events with their decisions for the response
      const events = await getMetaEventsByPendingAction(pendingActionId);

      return Response.json({
        success: true,
        phase: "probability_roll",
        events,
      });
    }

    case "regenerate": {
      // Move back to meta_proposal phase
      // The generate endpoint will handle deleting old events
      await updatePendingActionPhase(pendingActionId, "meta_proposal");

      return Response.json({
        success: true,
        phase: "meta_proposal",
      });
    }

    default:
      return Response.json(
        { error: "Invalid action" },
        { status: 400 }
      );
  }
}
