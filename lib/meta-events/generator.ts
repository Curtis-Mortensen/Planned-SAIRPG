import "server-only";

import { generateText } from "ai";
import { getLanguageModel } from "@/lib/ai/providers";
import { META_EVENT_SYSTEM_PROMPT, buildMetaEventUserPrompt } from "./prompts";
import type { MetaEventType, SeverityLevel } from "@/lib/game-state/types";
import { META_EVENT_TYPES, SEVERITY_LEVELS } from "@/lib/game-state/types";

export interface GeneratedEvent {
  type: MetaEventType;
  title: string;
  description: string;
  probability: number;
  severity: SeverityLevel;
  triggersCombat: boolean;
}

interface GenerateMetaEventsInput {
  playerAction: string;
  timeEstimate?: string;
  location?: string;
  timeOfDay?: string;
  recentEvents?: string[];
  model?: string;
}

interface GenerateMetaEventsResult {
  events: GeneratedEvent[];
  rawOutput: string;
}

/**
 * Generates meta events using an LLM based on the player's intended action.
 * Returns 2-4 contextually appropriate events.
 */
export async function generateMetaEvents({
  playerAction,
  timeEstimate,
  location,
  timeOfDay,
  recentEvents,
  model = "gpt-4o-mini",
}: GenerateMetaEventsInput): Promise<GenerateMetaEventsResult> {
  const userPrompt = buildMetaEventUserPrompt({
    playerAction,
    timeEstimate,
    location,
    timeOfDay,
    recentEvents,
  });

  const { text } = await generateText({
    model: getLanguageModel(model),
    system: META_EVENT_SYSTEM_PROMPT,
    prompt: userPrompt,
  });

  // Parse the JSON response
  let parsed: { events: any[] };
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    console.error("Failed to parse meta event JSON:", text);
    throw new Error("Invalid response format from meta event generator");
  }
  
  if (!parsed.events || !Array.isArray(parsed.events)) {
    throw new Error("Meta event generator response missing events array");
  }

  // Validate and normalize events
  const events: GeneratedEvent[] = parsed.events.map((e: Record<string, unknown>) => ({
    type: validateEventType(e.type as string),
    title: String(e.title).slice(0, 255),
    description: String(e.description),
    probability: clampProbability(Number(e.probability)),
    severity: validateSeverity(e.severity as string),
    triggersCombat: Boolean(e.triggersCombat),
  }));

  return { events, rawOutput: text };
}

/**
 * Ensures event type is a valid MetaEventType
 */
function validateEventType(type: string): MetaEventType {
  if ((META_EVENT_TYPES as readonly string[]).includes(type)) {
    return type as MetaEventType;
  }
  return "encounter"; // Default
}

/**
 * Ensures severity is a valid SeverityLevel
 */
function validateSeverity(severity: string): SeverityLevel {
  if ((SEVERITY_LEVELS as readonly string[]).includes(severity)) {
    return severity as SeverityLevel;
  }
  return "minor"; // Default
}

/**
 * Clamps probability between 0 and 1
 */
function clampProbability(prob: number): number {
  if (isNaN(prob)) return 0.2;
  return Math.max(0, Math.min(1, prob));
}
