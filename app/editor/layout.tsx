import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { EnsureUser } from "@/components/ensure-user";

export default function EditorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<div className="flex h-dvh" />}>
      <EnsureUser />
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}

