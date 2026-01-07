# Meta Event Module: Generator & Review - Implementation Spec

This document provides implementation instructions for the **Meta Event Generator** (LLM module) and **Meta Event Review UI**. This builds on the Game Phase State Machine foundation documented in `intercept_system_design.md`.

**Scope:** Only the proposal generation and review flow. Does NOT include probability rolling, event resolution, or combat.

---

## 1. Prerequisites

Before implementing this module, the following must exist (from state machine spec):
- `PendingAction` and `MetaEvent` database tables
- `lib/game-state/types.ts` with `GamePhase`, `MetaEventType`, etc.
- `lib/game-state/state-machine.ts` with transition helpers
- Pending action CRUD queries in `lib/db/queries.ts`

---

## 2. New Files to Create

```
lib/
├── meta-events/
│   ├── generator.ts           # LLM call for generating events
│   └── prompts.ts             # System prompt for meta event generation

app/
├── api/
│   └── meta-events/
│       ├── generate/
│       │   └── route.ts       # POST: generate events for pending action
│       └── review/
│           └── route.ts       # POST: accept/reject/confirm events

components/
├── play/
│   ├── meta-event-review.tsx  # Main review overlay component
│   └── meta-event-card.tsx    # Individual event card with accept/reject
```

---

## 3. Meta Event Generator

### File: `lib/meta-events/prompts.ts`

```typescript
/**
 * System prompt for the Meta Event Generator module.
 * This module suggests 2-4 events that could occur during a player action.
 */

export const META_EVENT_SYSTEM_PROMPT = `You are a Meta Event Generator for a solo RPG. Your job is to suggest interesting events that could happen to a player while they attempt an action.

Given the player's intended action and context, generate 2-4 possible events that could occur.

## Event Types
- **encounter**: Meeting someone or something (NPCs, creatures, travelers)
- **discovery**: Finding something interesting (items, locations, secrets)
- **hazard**: Danger or obstacle (weather, traps, hostile creatures)
- **opportunity**: Chance for unexpected benefit (shortcuts, allies, resources)

## Severity Levels
- **minor**: Brief distraction, small consequence (1-5 min in-game)
- **moderate**: Meaningful interruption, moderate consequence (5-30 min in-game)
- **major**: Significant event, major consequence (30+ min in-game)

## Output Format
Respond with valid JSON only. No markdown, no explanation.

{
  "events": [
    {
      "type": "encounter" | "discovery" | "hazard" | "opportunity",
      "title": "Short descriptive title (2-5 words)",
      "description": "One sentence describing what might happen",
      "probability": 0.1 to 0.5 (float, likelihood this occurs),
      "severity": "minor" | "moderate" | "major",
      "triggersCombat": false (boolean, true only for hostile encounters)
    }
  ]
}

## Guidelines
1. Events should be contextually appropriate to location, time, and action
2. Vary event types - don't suggest all encounters or all discoveries
3. Probability should reflect realism - rare events get 0.1-0.2, common 0.3-0.5
4. Most events should be minor or moderate; major events are rare
5. Only set triggersCombat:true for explicitly hostile situations
6. Keep descriptions intriguing but vague - details come during resolution
7. Consider the time of day, weather, and location danger level`;

export const buildMetaEventUserPrompt = ({
  playerAction,
  timeEstimate,
  location,
  timeOfDay,
  recentEvents,
}: {
  playerAction: string;
  timeEstimate?: string;
  location?: string;
  timeOfDay?: string;
  recentEvents?: string[];
}): string => {
  const parts = [
    `Player wants to: ${playerAction}`,
  ];

  if (timeEstimate) {
    parts.push(`Estimated duration: ${timeEstimate}`);
  }
  if (location) {
    parts.push(`Current location: ${location}`);
  }
  if (timeOfDay) {
    parts.push(`Time of day: ${timeOfDay}`);
  }
  if (recentEvents && recentEvents.length > 0) {
    parts.push(`Recent events: ${recentEvents.join("; ")}`);
  }

  return parts.join("\n");
};
```

### File: `lib/meta-events/generator.ts`

```typescript
import "server-only";

import { generateText } from "ai";
import { getLanguageModel } from "@/lib/ai/providers";
import { META_EVENT_SYSTEM_PROMPT, buildMetaEventUserPrompt } from "./prompts";
import type { MetaEventType, SeverityLevel } from "@/lib/game-state/types";

export interface GeneratedEvent {
  type: MetaEventType;
  title: string;
  description: string;
  probability: number;
  severity: SeverityLevel;
  triggersCombat: boolean;
}

interface GenerateMetaEventsInput {
  playerAction: string;
  timeEstimate?: string;
  location?: string;
  timeOfDay?: string;
  recentEvents?: string[];
  model?: string;
}

interface GenerateMetaEventsResult {
  events: GeneratedEvent[];
  rawOutput: string;
}

/**
 * Generates meta events using an LLM based on the player's intended action.
 * Returns 2-4 contextually appropriate events.
 */
export async function generateMetaEvents({
  playerAction,
  timeEstimate,
  location,
  timeOfDay,
  recentEvents,
  model = "gpt-4o-mini",
}: GenerateMetaEventsInput): Promise<GenerateMetaEventsResult> {
  const userPrompt = buildMetaEventUserPrompt({
    playerAction,
    timeEstimate,
    location,
    timeOfDay,
    recentEvents,
  });

  const { text } = await generateText({
    model: getLanguageModel(model),
    system: META_EVENT_SYSTEM_PROMPT,
    prompt: userPrompt,
  });

  // Parse the JSON response
  const parsed = JSON.parse(text);
  
  // Validate and normalize events
  const events: GeneratedEvent[] = parsed.events.map((e: Record<string, unknown>) => ({
    type: validateEventType(e.type as string),
    title: String(e.title).slice(0, 255),
    description: String(e.description),
    probability: clampProbability(Number(e.probability)),
    severity: validateSeverity(e.severity as string),
    triggersCombat: Boolean(e.triggersCombat),
  }));

  return { events, rawOutput: text };
}

function validateEventType(type: string): MetaEventType {
  const valid = ["encounter", "discovery", "hazard", "opportunity"];
  return valid.includes(type) ? (type as MetaEventType) : "encounter";
}

function validateSeverity(severity: string): SeverityLevel {
  const valid = ["minor", "moderate", "major"];
  return valid.includes(severity) ? (severity as SeverityLevel) : "minor";
}

function clampProbability(prob: number): number {
  if (Number.isNaN(prob)) return 0.3;
  return Math.max(0.05, Math.min(0.5, prob));
}
```

---

## 4. API Routes

### File: `app/api/meta-events/generate/route.ts`

```typescript
import { auth } from "@/app/(auth)/auth";
import { generateMetaEvents } from "@/lib/meta-events/generator";
import {
  getActivePendingAction,
  createMetaEvent,
  deleteMetaEventsByPendingAction,
  updatePendingActionPhase,
  getPendingActionById,
} from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";

interface GenerateRequestBody {
  pendingActionId: string;
  regenerate?: boolean; // If true, delete existing and regenerate
  // Optional context (can be fetched from game state if not provided)
  location?: string;
  timeOfDay?: string;
  recentEvents?: string[];
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  const body: GenerateRequestBody = await request.json();
  const { pendingActionId, regenerate, location, timeOfDay, recentEvents } = body;

  // Fetch the pending action
  const pendingAction = await getPendingActionById(pendingActionId);
  if (!pendingAction) {
    return Response.json(
      { error: "Pending action not found" },
      { status: 404 }
    );
  }

  // If regenerating, delete existing events first
  if (regenerate) {
    await deleteMetaEventsByPendingAction(pendingActionId);
  }

  // Generate new events
  const { events, rawOutput } = await generateMetaEvents({
    playerAction: pendingAction.originalInput,
    timeEstimate: pendingAction.timeEstimate ?? undefined,
    location,
    timeOfDay,
    recentEvents,
  });

  // Store generated events
  const storedEvents = await Promise.all(
    events.map((event, index) =>
      createMetaEvent({
        pendingActionId,
        sequenceNum: index,
        type: event.type,
        title: event.title,
        description: event.description,
        probability: event.probability,
        severity: event.severity,
        triggersCombat: event.triggersCombat,
      })
    )
  );

  // Update phase to meta_review
  await updatePendingActionPhase(pendingActionId, "meta_review");

  return Response.json({
    success: true,
    events: storedEvents,
    rawOutput, // For debugging/logging
  });
}
```

### File: `app/api/meta-events/review/route.ts`

```typescript
import { auth } from "@/app/(auth)/auth";
import {
  getPendingActionById,
  getMetaEventsByPendingAction,
  updateMetaEventDecision,
  updatePendingActionPhase,
} from "@/lib/db/queries";
import type { PlayerDecision } from "@/lib/game-state/types";
import { ChatSDKError } from "@/lib/errors";

interface ReviewRequestBody {
  pendingActionId: string;
  action: "decide" | "confirm" | "regenerate";
  // For "decide" action
  eventId?: string;
  decision?: PlayerDecision;
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  const body: ReviewRequestBody = await request.json();
  const { pendingActionId, action, eventId, decision } = body;

  // Fetch the pending action
  const pendingAction = await getPendingActionById(pendingActionId);
  if (!pendingAction) {
    return Response.json(
      { error: "Pending action not found" },
      { status: 404 }
    );
  }

  // Must be in meta_review phase
  if (pendingAction.phase !== "meta_review") {
    return Response.json(
      { error: "Not in review phase", currentPhase: pendingAction.phase },
      { status: 409 }
    );
  }

  switch (action) {
    case "decide": {
      // Update single event decision
      if (!eventId || !decision) {
        return Response.json(
          { error: "eventId and decision required for decide action" },
          { status: 400 }
        );
      }

      const updatedEvent = await updateMetaEventDecision(eventId, decision);
      return Response.json({ success: true, event: updatedEvent });
    }

    case "confirm": {
      // Player confirmed all decisions, move to probability_roll phase
      // The probability rolling is handled by a separate module/workflow
      await updatePendingActionPhase(pendingActionId, "probability_roll");

      // Get all events with their decisions for the response
      const events = await getMetaEventsByPendingAction(pendingActionId);

      return Response.json({
        success: true,
        phase: "probability_roll",
        events,
      });
    }

    case "regenerate": {
      // Move back to meta_proposal phase
      // The generate endpoint will handle deleting old events
      await updatePendingActionPhase(pendingActionId, "meta_proposal");

      return Response.json({
        success: true,
        phase: "meta_proposal",
      });
    }

    default:
      return Response.json(
        { error: "Invalid action" },
        { status: 400 }
      );
  }
}
```

---

## 5. Review UI Components

### File: `components/play/meta-event-card.tsx`

```typescript
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
            <Badge className={cn("text-xs", SEVERITY_COLORS[event.severity])}>
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
```

### File: `components/play/meta-event-review.tsx`

```typescript
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

      const data = await response.json();
      
      // Update local state
      setEvents((prev) =>
        prev.map((e) =>
          e.id === eventId ? { ...e, playerDecision: decision } : e
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
          pendingActionId,
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
    <div className="space-y-4 p-4">
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
```

---

## 6. Additional API Route for Fetching Events

### File: `app/api/meta-events/[pendingActionId]/route.ts`

```typescript
import { auth } from "@/app/(auth)/auth";
import { getMetaEventsByPendingAction } from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";

export async function GET(
  request: Request,
  { params }: { params: { pendingActionId: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  const { pendingActionId } = params;
  const events = await getMetaEventsByPendingAction(pendingActionId);

  return Response.json({ events });
}
```

---

## 7. Integration Points

### Update: `components/play/play-chat.tsx`

Add conditional rendering for the meta event review overlay:

```typescript
// Add imports
import { MetaEventReview } from "./meta-event-review";
import { useGamePhase } from "@/hooks/use-game-phase";

// Inside PlayChat component:
const { currentPhase, pendingActionId, originalInput } = useGamePhase({
  gameId: gameId, // You'll need to pass this down or fetch it
});

// In the render, wrap or overlay the chat:
{currentPhase === "meta_review" && pendingActionId && (
  <MetaEventReview
    pendingActionId={pendingActionId}
    originalInput={originalInput ?? "your action"}
    onComplete={() => {
      // Phase will auto-update via polling or refetch
    }}
  />
)}
```

### Update: `hooks/use-game-phase.ts`

Extend the return type to include `originalInput`:

```typescript
// In the fetchPhase callback, the response already includes originalInput
// Just ensure it's exposed in the hook's return value:

return {
  currentPhase,
  pendingActionId,
  originalInput: data.originalInput ?? null, // Add this
  refetch: fetchPhase,
};
```

---

## 8. Triggering Event Generation

The event generation should be triggered when a player submits an action. This requires modifying the chat route to intercept actions.

### Update: `app/(chat)/api/chat/route.ts`

Add this logic after authentication but before processing the message:

```typescript
// After auth check, before streamText:

// Check if game exists and we're in idle phase
const game = await getGameByChatId(id);
if (game && message?.role === "user") {
  const currentPhase = await getCurrentGamePhase(game.id);
  
  // If idle, intercept the action and start meta event flow
  if (currentPhase === "idle") {
    // Create pending action
    const pendingAction = await createPendingAction({
      gameId: game.id,
      chatId: id,
      originalInput: message.parts
        .filter(p => p.type === "text")
        .map(p => (p as { text: string }).text)
        .join(" "),
      phase: "meta_proposal",
    });

    // Trigger event generation (could be async via Inngest later)
    await fetch(`${request.url.split('/api/')[0]}/api/meta-events/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pendingActionId: pendingAction.id }),
    });

    // Return early - don't process the chat message yet
    return Response.json({
      intercepted: true,
      phase: "meta_proposal",
      pendingActionId: pendingAction.id,
    });
  }
}
```

---

## 9. File Structure Summary

```
lib/
├── meta-events/
│   ├── generator.ts           # generateMetaEvents function
│   └── prompts.ts             # META_EVENT_SYSTEM_PROMPT, buildMetaEventUserPrompt

app/
├── api/
│   └── meta-events/
│       ├── generate/
│       │   └── route.ts       # POST: generate events
│       ├── review/
│       │   └── route.ts       # POST: decide/confirm/regenerate
│       └── [pendingActionId]/
│           └── route.ts       # GET: fetch events

components/
├── play/
│   ├── meta-event-review.tsx  # Main review overlay
│   └── meta-event-card.tsx    # Individual event card
```

---

## 10. Implementation Checklist

1. [ ] Create `lib/meta-events/prompts.ts`
2. [ ] Create `lib/meta-events/generator.ts`
3. [ ] Create `app/api/meta-events/generate/route.ts`
4. [ ] Create `app/api/meta-events/review/route.ts`
5. [ ] Create `app/api/meta-events/[pendingActionId]/route.ts`
6. [ ] Create `components/play/meta-event-card.tsx`
7. [ ] Create `components/play/meta-event-review.tsx`
8. [ ] Update `hooks/use-game-phase.ts` to expose `originalInput`
9. [ ] Update `components/play/play-chat.tsx` to show review overlay
10. [ ] Update chat route to intercept actions and trigger generation
11. [ ] Run `pnpm typecheck` to verify no type errors

---

## 11. Testing Checklist

After implementation, verify:

- [ ] Generating events via API returns 2-4 valid events
- [ ] Events are stored in database with correct pendingActionId
- [ ] Accept/reject updates the event's playerDecision field
- [ ] Regenerate deletes old events and creates new ones
- [ ] Confirm advances phase to probability_roll
- [ ] Review UI displays events correctly
- [ ] Review UI disables confirm until all events decided
- [ ] Review UI shows accepted/rejected state per card
- [ ] Chat route intercepts actions when phase is idle
- [ ] Phase polling updates client state when phase changes

