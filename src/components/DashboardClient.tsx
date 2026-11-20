"use client";

import React, { useState } from "react";
import type { SystemEvent } from "@/lib/mockData";
import { EventListPane } from "@/components/EventListPane";
import { IncidentDrawer } from "@/components/IncidentDrawer";

interface DashboardClientProps {
  initialEvents: SystemEvent[];
  initialSearch: string;
  initialSeverity: string;
}

export function DashboardClient({
  initialEvents,
  initialSearch,
  initialSeverity,
}: DashboardClientProps) {
  const [selectedEvent, setSelectedEvent] = useState<SystemEvent | null>(null);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", height: "100vh", overflow: "hidden" }}>
      <EventListPane
        initialEvents={initialEvents}
        initialSearch={initialSearch}
        initialSeverity={initialSeverity}
        selectedEventId={selectedEvent?.id ?? null}
        onSelectEvent={setSelectedEvent}
      />
      <IncidentDrawer selectedEvent={selectedEvent} />
    </div>
  );
}
