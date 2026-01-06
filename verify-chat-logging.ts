import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq, desc } from "drizzle-orm";
import { eventLog, user, gameSession } from "./lib/db/schema";
import "dotenv/config";

const client = postgres(process.env.POSTGRES_URL!);
const db = drizzle(client);

async function verifyChatLogging() {
  console.log("Starting verification...");

  // 1. Get a test user (or create one if needed - assuming a user exists for this test, or we pick a random one)
  // For simplicity, let's just pick the most recent user or a specific one if known. 
  // But since we can't easily mock auth() here without a full integration test, 
  // we might need to rely on the fact that existing tests/e2e might be better or 
  // we can create a script that just CHECKS the DB after manual usage.
  
  // However, I can try to simulate the DB state check part.
  
  console.log("Checking for recent event logs...");
  
  const recentEvents = await db.select().from(eventLog).orderBy(desc(eventLog.createdAt)).limit(10);
  
  if (recentEvents.length === 0) {
    console.log("No events found. Please interact with the chat manually first.");
    return;
  }
  
  console.log("Found recent events:");
  recentEvents.forEach(e => {
    console.log(`[${e.moduleName}] ${e.eventType}: ${JSON.stringify(e.payload)}`);
  });

  const hasSystemPrompt = recentEvents.some(e => e.eventType === "system_prompt");
  const hasPlayerAction = recentEvents.some(e => e.eventType === "player_action");
  const hasNarratorResponse = recentEvents.some(e => e.eventType === "narrator_response");

  console.log("\nVerification Results:");
  console.log(`System Prompt Logged: ${hasSystemPrompt ? "PASS" : "FAIL"}`);
  console.log(`Player Action Logged: ${hasPlayerAction ? "PASS" : "FAIL"}`);
  console.log(`Narrator Response Logged: ${hasNarratorResponse ? "PASS" : "FAIL"}`);
  
  if (hasSystemPrompt && hasPlayerAction && hasNarratorResponse) {
    console.log("\nALL CHECKS PASSED");
  } else {
    console.log("\nSOME CHECKS FAILED - Note: This might be expected if no chat occurred yet.");
  }
  
  process.exit(0);
}

verifyChatLogging().catch(console.error);
