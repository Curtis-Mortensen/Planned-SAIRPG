import { auth } from "@/app/(auth)/auth";
import { getEventLogCount, getEventLogs } from "@/lib/db/queries";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  // #region agent log
  await fetch('http://127.0.0.1:7242/ingest/46496f1f-bdea-4b20-8099-d4bdc456fe12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:5',message:'API route handler called',data:{url:request.url},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
  // #endregion
  const session = await auth();
  // #region agent log
  await fetch('http://127.0.0.1:7242/ingest/46496f1f-bdea-4b20-8099-d4bdc456fe12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:7',message:'Auth check result',data:{hasSession:!!session,hasUserId:!!session?.user?.id,userId:session?.user?.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion

  if (!session?.user?.id) {
    // #region agent log
    await fetch('http://127.0.0.1:7242/ingest/46496f1f-bdea-4b20-8099-d4bdc456fe12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:10',message:'Unauthorized - returning 401',data:{hasSession:!!session,hasUserId:!!session?.user?.id},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("sessionId") ?? undefined;
    const branchId = searchParams.get("branchId") ?? undefined;
    const eventType = searchParams.get("eventType") ?? undefined;
    const moduleName = searchParams.get("moduleName") ?? undefined;
    const limit = parseInt(searchParams.get("limit") ?? "50", 10);
    const offset = parseInt(searchParams.get("offset") ?? "0", 10);
    // #region agent log
    await fetch('http://127.0.0.1:7242/ingest/46496f1f-bdea-4b20-8099-d4bdc456fe12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:20',message:'Before database queries',data:{sessionId,branchId,limit,offset},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion

    const [events, totalCount] = await Promise.all([
      getEventLogs({
        sessionId,
        branchId,
        eventType,
        moduleName,
        limit,
        offset,
      }),
      getEventLogCount({ sessionId, branchId }),
    ]);
    // #region agent log
    await fetch('http://127.0.0.1:7242/ingest/46496f1f-bdea-4b20-8099-d4bdc456fe12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:32',message:'Database queries completed',data:{eventsCount:events.length,totalCount},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion

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
    // #region agent log
    await fetch('http://127.0.0.1:7242/ingest/46496f1f-bdea-4b20-8099-d4bdc456fe12',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'route.ts:45',message:'Error caught in API route',data:{errorType:error instanceof Error ? error.constructor.name : typeof error,errorMessage:error instanceof Error ? error.message : String(error),errorStack:error instanceof Error ? error.stack : undefined},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    console.error("Failed to fetch event logs:", error);
    return NextResponse.json(
      { error: "Failed to fetch event logs" },
      { status: 500 }
    );
  }
}
