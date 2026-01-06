import { upsertPrompt } from "@/lib/db/queries";
import {
  NARRATOR_DEFAULT_PROMPT,
  NARRATOR_DEFAULT_SETTINGS,
  NARRATOR_DEFAULT_LORE,
} from "@/lib/db/prompts/narrator-default";
import { NextResponse } from "next/server";

export async function POST() {
  try {
    // Initialize the narrator prompt with default settings
    const prompt = await upsertPrompt({
      moduleName: "narrator",
      name: "default",
      content: NARRATOR_DEFAULT_PROMPT,
      settings: {
        ...NARRATOR_DEFAULT_SETTINGS,
        lore: NARRATOR_DEFAULT_LORE,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Narrator prompt initialized successfully",
      prompt,
    });
  } catch (error) {
    console.error("Error seeding narrator prompt:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to seed narrator prompt",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
