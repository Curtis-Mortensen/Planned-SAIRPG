import { auth } from "@/app/(auth)/auth";
import { generateMetaEvents } from "@/lib/meta-events/generator";
import {
  createMetaEvent,
  deleteMetaEventsByPendingAction,
  updatePendingActionPhase,
  getPendingActionById,
} from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";

interface GenerateRequestBody {
  pendingActionId: string;
  regenerate?: boolean; // If true, delete existing and regenerate
  // Optional context (can be fetched from game state if not provided)
  location?: string;
  timeOfDay?: string;
  recentEvents?: string[];
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  const body: GenerateRequestBody = await request.json();
  const { pendingActionId, regenerate, location, timeOfDay, recentEvents } = body;

  // Fetch the pending action
  const pendingAction = await getPendingActionById(pendingActionId);
  if (!pendingAction) {
    return Response.json(
      { error: "Pending action not found" },
      { status: 404 }
    );
  }

  // If regenerating, delete existing events first
  if (regenerate) {
    await deleteMetaEventsByPendingAction(pendingActionId);
  }

  // Generate new events
  const { events, rawOutput } = await generateMetaEvents({
    playerAction: pendingAction.originalInput,
    timeEstimate: pendingAction.timeEstimate ?? undefined,
    location,
    timeOfDay,
    recentEvents,
  });

  // Store generated events
  const storedEvents = await Promise.all(
    events.map((event, index) =>
      createMetaEvent({
        pendingActionId,
        sequenceNum: index,
        type: event.type,
        title: event.title,
        description: event.description,
        probability: event.probability,
        severity: event.severity,
        triggersCombat: event.triggersCombat,
      })
    )
  );

  // Update phase to meta_review
  await updatePendingActionPhase(pendingActionId, "meta_review");

  return Response.json({
    success: true,
    events: storedEvents,
    rawOutput, // For debugging/logging
  });
}
