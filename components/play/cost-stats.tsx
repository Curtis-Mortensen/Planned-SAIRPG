"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface CostStatsProps {
  chatId: string;
}

/**
 * Estimates chat cost based on message count and model usage
 * This is a placeholder implementation - real cost tracking would come from API responses
 * TODO: Integrate with actual token usage data from chat API responses
 */
function estimateCost(messageCount: number): {
  totalCost: number;
  messageCount: number;
  estimatedTokens: number;
} {
  // Rough estimation: ~100 tokens per message on average
  // Using a placeholder cost of $0.002 per 1K tokens (typical GPT-4 pricing)
  const estimatedTokens = messageCount * 100;
  const totalCost = (estimatedTokens / 1000) * 0.002;

  return {
    totalCost,
    messageCount,
    estimatedTokens,
  };
}

export function CostStats({ chatId }: CostStatsProps) {
  const [cost, setCost] = useState({
    totalCost: 0,
    messageCount: 0,
    estimatedTokens: 0,
  });

  // TODO: Replace with actual message count from chat context or API
  // For now, using a simple localStorage-based counter as placeholder
  useEffect(() => {
    const storageKey = `chat-message-count-${chatId}`;
    const storedCount = Number.parseInt(
      localStorage.getItem(storageKey) ?? "0",
      10
    );

    // Listen for storage events to update when messages are added
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === storageKey && event.newValue) {
        const messageCount = Number.parseInt(event.newValue, 10);
        const stats = estimateCost(messageCount);
        setCost(stats);
      }
    };

    window.addEventListener("storage", handleStorageChange);

    // Initial calculation
    const stats = estimateCost(storedCount);
    setCost(stats);

    // Poll for updates (can be replaced with proper event system later)
    const interval = setInterval(() => {
      const currentCount = Number.parseInt(
        localStorage.getItem(storageKey) ?? "0",
        10
      );
      if (currentCount !== storedCount) {
        const updatedStats = estimateCost(currentCount);
        setCost(updatedStats);
      }
    }, 2000);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      clearInterval(interval);
    };
  }, [chatId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold">Chat Cost</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Total Cost</span>
          <span className="text-sm font-medium">
            ${cost.totalCost.toFixed(4)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Messages</span>
          <span className="text-sm font-medium">{cost.messageCount}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Est. Tokens</span>
          <span className="text-sm font-medium">
            {cost.estimatedTokens.toLocaleString()}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

