import { Sliders } from "lucide-react";

export default function PromptsPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
      <div className="flex size-16 items-center justify-center rounded-full bg-muted">
        <Sliders className="size-8 text-muted-foreground" />
      </div>
      <div className="text-center">
        <h1 className="font-semibold text-2xl">Prompts</h1>
        <p className="mt-2 max-w-md text-muted-foreground">
          Manage AI prompts and templates to customize your game experience.
          This feature is coming soon.
        </p>
      </div>
    </div>
  );
}

