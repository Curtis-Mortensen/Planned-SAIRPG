import { Suspense } from "react";
import { Gamepad2, Sparkles, GitBranch, Zap, Layers, Code } from "lucide-react";
import { NewGameButton } from "@/components/new-game-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Hero section - loads immediately
function HeroSection() {
  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-20">
      <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-background to-background" />
      <div className="relative z-10 mx-auto w-full max-w-5xl space-y-8 text-center">
        <div className="flex items-center justify-center gap-4">
          <div className="rounded-2xl bg-primary/10 p-4">
            <Gamepad2 className="size-16 text-primary" />
          </div>
          <h1 className="bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-6xl font-bold tracking-tight text-transparent md:text-7xl lg:text-8xl">
            SAIRPG
          </h1>
        </div>
        <p className="mx-auto max-w-2xl text-2xl font-medium text-muted-foreground md:text-3xl">
          AI-Powered RPG Simulation Engine
        </p>
        <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
          Experience dynamic, responsive game worlds powered by AI modules.
          Every action is editable, rewindable, and transparent.
        </p>
      </div>
    </section>
  );
}

// Features section skeleton
function FeaturesSectionSkeleton() {
  return (
    <section className="relative px-4 py-24">
      <div className="mx-auto w-full max-w-5xl space-y-12">
        <div className="space-y-4 text-center">
          <Skeleton className="mx-auto h-12 w-64" />
          <Skeleton className="mx-auto h-6 w-3/4" />
        </div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-lg border p-6">
              <Skeleton className="mb-4 size-12 rounded-lg" />
              <Skeleton className="mb-2 h-6 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="mt-2 h-4 w-5/6" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// Features section - loads after hero
async function FeaturesSection() {
  // Simulate slight delay for demo purposes - in real scenario this could be data fetching
  await new Promise((resolve) => setTimeout(resolve, 100));
  
  return (
    <section className="relative px-4 py-24">
      <div className="mx-auto w-full max-w-5xl space-y-12">
        <div className="space-y-4 text-center">
          <h2 className="text-4xl font-bold tracking-tight md:text-5xl">
            What is SAIRPG?
          </h2>
          <p className="mx-auto max-w-3xl text-lg text-muted-foreground">
            SAIRPG (Simulated AI RPG) is a next-generation RPG engine that
            uses AI modules to create dynamic, responsive game worlds. Unlike
            traditional RPGs with scripted events, SAIRPG uses a{" "}
            <strong className="text-foreground">Hub-and-Spoke architecture</strong>{" "}
            where a central Narrator coordinates with specialized constraint,
            meta, and interaction modules to generate the story.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <div className="mb-2 flex size-12 items-center justify-center rounded-lg bg-primary/10">
                <Sparkles className="size-6 text-primary" />
              </div>
              <CardTitle>Hub-and-Spoke Architecture</CardTitle>
              <CardDescription>
                A central Narrator module acts as the hub, receiving context
                and constraints from specialized modules (Time, Difficulty,
                NPCs).
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <div className="mb-2 flex size-12 items-center justify-center rounded-lg bg-primary/10">
                <Layers className="size-6 text-primary" />
              </div>
              <CardTitle>Nested Loop Gameplay</CardTitle>
              <CardDescription>
                Actions can trigger nested "loops" (scenes/goals) that act as
                a stack, allowing for deep, granular interactions that must
                resolve before returning to the parent context.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <div className="mb-2 flex size-12 items-center justify-center rounded-lg bg-primary/10">
                <GitBranch className="size-6 text-primary" />
              </div>
              <CardTitle>Full Editability</CardTitle>
              <CardDescription>
                Edit any AI output and replay from that point, creating
                timeline branches without mutating history.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <div className="mb-2 flex size-12 items-center justify-center rounded-lg bg-primary/10">
                <Code className="size-6 text-primary" />
              </div>
              <CardTitle>Event Sourcing</CardTitle>
              <CardDescription>
                Complete history reconstruction through immutable event logs.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <div className="mb-2 flex size-12 items-center justify-center rounded-lg bg-primary/10">
                <Zap className="size-6 text-primary" />
              </div>
              <CardTitle>Workflow Orchestration</CardTitle>
              <CardDescription>
                Powered by Inngest to manage complex state, retries, and
                module sequencing.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>
    </section>
  );
}

// Architecture section skeleton
function ArchitectureSectionSkeleton() {
  return (
    <section className="relative bg-muted/30 px-4 py-24">
      <div className="mx-auto w-full max-w-5xl space-y-12">
        <div className="space-y-4 text-center">
          <Skeleton className="mx-auto h-12 w-56" />
          <Skeleton className="mx-auto h-6 w-2/3" />
        </div>
        <div className="space-y-8">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-lg border bg-background p-6">
              <Skeleton className="mb-2 h-6 w-32" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="mt-2 h-4 w-5/6" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// Architecture section - loads after features
async function ArchitectureSection() {
  await new Promise((resolve) => setTimeout(resolve, 100));
  
  return (
    <section className="relative bg-muted/30 px-4 py-24">
      <div className="mx-auto w-full max-w-5xl space-y-12">
        <div className="space-y-4 text-center">
          <h2 className="text-4xl font-bold tracking-tight md:text-5xl">
            How It Works
          </h2>
          <p className="mx-auto max-w-3xl text-lg text-muted-foreground">
            SAIRPG uses a modular architecture where specialized AI modules
            work together to create dynamic narratives.
          </p>
        </div>

        <div className="space-y-8">
          <Card>
            <CardHeader>
              <CardTitle>The Loop</CardTitle>
              <CardDescription>
                The fundamental unit of gameplay. A loop represents a player's
                attempt to achieve a goal. Loops can be nested (e.g., a
                "Combat Loop" containing a "Grapple Loop").
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>The Stack</CardTitle>
              <CardDescription>
                Loops act like a call stack. Players dive deeper into nested
                contexts and must "pop" back up (resolve) to return to the
                broader story.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Module Taxonomy</CardTitle>
              <CardDescription>
                <ul className="mt-2 list-inside list-disc space-y-2 text-sm">
                  <li>
                    <strong>Constraint Modules</strong> (Run First): Limit
                    possibilities or set costs (e.g., Time, Difficulty,
                    Inventory).
                  </li>
                  <li>
                    <strong>Meta Modules</strong> (Run Second): Provide
                    structural events or control flow (e.g., Meta Nesting, Meta
                    Events).
                  </li>
                  <li>
                    <strong>Interaction Modules</strong> (Run Third): Shape
                    narrative through reactions (e.g., NPCs, Background).
                  </li>
                  <li>
                    <strong>Narrator Module</strong> (Runs Last): The Hub.
                    Consumes all inputs, context, and constraints to produce
                    the final narrative and state signals.
                  </li>
                </ul>
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>
    </section>
  );
}

// CTA section skeleton
function CTASectionSkeleton() {
  return (
    <section className="relative px-4 py-32">
      <div className="mx-auto w-full max-w-3xl space-y-8 text-center">
        <Skeleton className="mx-auto h-12 w-96" />
        <Skeleton className="mx-auto h-6 w-2/3" />
        <div className="flex justify-center pt-4">
          <Skeleton className="h-12 w-48 rounded-md" />
        </div>
      </div>
    </section>
  );
}

// CTA section - loads last
async function CTASection() {
  await new Promise((resolve) => setTimeout(resolve, 100));
  
  return (
    <section className="relative px-4 py-32">
      <div className="mx-auto w-full max-w-3xl space-y-8 text-center">
        <h2 className="text-4xl font-bold tracking-tight md:text-5xl">
          Ready to experience for yourself?
        </h2>
        <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
          Start your adventure in a world where every action matters and every
          story is unique.
        </p>
        <div className="flex justify-center pt-4">
          <NewGameButton size="lg" className="min-w-[200px]" />
        </div>
      </div>
    </section>
  );
}

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Hero Section - loads immediately */}
      <HeroSection />

      {/* What is SAIRPG Section - loads with skeleton */}
      <Suspense fallback={<FeaturesSectionSkeleton />}>
        <FeaturesSection />
      </Suspense>

      {/* Architecture Section - loads with skeleton */}
      <Suspense fallback={<ArchitectureSectionSkeleton />}>
        <ArchitectureSection />
      </Suspense>

      {/* CTA Section - loads with skeleton */}
      <Suspense fallback={<CTASectionSkeleton />}>
        <CTASection />
      </Suspense>
    </div>
  );
}
