"use client";

import { useState, useEffect, useCallback } from "react";
import { useGameStore } from "@/lib/stores/game-store";
import type { MetaEvent } from "@/lib/db/schema";
import { Button } from "@/components/ui/button";
import { MetaEventCard } from "./meta-event-card";
import { RefreshCwIcon, PlayIcon, Loader2Icon } from "lucide-react";
import { toast } from "@/components/toast";

interface MetaEventReviewProps {
  pendingActionId: string;
  originalInput: string;
  onComplete: () => void;
}

export function MetaEventReview({
  pendingActionId,
  originalInput,
  onComplete,
}: MetaEventReviewProps) {
  const [events, setEvents] = useState<MetaEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  // Fetch events on mount
  const fetchEvents = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/meta-events/${pendingActionId}`);
      if (!response.ok) throw new Error("Failed to fetch events");
      const data = await response.json();
      setEvents(data.events);
    } catch (error) {
      toast({
        type: "error",
        description: "Failed to load events",
      });
    } finally {
      setIsLoading(false);
    }
  }, [pendingActionId]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const handleDecision = async (eventId: string, decision: "accepted" | "rejected") => {
    setIsProcessing(true);
    try {
      const response = await fetch("/api/meta-events/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pendingActionId,
          action: "decide",
          eventId,
          decision,
        }),
      });

      if (!response.ok) throw new Error("Failed to save decision");

      // Update local state
      setEvents((prev) =>
        prev.map((e) =>
          e.id === eventId ? { ...e, playerDecision: decision as any } : e
        )
      );
    } catch (error) {
      toast({
        type: "error",
        description: "Failed to save decision",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRegenerate = async () => {
    setIsProcessing(true);
    try {
      // First mark as regenerating
      await fetch("/api/meta-events/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pendingActionId,
          action: "regenerate",
        }),
      });

      // Then generate new events
      const response = await fetch("/api/meta-events/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pendingActionId: pendingActionId,
          regenerate: true,
        }),
      });

      if (!response.ok) throw new Error("Failed to regenerate events");

      const data = await response.json();
      setEvents(data.events);

      toast({
        type: "success",
        description: "Events regenerated",
      });
    } catch (error) {
      toast({
        type: "error",
        description: "Failed to regenerate events",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirm = async () => {
    // Ensure all events have decisions
    const undecided = events.filter((e) => e.playerDecision === null);
    if (undecided.length > 0) {
      toast({
        type: "error",
        description: `Please accept or reject all events (${undecided.length} remaining)`,
      });
      return;
    }

    setIsProcessing(true);
    try {
      const response = await fetch("/api/meta-events/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pendingActionId,
          action: "confirm",
        }),
      });

      if (!response.ok) throw new Error("Failed to confirm");

      onComplete();
    } catch (error) {
      toast({
        type: "error",
        description: "Failed to confirm events",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const allDecided = events.every((e) => e.playerDecision !== null);
  const acceptedCount = events.filter((e) => e.playerDecision === "accepted").length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2Icon className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 border rounded-lg bg-card text-card-foreground shadow-sm">
      {/* Header */}
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Before you proceed...</h2>
        <p className="text-sm text-muted-foreground">
          While attempting to <span className="font-medium">{originalInput}</span>,
          the following events might occur. Accept or reject each possibility.
        </p>
      </div>

      {/* Event Cards */}
      <div className="space-y-3">
        {events.map((event) => (
          <MetaEventCard
            key={event.id}
            event={event}
            onAccept={(id) => handleDecision(id, "accepted")}
            onReject={(id) => handleDecision(id, "rejected")}
            disabled={isProcessing}
          />
        ))}
        {events.length === 0 && (
          <div className="text-center p-8 text-muted-foreground border-dashed border-2 rounded-lg">
            No events generated for this action.
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between border-t pt-4">
        <Button
          variant="outline"
          onClick={handleRegenerate}
          disabled={isProcessing}
          type="button"
        >
          <RefreshCwIcon className="mr-2 h-4 w-4" />
          Regenerate All
        </Button>

        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {acceptedCount} of {events.length} accepted
          </span>
          <Button
            onClick={handleConfirm}
            disabled={!allDecided || isProcessing}
            type="button"
          >
            {isProcessing ? (
              <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <PlayIcon className="mr-2 h-4 w-4" />
            )}
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}
