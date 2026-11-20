"use client";

import React from "react";
import type { SystemEvent } from "@/lib/mockData";
import { StreamingSummary } from "@/components/StreamingSummary";
import { HeavyPayloadFormatter } from "@/components/HeavyPayloadFormatter";

interface IncidentDrawerProps {
  selectedEvent: SystemEvent | null;
}

export function IncidentDrawer({ selectedEvent }: IncidentDrawerProps) {
  return (
    <div style={{ padding: "20px", overflowY: "auto", display: "flex", flexDirection: "column", height: "100%", boxSizing: "border-box" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <h2 style={{ margin: 0, fontSize: "18px" }}>
          {selectedEvent ? `Analysis: ${selectedEvent.id}` : "Incident Summary"}
        </h2>
      </div>

      <StreamingSummary selectedEvent={selectedEvent} />

      <HeavyPayloadFormatter rawPayload={selectedEvent?.rawPayload || "{}"} />
    </div>
  );
}
