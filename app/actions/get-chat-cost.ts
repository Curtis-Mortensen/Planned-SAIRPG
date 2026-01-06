"use server";

import { getChatCost } from "@/lib/db/queries";

export async function getChatCostAction(chatId: string) {
  const cost = await getChatCost(chatId);
  return cost;
}
