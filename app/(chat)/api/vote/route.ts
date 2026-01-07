import { getChatById, getVotesByChatId, voteMessage } from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import {
  authenticateUser,
  authorizeResourceAccess,
  validateRequiredParams,
} from "@/lib/api/auth-helpers";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const chatId = searchParams.get("chatId");

  const validation = validateRequiredParams({ chatId }, ["chatId"]);
  if (!validation.valid) return validation.error;

  const { session, error: authError } = await authenticateUser();
  if (authError) return authError;

  const chat = await getChatById({ id: chatId as string });

  const { authorized, error: authzError } = authorizeResourceAccess(
    chat?.userId,
    session.user.id,
    "vote"
  );
  if (!authorized) return authzError;

  const votes = await getVotesByChatId({ id: chatId as string });

  return Response.json(votes, { status: 200 });
}

export async function PATCH(request: Request) {
  const {
    chatId,
    messageId,
    type,
  }: { chatId: string; messageId: string; type: "up" | "down" } =
    await request.json();

  const validation = validateRequiredParams(
    { chatId, messageId, type },
    ["chatId", "messageId", "type"]
  );
  if (!validation.valid) return validation.error;

  const { session, error: authError } = await authenticateUser();
  if (authError) return authError;

  const chat = await getChatById({ id: chatId });

  const { authorized, error: authzError } = authorizeResourceAccess(
    chat?.userId,
    session.user.id,
    "vote"
  );
  if (!authorized) return authzError;

  await voteMessage({
    chatId,
    messageId,
    type,
  });

  return new Response("Message voted", { status: 200 });
}
