export const calculateCost = ({
  model,
  tokensIn = 0,
  tokensOut = 0,
}: {
  model: string;
  tokensIn?: number;
  tokensOut?: number;
}): number => {
  // Pricing per 1M tokens (approximate as of early 2025)
  // Fallback to generously low pricing if unknown to avoid alarm
  let priceIn = 0.5; // $0.50 / 1M input
  let priceOut = 1.5; // $1.50 / 1M output

  const m = model.toLowerCase();

  if (m.includes("gpt-4o")) {
    priceIn = 2.5;
    priceOut = 10.0;
  } else if (m.includes("gpt-4")) {
    priceIn = 10.0;
    priceOut = 30.0;
  } else if (m.includes("gpt-3.5") || m.includes("turbo")) {
    priceIn = 0.5;
    priceOut = 1.5;
  } else if (m.includes("claude-3-5")) {
    priceIn = 3.0;
    priceOut = 15.0; // Sonnet
  } else if (m.includes("claude-3-opus")) {
    priceIn = 15.0;
    priceOut = 75.0;
  } else if (m.includes("claude-3-haiku")) {
    priceIn = 0.25;
    priceOut = 1.25;
  }

  const cost = (tokensIn / 1_000_000) * priceIn + (tokensOut / 1_000_000) * priceOut;
  return cost;
};
