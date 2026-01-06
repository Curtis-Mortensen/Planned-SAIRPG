"use client";

import useSWR from "swr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getChatCostAction } from "@/app/actions/get-chat-cost";

interface CostStatsProps {
  chatId: string;
}

export function CostStats({ chatId }: CostStatsProps) {
  // Poll cost every 5 seconds to get updates as messages stream in
  const { data } = useSWR(
    ["chat-cost", chatId],
    ([_, id]) => getChatCostAction(id),
    {
      refreshInterval: 5000,
    }
  );
  const cost = typeof data === "number" ? data : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold">Chat Cost</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Total Cost</span>
          <span className="text-sm font-medium">
            ${cost.toFixed(4)}
          </span>
        </div>
        {/* We can re-add token counts/message counts if we fetch them from DB too later.
            For now, user just asked for cost to work. */}
      </CardContent>
    </Card>
  );
}

