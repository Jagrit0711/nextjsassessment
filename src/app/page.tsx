import { Suspense } from "react";
import { ALL_EVENTS, type SystemEvent } from "@/lib/mockData";
import { DashboardClient } from "@/components/DashboardClient";

interface PageProps {
  searchParams: Promise<{ search?: string; severity?: string }>;
}

/**
 * Server Component (RSC) Shell.
 * Performs initial server-side data preparation and layout scaffolding.
 * Wrapped with Suspense to support useSearchParams in client boundaries cleanly.
 */
export default async function DashboardPage(props: PageProps) {
  const resolvedSearchParams = await props.searchParams;
  const search = (resolvedSearchParams?.search || "").toLowerCase().trim();
  const severity = resolvedSearchParams?.severity || "all";

  // Initial data loading performed on the server to prevent blank flash and redundant client fetches
  const initialEvents: SystemEvent[] = ALL_EVENTS.filter((evt) => {
    const matchesSeverity = severity === "all" || evt.severity === severity;
    const matchesSearch =
      !search ||
      evt.title.toLowerCase().includes(search) ||
      evt.service.toLowerCase().includes(search) ||
      evt.id.toLowerCase().includes(search);
    return matchesSeverity && matchesSearch;
  });

  return (
    <Suspense
      fallback={
        <div style={{ padding: "24px", color: "#94a3b8", background: "#0f172a", height: "100vh" }}>
          Scaffolding operations dashboard...
        </div>
      }
    >
      <DashboardClient
        initialEvents={initialEvents}
        initialSearch={resolvedSearchParams?.search || ""}
        initialSeverity={severity}
      />
    </Suspense>
  );
}
