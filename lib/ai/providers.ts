import { gateway } from "@ai-sdk/gateway";
import {
  extractReasoningMiddleware,
  wrapLanguageModel,
} from "ai";

const THINKING_SUFFIX_REGEX = /-thinking$/;

export function getLanguageModel(modelId: string) {
  const isReasoningModel =
    modelId.includes("reasoning") || modelId.endsWith("-thinking");

  if (isReasoningModel) {
    const gatewayModelId = modelId.replace(THINKING_SUFFIX_REGEX, "");

    return wrapLanguageModel({
      model: gateway.languageModel(gatewayModelId),
      middleware: extractReasoningMiddleware({ tagName: "thinking" }),
    });
  }

  return gateway.languageModel(modelId);
}

export function getTitleModel() {
  return gateway.languageModel("anthropic/claude-haiku-4.5");
}

export function getArtifactModel() {
  return gateway.languageModel("anthropic/claude-haiku-4.5");
}
