"use client";

export function EventLogTab() {
  return (
    <div
      className="flex flex-1 flex-col p-4"
      data-testid="event-log-content"
    >
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <h2 className="font-semibold text-xl">Event Log</h2>
        <p className="text-muted-foreground">
          Chronological list of all module communications coming soon.
        </p>
      </div>
    </div>
  );
}


