import { EventLogViewer } from "@/components/log/event-log-viewer";

export default function LogPage() {
  return (
    <div className="flex h-full flex-col p-6">
      <div className="mb-6">
        <h1 className="font-semibold text-2xl">Event Log</h1>
        <p className="mt-2 text-muted-foreground">
          View your game history, past decisions, and key events from your
          adventures.
        </p>
      </div>
      <div className="flex-1">
        <EventLogViewer className="h-full" />
      </div>
    </div>
  );
}

