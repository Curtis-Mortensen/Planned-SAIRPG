import { getPromptByModule } from "@/lib/db/queries";
import {
  NARRATOR_DEFAULT_PROMPT,
  NARRATOR_DEFAULT_SETTINGS,
  NARRATOR_DEFAULT_LORE,
} from "@/lib/db/prompts/narrator-default";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const moduleName = searchParams.get("module");

  if (!moduleName) {
    return Response.json(
      { error: "Module name is required" },
      { status: 400 }
    );
  }

  try {
    const promptData = await getPromptByModule(moduleName);

    // If no prompt exists in DB, return defaults for narrator module
    if (!promptData && moduleName === "narrator") {
      return Response.json({
        id: null,
        moduleName: "narrator",
        name: "default",
        version: "1",
        content: NARRATOR_DEFAULT_PROMPT,
        settings: {
          ...NARRATOR_DEFAULT_SETTINGS,
          lore: NARRATOR_DEFAULT_LORE,
          openingScene: NARRATOR_DEFAULT_SETTINGS.openingScene,
        },
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    if (!promptData) {
      return Response.json(
        { error: "Prompt not found" },
        { status: 404 }
      );
    }

    return Response.json(promptData);
  } catch (error) {
    console.error("Error fetching prompt:", error);
    return Response.json(
      { error: "Failed to fetch prompt" },
      { status: 500 }
    );
  }
}
