import { auth } from "@/app/(auth)/auth";
import { getEventLogCount, getEventLogs } from "@/lib/db/queries";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    // Accept gameId (new) or sessionId (legacy) for backward compatibility
    const gameId = searchParams.get("gameId") ?? searchParams.get("sessionId") ?? undefined;
    const eventType = searchParams.get("eventType") ?? undefined;
    const moduleName = searchParams.get("moduleName") ?? undefined;
    const limit = parseInt(searchParams.get("limit") ?? "50", 10);
    const offset = parseInt(searchParams.get("offset") ?? "0", 10);

    const [events, totalCount] = await Promise.all([
      getEventLogs({
        sessionId: gameId, // getEventLogs maps sessionId to gameId internally
        eventType,
        moduleName,
        limit,
        offset,
      }),
      getEventLogCount({ gameId }),
    ]);

    return NextResponse.json({
      events,
      pagination: {
        total: totalCount,
        limit,
        offset,
        hasMore: offset + events.length < totalCount,
      },
    });
  } catch (error) {
    console.error("Failed to fetch event logs:", error);
    return NextResponse.json(
      { error: "Failed to fetch event logs" },
      { status: 500 }
    );
  }
}
