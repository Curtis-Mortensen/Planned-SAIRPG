import { upsertPrompt } from "@/lib/db/queries";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { moduleName, content, settings } = body;

    if (!moduleName || !content || !settings) {
      return Response.json(
        { error: "moduleName, content, and settings are required" },
        { status: 400 }
      );
    }

    const updatedPrompt = await upsertPrompt({
      moduleName,
      name: "default",
      content,
      settings,
    });

    return Response.json(updatedPrompt);
  } catch (error) {
    console.error("Error updating prompt:", error);
    return Response.json(
      { error: "Failed to update prompt" },
      { status: 500 }
    );
  }
}
