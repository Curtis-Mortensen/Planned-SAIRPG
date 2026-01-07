"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import type { EventLog } from "@/lib/db/schema";
import { RefreshCcw, Loader2 } from "lucide-react";

export function EventLogTab() {
  const [events, setEvents] = useState<EventLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/event-log?limit=100");
      
      if (!response.ok) {
        throw new Error("Failed to fetch event logs");
      }

      const data = await response.json();
      setEvents(data.events ?? []);
      setTotalCount(data.pagination?.total ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      console.error("Error fetching event logs:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  const getEventColor = (eventType: string) => {
    if (eventType.includes("error")) return "destructive";
    if (eventType.includes("player")) return "default";
    if (eventType.includes("narrator")) return "secondary";
    if (eventType.includes("system")) return "outline";
    return "default";
  };

  return (
    <div className="flex flex-1 flex-col" data-testid="event-log-content">
      <div className="flex items-center justify-between gap-4 border-b p-4">
        <div className="flex flex-col gap-1">
          <h2 className="font-semibold text-lg">Event Log</h2>
          <p className="text-muted-foreground text-sm">
            {totalCount > 0 ? `${totalCount} total events` : "No events yet"}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchEvents}
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCcw className="h-4 w-4" />
          )}
        </Button>
      </div>

      {error && (
        <div className="mx-4 mt-4 rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {isLoading && events.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : events.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-4">
          <p className="text-center text-muted-foreground text-sm">
            No events yet. Events will appear here as the game progresses.
          </p>
          <p className="text-center text-muted-foreground text-xs">
            (In development, you can seed test data via /api/event-log/seed)
          </p>
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="flex flex-col gap-2 p-4">
            {events.map((event) => (
              <div
                key={event.id}
                className="flex flex-col gap-2 rounded-lg border bg-card p-3 transition-colors hover:bg-muted/50"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={getEventColor(event.eventType)}>
                      {event.eventType}
                    </Badge>
                    <span className="text-muted-foreground text-xs">
                      {event.moduleName}
                    </span>
                    {event.actor !== "system" && (
                      <span className="text-muted-foreground text-xs">
                        • {event.actor}
                      </span>
                    )}
                  </div>
                  <span className="text-muted-foreground text-xs whitespace-nowrap">
                    #{event.sequenceNum}
                  </span>
                </div>
                
                {event.payload && typeof event.payload === "object" ? (
                  <div className="rounded bg-muted/50 p-2 font-mono text-xs">
                    <pre className="whitespace-pre-wrap break-words">
                      {JSON.stringify(event.payload as Record<string, unknown>, null, 2)}
                    </pre>
                  </div>
                ) : null}

                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {new Date(event.createdAt).toLocaleString()}
                  </span>
                  {event.turnId && (
                    <span className="text-xs">Turn: {event.turnId.slice(0, 8)}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
