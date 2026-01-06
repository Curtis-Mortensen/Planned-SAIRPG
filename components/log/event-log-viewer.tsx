"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Filter,
  Clock,
  User,
  Cpu,
  MessageSquare,
} from "lucide-react";
import type { EventLog } from "@/lib/db/schema";

interface EventLogViewerProps {
  sessionId?: string;
  branchId?: string;
  className?: string;
}

interface EventLogResponse {
  events: EventLog[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

const MODULE_COLORS: Record<string, string> = {
  system: "bg-gray-500",
  narrator: "bg-purple-500",
  player: "bg-blue-500",
  meta_events: "bg-orange-500",
  time: "bg-green-500",
  npc: "bg-pink-500",
  loop_stack: "bg-yellow-500",
};

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

interface EventItemProps {
  event: EventLog;
}

function EventItem({ event }: EventItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const payload = event.payload as Record<string, unknown>;

  return (
    <div className="border-b border-border/50 last:border-0">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-start gap-3 p-3 text-left hover:bg-muted/50 transition-colors"
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
            {event.turnId && (
              <span className="truncate">Turn: {event.turnId.slice(0, 8)}...</span>
            )}
          </div>
        </div>
      </button>
      {isExpanded && (
        <div className="px-10 pb-3">
          <div className="rounded-md bg-muted/50 p-3">
            <div className="text-xs text-muted-foreground mb-2">Event ID: {event.id}</div>
            <pre className="text-xs overflow-x-auto whitespace-pre-wrap break-all">
              {JSON.stringify(payload, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

export function EventLogViewer({
  sessionId,
  branchId,
  className,
}: EventLogViewerProps) {
  const [events, setEvents] = useState<EventLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({
    total: 0,
    limit: 50,
    offset: 0,
    hasMore: false,
  });
  const [filters, setFilters] = useState({
    moduleName: "all",
    eventType: "all",
  });

  const fetchEvents = useCallback(async (offset = 0) => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (sessionId) params.set("sessionId", sessionId);
      if (branchId) params.set("branchId", branchId);
      if (filters.moduleName !== "all") params.set("moduleName", filters.moduleName);
      if (filters.eventType !== "all") params.set("eventType", filters.eventType);
      params.set("limit", "50");
      params.set("offset", offset.toString());

      const response = await fetch(`/api/event-log?${params.toString()}`);

      if (!response.ok) {
        throw new Error("Failed to fetch event logs");
      }

      const data: EventLogResponse = await response.json();
      
      if (offset === 0) {
        setEvents(data.events);
      } else {
        setEvents((prev) => [...prev, ...data.events]);
      }
      setPagination(data.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, branchId, filters]);

  useEffect(() => {
    fetchEvents(0);
  }, [fetchEvents]);

  const handleLoadMore = () => {
    fetchEvents(pagination.offset + pagination.limit);
  };

  const handleRefresh = () => {
    fetchEvents(0);
  };

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Event Log</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={isLoading}
          >
            <RefreshCw className={`size-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>
        <div className="flex items-center gap-2 pt-2">
          <Filter className="size-4 text-muted-foreground" />
          <Select
            value={filters.moduleName}
            onValueChange={(value) =>
              setFilters((prev) => ({ ...prev, moduleName: value }))
            }
          >
            <SelectTrigger className="h-8 w-32 text-xs">
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
            <SelectTrigger className="h-8 w-36 text-xs">
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
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[500px]">
          {error ? (
            <div className="flex items-center justify-center h-40 text-destructive">
              {error}
            </div>
          ) : events.length === 0 && !isLoading ? (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
              <MessageSquare className="size-8 mb-2" />
              <p>No events recorded yet</p>
              <p className="text-xs">Events will appear here as you play</p>
            </div>
          ) : (
            <>
              {events.map((event) => (
                <EventItem key={event.id} event={event} />
              ))}
              {pagination.hasMore && (
                <div className="p-3 flex justify-center">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleLoadMore}
                    disabled={isLoading}
                  >
                    {isLoading ? "Loading..." : "Load More"}
                  </Button>
                </div>
              )}
            </>
          )}
          {isLoading && events.length === 0 && (
            <div className="flex items-center justify-center h-40">
              <RefreshCw className="size-6 animate-spin text-muted-foreground" />
            </div>
          )}
        </ScrollArea>
        <div className="border-t px-3 py-2 text-xs text-muted-foreground">
          {pagination.total} total events
        </div>
      </CardContent>
    </Card>
  );
}
