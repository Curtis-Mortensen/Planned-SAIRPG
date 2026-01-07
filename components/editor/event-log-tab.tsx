"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { EventLog } from "@/lib/db/schema";
import {
  RefreshCcw,
  Loader2,
  ChevronDown,
  ChevronRight,
  Filter,
  Clock,
  User,
  Cpu,
  MessageSquare,
} from "lucide-react";
import { getActiveGameAction } from "@/app/actions/games";

// Module colors for visual distinction
const MODULE_COLORS: Record<string, string> = {
  system: "bg-gray-500",
  narrator: "bg-purple-500",
  player: "bg-blue-500",
  meta_events: "bg-orange-500",
  time: "bg-green-500",
  npc: "bg-pink-500",
  loop_stack: "bg-yellow-500",
};

// Event type icons
const EVENT_TYPE_ICONS: Record<string, React.ReactNode> = {
  player_action: <User className="size-3" />,
  narrator_response: <MessageSquare className="size-3" />,
  system_event: <Cpu className="size-3" />,
  turn_start: <Clock className="size-3" />,
  turn_end: <Clock className="size-3" />,
};

function getModuleColor(moduleName: string): string {
  return MODULE_COLORS[moduleName] ?? "bg-slate-500";
}

function getEventIcon(eventType: string): React.ReactNode {
  return EVENT_TYPE_ICONS[eventType] ?? <ChevronRight className="size-3" />;
}

function formatTimestamp(timestamp: Date | string): string {
  const date = new Date(timestamp);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

// Expandable event item component
function EventItem({ event }: { event: EventLog }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const payload = event.payload as Record<string, unknown>;

  return (
    <div className="border-b border-border/50 last:border-0">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-start gap-2 p-3 text-left hover:bg-muted/50 transition-colors"
      >
        <div className="mt-1 text-muted-foreground">
          {isExpanded ? (
            <ChevronDown className="size-4" />
          ) : (
            <ChevronRight className="size-4" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge
              variant="secondary"
              className={`${getModuleColor(event.moduleName)} text-white text-xs`}
            >
              {event.moduleName}
            </Badge>
            <span className="font-medium text-sm">{event.eventType}</span>
            <span className="text-muted-foreground text-xs flex items-center gap-1">
              {getEventIcon(event.eventType)}
              {event.actor}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
            <Clock className="size-3" />
            {formatTimestamp(event.createdAt)}
          </div>
        </div>
      </button>
      {isExpanded && (
        <div className="px-8 pb-3">
          <div className="rounded-md bg-muted/50 p-3">
            <div className="text-xs text-muted-foreground mb-2">
              Event ID: {event.id.slice(0, 8)}... | Seq: #{event.sequenceNum}
            </div>
            <pre className="text-xs overflow-x-auto whitespace-pre-wrap break-all">
              {JSON.stringify(payload, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

export function EventLogTab() {
  const [events, setEvents] = useState<EventLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [activeGameId, setActiveGameId] = useState<string | null>(null);
  const [isLoadingGame, setIsLoadingGame] = useState(true);
  const [filters, setFilters] = useState({
    moduleName: "all",
    eventType: "all",
  });

  // Fetch active game on mount with proper error handling
  useEffect(() => {
    let isMounted = true;
    
    const fetchActiveGame = async () => {
      try {
        const game = await getActiveGameAction();
        if (isMounted) {
          setActiveGameId(game?.id ?? null);
          setIsLoadingGame(false);
        }
      } catch (err) {
        console.error("Error fetching active game:", err);
        if (isMounted) {
          setActiveGameId(null);
          setIsLoadingGame(false);
          // Don't show error - just show "No active game" state
        }
      }
    };
    
    fetchActiveGame();
    
    return () => {
      isMounted = false;
    };
  }, []);

  const fetchEvents = useCallback(async () => {
    if (!activeGameId) {
      setEvents([]);
      setTotalCount(0);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("gameId", activeGameId);
      if (filters.moduleName !== "all") params.set("moduleName", filters.moduleName);
      if (filters.eventType !== "all") params.set("eventType", filters.eventType);
      params.set("limit", "100");

      const response = await fetch(`/api/event-log?${params.toString()}`);

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
  }, [activeGameId, filters]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  return (
    <div className="flex flex-1 flex-col" data-testid="event-log-content">
      <div className="flex flex-col gap-3 border-b p-4">
        <div className="flex items-center justify-between gap-4">
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
        <div className="flex items-center gap-2">
          <Filter className="size-4 text-muted-foreground" />
          <Select
            value={filters.moduleName}
            onValueChange={(value) =>
              setFilters((prev) => ({ ...prev, moduleName: value }))
            }
          >
            <SelectTrigger className="h-8 w-28 text-xs">
              <SelectValue placeholder="Module" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Modules</SelectItem>
              <SelectItem value="system">System</SelectItem>
              <SelectItem value="narrator">Narrator</SelectItem>
              <SelectItem value="player">Player</SelectItem>
              <SelectItem value="meta_events">Meta Events</SelectItem>
              <SelectItem value="time">Time</SelectItem>
              <SelectItem value="loop_stack">Loop Stack</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={filters.eventType}
            onValueChange={(value) =>
              setFilters((prev) => ({ ...prev, eventType: value }))
            }
          >
            <SelectTrigger className="h-8 w-32 text-xs">
              <SelectValue placeholder="Event Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="player_action">Player Action</SelectItem>
              <SelectItem value="narrator_response">Narrator Response</SelectItem>
              <SelectItem value="system_event">System Event</SelectItem>
              <SelectItem value="turn_start">Turn Start</SelectItem>
              <SelectItem value="turn_end">Turn End</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-4 rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {(isLoadingGame || isLoading) && events.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : !activeGameId ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-4">
          <MessageSquare className="size-8 text-muted-foreground" />
          <p className="text-center text-muted-foreground text-sm">
            No active game
          </p>
          <p className="text-center text-muted-foreground text-xs">
            Start a game to see events here
          </p>
        </div>
      ) : events.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-4">
          <MessageSquare className="size-8 text-muted-foreground" />
          <p className="text-center text-muted-foreground text-sm">
            No events recorded yet
          </p>
          <p className="text-center text-muted-foreground text-xs">
            Events will appear here as the game progresses
          </p>
        </div>
      ) : (
        <ScrollArea className="flex-1">
          {events.map((event) => (
            <EventItem key={event.id} event={event} />
          ))}
        </ScrollArea>
      )}
    </div>
  );
}
