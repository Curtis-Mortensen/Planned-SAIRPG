import { auth, signIn } from "@/app/(auth)/auth";
import { createEventLog, createGameSession } from "@/lib/db/queries";
import { generateUUID } from "@/lib/utils";
import { NextResponse } from "next/server";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { user } from "@/lib/db/schema";

// biome-ignore lint: Forbidden non-null assertion.
const client = postgres(process.env.POSTGRES_URL!);
const db = drizzle(client);

// Sample event data for testing
const SAMPLE_EVENTS = [
  {
    eventType: "session_start",
    moduleName: "system",
    actor: "system",
    payload: { message: "Game session initialized" },
  },
  {
    eventType: "player_action",
    moduleName: "player",
    actor: "player",
    payload: { action: "I look around the tavern, searching for anyone suspicious." },
  },
  {
    eventType: "narrator_response",
    moduleName: "narrator",
    actor: "narrator",
    payload: {
      narrative:
        "The tavern is dimly lit by flickering candles. In the corner, a hooded figure nurses a drink, their face hidden in shadow. Near the bar, a boisterous group of merchants argue loudly about trade routes.",
      signals: { suggested_actions: ["approach_hooded_figure", "join_merchants", "order_drink"] },
    },
  },
  {
    eventType: "turn_end",
    moduleName: "system",
    actor: "system",
    payload: { turn_number: 1, duration_ms: 2500 },
  },
  {
    eventType: "turn_start",
    moduleName: "system",
    actor: "system",
    payload: { turn_number: 2 },
  },
  {
    eventType: "player_action",
    moduleName: "player",
    actor: "player",
    payload: { action: "I approach the hooded figure cautiously." },
  },
  {
    eventType: "meta_event_proposed",
    moduleName: "meta_events",
    actor: "meta_events",
    payload: {
      event_name: "tavern_brawl",
      description: "A fight is about to break out among the merchants",
      priority: 2,
    },
  },
  {
    eventType: "narrator_response",
    moduleName: "narrator",
    actor: "narrator",
    payload: {
      narrative:
        "As you approach, the hooded figure looks up slightly. You catch a glimpse of piercing green eyes beneath the hood. 'You're either very brave or very foolish to approach me,' a feminine voice whispers. 'Sit. We have much to discuss—if you value your life.'",
      signals: { nest_status: "push", new_goal: "conversation_with_stranger" },
    },
  },
  {
    eventType: "loop_pushed",
    moduleName: "loop_stack",
    actor: "system",
    payload: { loop_id: "conv-001", goal: "conversation_with_stranger", depth: 1 },
  },
  {
    eventType: "time_advance",
    moduleName: "time",
    actor: "time",
    payload: { minutes_passed: 5, new_time: "evening" },
  },
];

export async function POST(request: Request) {
  let session = await auth();

  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/api/auth/guest?redirectUrl=/api/event-log/seed", request.url));
  }

  // Verify user exists in database, if not create a new guest user
  const [existingUser] = await db.select().from(user).where(eq(user.id, session.user.id)).limit(1);
  
  if (!existingUser) {
    // User doesn't exist, sign in as guest to create a new one
    await signIn("guest", { redirect: false });
    // Get the new session
    session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Failed to create guest user" }, { status: 500 });
    }
  }

  // Only allow in development
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json(
      { error: "Seed endpoint only available in development" },
      { status: 403 }
    );
  }

  try {
    // Create a test game session
    const gameSessionResult = await createGameSession({
      userId: session.user.id,
      title: "Test Adventure - Tavern Mystery",
    });

    const dummyBranchId = generateUUID(); // Legacy parameter, not used
    const turnId = generateUUID();

    // Create sample events
    const createdEvents = [];
    for (let i = 0; i < SAMPLE_EVENTS.length; i++) {
      const sampleEvent = SAMPLE_EVENTS[i];
      const event = await createEventLog({
        sessionId: gameSessionResult.id,
        branchId: dummyBranchId,
        sequenceNum: (i + 1).toString(),
        eventType: sampleEvent.eventType,
        moduleName: sampleEvent.moduleName,
        actor: sampleEvent.actor,
        payload: sampleEvent.payload,
      });
      createdEvents.push(event);
    }

    return NextResponse.json({
      message: "Seed data created successfully",
      session: gameSessionResult,
      eventsCreated: createdEvents.length,
    });
  } catch (error) {
    console.error("Failed to seed event logs:", error);
    
    // Check if this is a "user not found" error (either explicit or foreign key violation)
    const errorObj = error && typeof error === 'object' ? error : {};
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorCause = 'cause' in errorObj ? String(errorObj.cause) : '';
    const isChatSDKError = error && typeof error === 'object' && 'surface' in error && 'type' in error;
    const errorType = isChatSDKError ? (error as { type: string }).type : '';
    const errorSurface = isChatSDKError ? (error as { surface: string }).surface : '';
    const fullErrorText = `${errorMessage} ${errorCause}`.toLowerCase();
    
    if (
      (errorType === 'not_found' && errorSurface === 'database') ||
      fullErrorText.includes('does not exist in database') ||
      (fullErrorText.includes('foreign key constraint') && fullErrorText.includes('userid'))
    ) {
      return NextResponse.json(
        { 
          error: "User session is invalid", 
          details: "Your user account no longer exists in the database. Please sign out and sign in again to create a new account.",
          code: "USER_NOT_FOUND"
        },
        { status: 401 }
      );
    }
    
    return NextResponse.json(
      { 
        error: "Failed to seed event logs", 
        details: error instanceof Error ? error.message : String(error),
        cause: errorCause || undefined
      },
      { status: 500 }
    );
  }
}
