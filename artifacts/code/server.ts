import { streamObject } from "ai";
import { z } from "zod";
import { codePrompt, updateDocumentPrompt } from "@/lib/ai/prompts";
import { getArtifactModel } from "@/lib/ai/providers";
import { createDocumentHandler } from "@/lib/artifacts/server";
import { processObjectStream } from "@/lib/artifacts/streaming-utils";

export const codeDocumentHandler = createDocumentHandler<"code">({
  kind: "code",
  onCreateDocument: async ({ title, dataStream }) => {
    const { fullStream } = streamObject({
      model: getArtifactModel(),
      system: codePrompt,
      prompt: title,
      schema: z.object({
        code: z.string(),
      }),
    });

    return processObjectStream(
      fullStream,
      "code",
      "data-codeDelta",
      dataStream
    );
  },
  onUpdateDocument: async ({ document, description, dataStream }) => {
    const { fullStream } = streamObject({
      model: getArtifactModel(),
      system: updateDocumentPrompt(document.content, "code"),
      prompt: description,
      schema: z.object({
        code: z.string(),
      }),
    });

    return processObjectStream(
      fullStream,
      "code",
      "data-codeDelta",
      dataStream
    );
  },
});
