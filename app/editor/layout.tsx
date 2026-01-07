import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { EnsureUser } from "@/components/ensure-user";
import { AppShellSkeleton } from "@/components/loading-skeletons";

export default function EditorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<AppShellSkeleton />}>
      <EnsureUser />
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}

