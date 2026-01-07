import { getSuggestionsByDocumentId } from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import {
  authenticateUser,
  authorizeResourceAccess,
  validateRequiredParams,
} from "@/lib/api/auth-helpers";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const documentId = searchParams.get("documentId");

  const validation = validateRequiredParams({ documentId }, ["documentId"]);
  if (!validation.valid) return validation.error;

  const { session, error: authError } = await authenticateUser();
  if (authError) return authError;

  const suggestions = await getSuggestionsByDocumentId({
    documentId: documentId as string,
  });

  const [suggestion] = suggestions;

  if (!suggestion) {
    return Response.json([], { status: 200 });
  }

  const { authorized, error: authzError } = authorizeResourceAccess(
    suggestion.userId,
    session.user.id!,
    "api"
  );
  if (!authorized) return authzError;

  return Response.json(suggestions, { status: 200 });
}
