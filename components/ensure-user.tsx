import { redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { getUserById } from "@/lib/db/queries";

/**
 * Server component that ensures the current session user exists in the database.
 * If no session exists or the user doesn't exist in the database, redirects to
 * create a new guest user.
 * 
 * This prevents the common issue where a JWT token contains a user ID that
 * no longer exists in the database (e.g., after database reset, user deletion, etc.)
 */
export async function EnsureUser() {
  const session = await auth();

  // No session at all - redirect to create guest user
  if (!session?.user?.id) {
    redirect("/api/auth/guest");
  }

  // Session exists - verify user is in database
  const existingUser = await getUserById(session.user.id);
  
  if (!existingUser) {
    // User ID in session doesn't exist in database
    // Redirect to guest endpoint which will clear the session and create a new user
    redirect("/api/auth/guest?force=true");
  }

  // User exists - render nothing (this is just a validation component)
  return null;
}
