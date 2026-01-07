import { auth } from "@/app/(auth)/auth";
import { getMetaEventsByPendingAction } from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ pendingActionId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  const { pendingActionId } = await params;
  const events = await getMetaEventsByPendingAction(pendingActionId);

  return Response.json({ events });
}
