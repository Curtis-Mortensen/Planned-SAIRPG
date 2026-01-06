import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { signIn, signOut } from "@/app/(auth)/auth";
import { isDevelopmentEnvironment } from "@/lib/constants";
import { getUserById } from "@/lib/db/queries";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const redirectUrl = searchParams.get("redirectUrl") || "/";
  const forceNewUser = searchParams.get("force") === "true";

  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
    secureCookie: !isDevelopmentEnvironment,
  });

  // If there's a token, verify the user actually exists in the database
  if (token?.id && !forceNewUser) {
    const existingUser = await getUserById(token.id as string);
    
    if (existingUser) {
      // User exists, redirect to home
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  // If we have a token but the user doesn't exist (or force is true),
  // we need to sign out first to clear the invalid session
  if (token) {
    await signOut({ redirect: false });
  }

  // No valid session or user doesn't exist - create a new guest user
  return signIn("guest", { redirect: true, redirectTo: redirectUrl });
}
