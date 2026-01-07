import type { ArtifactKind } from "@/components/artifact";
import {
  deleteDocumentsByIdAfterTimestamp,
  getDocumentsById,
  saveDocument,
} from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import {
  authenticateUser,
  authorizeResourceAccess,
  validateRequiredParams,
} from "@/lib/api/auth-helpers";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  const validation = validateRequiredParams({ id }, ["id"]);
  if (!validation.valid) return validation.error;

  const { session, error: authError } = await authenticateUser();
  if (authError) return authError;

  const documents = await getDocumentsById({ id: id as string });
  const [document] = documents;

  const { authorized, error: authzError } = authorizeResourceAccess(
    document?.userId,
    session.user.id!,
    "document"
  );
  if (!authorized) return authzError;

  return Response.json(documents, { status: 200 });
}

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  const validation = validateRequiredParams({ id }, ["id"]);
  if (!validation.valid) return validation.error;

  const { session, error: authError } = await authenticateUser();
  if (authError) return authError;

  const {
    content,
    title,
    kind,
  }: { content: string; title: string; kind: ArtifactKind } =
    await request.json();

  const documents = await getDocumentsById({ id: id as string });

  if (documents.length > 0) {
    const [doc] = documents;

    const { authorized, error: authzError } = authorizeResourceAccess(
      doc.userId,
      session.user.id!,
      "document"
    );
    if (!authorized) return authzError;
  }

  const document = await saveDocument({
    id: id as string,
    content,
    title,
    kind,
    userId: session.user.id!,
  });

  return Response.json(document, { status: 200 });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const timestamp = searchParams.get("timestamp");

  const validation = validateRequiredParams(
    { id, timestamp },
    ["id", "timestamp"]
  );
  if (!validation.valid) return validation.error;

  const { session, error: authError } = await authenticateUser();
  if (authError) return authError;

  const documents = await getDocumentsById({ id: id as string });
  const [document] = documents;

  const { authorized, error: authzError } = authorizeResourceAccess(
    document?.userId,
    session.user.id!,
    "document"
  );
  if (!authorized) return authzError;

  const documentsDeleted = await deleteDocumentsByIdAfterTimestamp({
    id: id as string,
    timestamp: new Date(timestamp as string),
  });

  return Response.json(documentsDeleted, { status: 200 });
}
