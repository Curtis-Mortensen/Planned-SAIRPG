import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";

export default function PromptsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<div className="flex h-dvh" />}>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}

