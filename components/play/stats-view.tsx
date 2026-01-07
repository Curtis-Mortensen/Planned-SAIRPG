"use client";

import useSWR from "swr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSessionStatsAction } from "@/app/actions/turns";
import { formatDistanceToNow } from "date-fns";

interface StatsViewProps {
  chatId: string;
}

export function StatsView({ chatId }: StatsViewProps) {
  // Poll stats every 5 seconds to get updates as messages stream in
  const { data } = useSWR(
    ["session-stats", chatId],
    ([_, id]) => getSessionStatsAction(id),
    {
      refreshInterval: 5000,
    }
  );

  const stats = data ?? {
    turnNumber: 0,
    totalCost: 0,
    messageCount: 0,
    lastActivity: null,
  };

  const lastActivityText = stats.lastActivity
    ? formatDistanceToNow(stats.lastActivity, { addSuffix: true })
    : "Never";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Game Statistics</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Current Turn</span>
            <span className="text-sm font-medium">{stats.turnNumber}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Total Cost</span>
            <span className="text-sm font-medium">
              ${stats.totalCost.toFixed(4)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Messages</span>
            <span className="text-sm font-medium">{stats.messageCount}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Last Activity</span>
            <span className="text-sm font-medium">{lastActivityText}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

