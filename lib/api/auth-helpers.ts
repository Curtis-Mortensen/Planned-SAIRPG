import type { Session } from "next-auth";
import { auth } from "@/app/(auth)/auth";
import { ChatSDKError } from "@/lib/errors";

/**
 * Authenticates the user and returns the session.
 * Returns an error response if authentication fails.
 */
export async function authenticateUser(): Promise<
  { session: Session; error?: never } | { session?: never; error: Response }
> {
  const session = await auth();

  if (!session?.user) {
    return {
      error: new ChatSDKError("unauthorized:api").toResponse(),
    };
  }

  return { session };
}

/**
 * Validates that a resource belongs to the authenticated user.
 * Returns an error response if validation fails.
 */
export function authorizeResourceAccess(
  resourceUserId: string | undefined | null,
  sessionUserId: string,
  resourceType: string = "resource"
): { authorized: true; error?: never } | { authorized: false; error: Response } {
  if (!resourceUserId) {
    return {
      authorized: false,
      error: new ChatSDKError(`not_found:${resourceType}`).toResponse(),
    };
  }

  if (resourceUserId !== sessionUserId) {
    return {
      authorized: false,
      error: new ChatSDKError(`forbidden:${resourceType}`).toResponse(),
    };
  }

  return { authorized: true };
}

/**
 * Validates that required parameters are present.
 * Returns an error response if validation fails.
 */
export function validateRequiredParams(
  params: Record<string, unknown>,
  requiredFields: string[]
): { valid: true; error?: never } | { valid: false; error: Response } {
  const missingFields = requiredFields.filter((field) => !params[field]);

  if (missingFields.length > 0) {
    const message =
      missingFields.length === 1
        ? `Parameter ${missingFields[0]} is required.`
        : `Parameters ${missingFields.join(", ")} are required.`;

    return {
      valid: false,
      error: new ChatSDKError("bad_request:api", message).toResponse(),
    };
  }

  return { valid: true };
}
