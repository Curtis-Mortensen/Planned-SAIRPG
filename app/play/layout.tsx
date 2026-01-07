import Script from "next/script";
import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { DataStreamProvider } from "@/components/data-stream-provider";
import { EnsureUser } from "@/components/ensure-user";
import { AppShellSkeleton } from "@/components/loading-skeletons";

export default function PlayLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Script
        src="https://cdn.jsdelivr.net/pyodide/v0.23.4/full/pyodide.js"
        strategy="beforeInteractive"
      />
      <DataStreamProvider>
        <Suspense fallback={<AppShellSkeleton />}>
          <EnsureUser />
          <AppShell>{children}</AppShell>
        </Suspense>
      </DataStreamProvider>
    </>
  );
}

