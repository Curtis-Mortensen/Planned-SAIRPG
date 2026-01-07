import { Skeleton } from "@/components/ui/skeleton";

// Constants
const SIDEBAR_SKELETON_ITEMS = 8;

/**
 * Loading skeleton for the landing page
 */
export function LandingPageSkeleton() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Hero Section Skeleton */}
      <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-20">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-background to-background" />
        <div className="relative z-10 mx-auto w-full max-w-5xl space-y-8 text-center">
          <div className="flex items-center justify-center gap-4">
            <Skeleton className="size-24 rounded-2xl" />
            <Skeleton className="h-24 w-96" />
          </div>
          <Skeleton className="mx-auto h-10 w-2/3" />
          <Skeleton className="mx-auto h-6 w-3/4" />
        </div>
      </section>
    </div>
  );
}

/**
 * Loading skeleton for chat/play pages
 */
export function ChatPageSkeleton() {
  return (
    <div className="flex h-dvh flex-col">
      {/* Header skeleton */}
      <div className="border-b p-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-48" />
          <div className="flex gap-2">
            <Skeleton className="size-8 rounded-md" />
            <Skeleton className="size-8 rounded-md" />
          </div>
        </div>
      </div>
      
      {/* Messages area skeleton */}
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <div className="flex items-start gap-3">
          <Skeleton className="size-8 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
        <div className="flex items-start gap-3">
          <Skeleton className="size-8 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        </div>
      </div>
      
      {/* Input area skeleton */}
      <div className="border-t p-4">
        <Skeleton className="h-12 w-full rounded-lg" />
      </div>
    </div>
  );
}

/**
 * Loading skeleton for settings page
 */
export function SettingsPageSkeleton() {
  return (
    <div className="container mx-auto max-w-4xl px-4 py-10">
      <Skeleton className="mb-8 h-10 w-48" />
      
      {/* Tabs skeleton */}
      <div className="space-y-4">
        <div className="flex gap-2">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-24" />
        </div>
        
        {/* Card skeleton */}
        <div className="space-y-6 rounded-lg border p-6">
          <div className="space-y-2">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-64" />
          </div>
          <div className="flex items-center gap-6">
            <Skeleton className="size-20 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-48" />
            </div>
          </div>
          <div className="space-y-4">
            <Skeleton className="h-10 w-full max-w-sm" />
            <Skeleton className="h-10 w-full max-w-sm" />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Loading skeleton for editor page
 */
export function EditorPageSkeleton() {
  return (
    <div className="flex flex-1">
      {/* Main area */}
      <div className="flex flex-1 flex-col gap-4 px-4 py-8">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-96" />
          </div>
          <Skeleton className="h-10 w-32 rounded-md" />
        </div>
        <Skeleton className="flex-1 rounded-lg" />
      </div>
      
      {/* Right panel skeleton */}
      <div className="w-80 border-l p-4">
        <Skeleton className="mb-4 h-6 w-32" />
        <div className="space-y-3">
          <Skeleton className="h-20 w-full rounded-md" />
          <Skeleton className="h-20 w-full rounded-md" />
          <Skeleton className="h-20 w-full rounded-md" />
        </div>
      </div>
    </div>
  );
}

/**
 * Loading skeleton for prompts page
 */
export function PromptsPageSkeleton() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
      <Skeleton className="size-16 rounded-full" />
      <div className="space-y-2 text-center">
        <Skeleton className="mx-auto h-8 w-32" />
        <Skeleton className="mx-auto h-4 w-64" />
      </div>
    </div>
  );
}

/**
 * Generic app shell skeleton for pages with sidebar
 */
export function AppShellSkeleton() {
  return (
    <div className="flex h-dvh">
      {/* Sidebar skeleton */}
      <div className="hidden w-64 border-r md:flex md:flex-col">
        <div className="border-b p-4">
          <Skeleton className="h-10 w-full rounded-md" />
        </div>
        <div className="flex-1 space-y-2 p-2">
          {Array.from({ length: SIDEBAR_SKELETON_ITEMS }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-md" />
          ))}
        </div>
      </div>
      
      {/* Main content area */}
      <div className="flex flex-1 flex-col">
        <div className="border-b p-4">
          <Skeleton className="h-6 w-48" />
        </div>
        <div className="flex-1 p-4">
          <Skeleton className="h-full w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}
