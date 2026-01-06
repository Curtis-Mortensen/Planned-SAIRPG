import { auth } from "@/app/(auth)/auth";
import { createEventLog, createGameSession } from "@/lib/db/queries";
import { generateUUID } from "@/lib/utils";
import { NextResponse } from "next/server";

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
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

    const branchId = gameSessionResult.branchId ?? generateUUID();
    const turnId = generateUUID();

    // Create sample events
    const createdEvents = [];
    for (let i = 0; i < SAMPLE_EVENTS.length; i++) {
      const sampleEvent = SAMPLE_EVENTS[i];
      const event = await createEventLog({
        sessionId: gameSessionResult.id,
        branchId,
        sequenceNum: (i + 1).toString(),
        turnId: sampleEvent.eventType.includes("turn") ? undefined : turnId,
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
    return NextResponse.json(
      { error: "Failed to seed event logs" },
      { status: 500 }
    );
  }
}
