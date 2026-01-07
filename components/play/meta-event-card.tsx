"use client";

import type { MetaEvent } from "@/lib/db/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface MetaEventCardProps {
  event: MetaEvent;
  onAccept: (eventId: string) => void;
  onReject: (eventId: string) => void;
  disabled?: boolean;
}

const TYPE_ICONS: Record<string, string> = {
  encounter: "👤",
  discovery: "🔍",
  hazard: "⚠️",
  opportunity: "✨",
};

const SEVERITY_COLORS: Record<string, string> = {
  minor: "bg-slate-500",
  moderate: "bg-amber-500",
  major: "bg-red-500",
};

export function MetaEventCard({
  event,
  onAccept,
  onReject,
  disabled = false,
}: MetaEventCardProps) {
  const isDecided = event.playerDecision !== null;
  const isAccepted = event.playerDecision === "accepted";
  const isRejected = event.playerDecision === "rejected";

  const probabilityPercent = Math.round(event.probability * 100);

  return (
    <Card
      className={cn(
        "transition-all duration-200",
        isAccepted && "border-green-500/50 bg-green-500/5",
        isRejected && "border-red-500/50 bg-red-500/5 opacity-60"
      )}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <span>{TYPE_ICONS[event.type] ?? "📌"}</span>
            {event.title}
          </CardTitle>
          <Badge variant="outline" className="shrink-0">
            {probabilityPercent}% chance
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{event.description}</p>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge className={cn("text-xs text-white", SEVERITY_COLORS[event.severity])}>
              {event.severity}
            </Badge>
            {event.triggersCombat && (
              <Badge variant="destructive" className="text-xs">
                Combat
              </Badge>
            )}
          </div>

          {!isDecided ? (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => onReject(event.id)}
                disabled={disabled}
                type="button"
              >
                <XIcon className="mr-1 h-3 w-3" />
                Reject
              </Button>
              <Button
                size="sm"
                onClick={() => onAccept(event.id)}
                disabled={disabled}
                type="button"
              >
                <CheckIcon className="mr-1 h-3 w-3" />
                Accept
              </Button>
            </div>
          ) : (
            <Badge variant={isAccepted ? "default" : "secondary"}>
              {isAccepted ? "Accepted" : "Rejected"}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
