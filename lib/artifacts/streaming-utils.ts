import type { UIMessageStreamWriter } from "ai";
import type { ChatMessage } from "../types";

/**
 * Helper function to process object streaming deltas (for code and sheet artifacts).
 * Extracts content from the delta stream and writes it to the data stream.
 * 
 * @param fullStream - The stream to iterate over
 * @param contentKey - The key to extract from the object (e.g., 'code', 'csv')
 * @param deltaType - The type of delta to write (e.g., 'data-codeDelta', 'data-sheetDelta')
 * @param dataStream - The data stream to write to
 * @returns The final accumulated content
 */
export async function processObjectStream<T extends Record<string, any>>(
  fullStream: AsyncIterable<any>,
  contentKey: keyof T,
  deltaType: string,
  dataStream: UIMessageStreamWriter<ChatMessage>
): Promise<string> {
  let draftContent = "";

  for await (const delta of fullStream) {
    const { type } = delta;

    if (type === "object") {
      const { object } = delta;
      const content = object[contentKey];

      if (content) {
        dataStream.write({
          type: deltaType,
          data: content,
          transient: true,
        });

        draftContent = content;
      }
    }
  }

  return draftContent;
}

/**
 * Helper function to process text streaming deltas (for text artifacts).
 * Accumulates text deltas and writes them to the data stream.
 * 
 * @param fullStream - The stream to iterate over
 * @param deltaType - The type of delta to write (e.g., 'data-textDelta')
 * @param dataStream - The data stream to write to
 * @returns The final accumulated content
 */
export async function processTextStream(
  fullStream: AsyncIterable<any>,
  deltaType: string,
  dataStream: UIMessageStreamWriter<ChatMessage>
): Promise<string> {
  let draftContent = "";

  for await (const delta of fullStream) {
    const { type } = delta;

    if (type === "text-delta") {
      const { text } = delta;

      draftContent += text;

      dataStream.write({
        type: deltaType,
        data: text,
        transient: true,
      });
    }
  }

  return draftContent;
}
