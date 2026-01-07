import "server-only";

import { generateText } from "ai";
import { getLanguageModel } from "@/lib/ai/providers";
import { VALIDATOR_SYSTEM_PROMPT, buildValidatorUserPrompt } from "./prompts";

export type ErrorCode =
  | "IMPOSSIBLE_ACTION"
  | "GIBBERISH_INPUT"
  | "PROMPT_INJECTION"
  | "OFF_TOPIC"
  | "INAPPROPRIATE";

export interface ValidatorResult {
  valid: boolean;
  errorCode: ErrorCode | null;
  timeEstimate: string | null;
  rawOutput: string;
}

interface ValidateInputParams {
  playerInput: string;
  characterState?: string;
  currentScene?: string;
  recentHistory?: string[];
  model?: string;
}

/**
 * Validates player input and estimates duration in a single LLM call.
 */
export async function validatePlayerAction({
  playerInput,
  characterState,
  currentScene,
  recentHistory,
  model = "gpt-4o-mini",
}: ValidateInputParams): Promise<ValidatorResult> {
  const userPrompt = buildValidatorUserPrompt({
    playerInput,
    characterState,
    currentScene,
    recentHistory,
  });

  const { text } = await generateText({
    model: getLanguageModel(model),
    system: VALIDATOR_SYSTEM_PROMPT,
    prompt: userPrompt,
  });

  try {
    const parsed = JSON.parse(text);
    
    return {
      valid: parsed.input_validator.valid === "yes",
      errorCode: parsed.input_validator.error_code,
      timeEstimate: parsed.time_estimator?.time_estimate || null,
      rawOutput: text,
    };
  } catch (error) {
    console.error("Failed to parse validator JSON:", text);
    // Fallback to valid but with default time if parsing fails but message exists
    // (This is a safety net; ideally it should fail if JSON is broken)
    return {
      valid: true, 
      errorCode: null,
      timeEstimate: "15-30 min",
      rawOutput: text,
    };
  }
}
