"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { SystemEvent } from "@/lib/mockData";

interface EventListPaneProps {
  initialEvents: SystemEvent[];
  initialSearch: string;
  initialSeverity: string;
  selectedEventId: string | null;
  onSelectEvent: (event: SystemEvent) => void;
}

// Memoized individual event row to avoid re-rendering all 500 rows when selection changes
const EventRow = React.memo(function EventRow({
  event,
  isSelected,
  onSelect,
}: {
  event: SystemEvent;
  isSelected: boolean;
  onSelect: (event: SystemEvent) => void;
}) {
  return (
    <div
      onClick={() => onSelect(event)}
      style={{
        padding: "12px 16px",
        borderBottom: "1px solid #1e293b",
        cursor: "pointer",
        background: isSelected ? "#1e293b" : "transparent",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <div>
        <div style={{ fontSize: "14px", fontWeight: 500 }}>{event.title}</div>
        <div style={{ fontSize: "12px", color: "#64748b" }}>
          {event.id} · {event.timestamp}
        </div>
      </div>
      <span
        style={{
          fontSize: "11px",
          padding: "2px 8px",
          borderRadius: "999px",
          background:
            event.severity === "critical"
              ? "#7f1d1d"
              : event.severity === "warning"
              ? "#78350f"
              : "#1e3a8a",
          color: "#f8fafc",
          textTransform: "capitalize",
        }}
      >
        {event.severity}
      </span>
    </div>
  );
});

export function EventListPane({
  initialEvents,
  initialSearch,
  initialSeverity,
  selectedEventId,
  onSelectEvent,
}: EventListPaneProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // 1. Single source of truth for URL filter parameters
  const currentUrlSearch = searchParams.get("search") ?? initialSearch;
  const currentUrlSeverity = searchParams.get("severity") ?? initialSeverity;

  // 2. Local state for responsive, non-blocking 60fps input typing
  const [searchInput, setSearchInput] = useState(currentUrlSearch);
  const [events, setEvents] = useState<SystemEvent[]>(initialEvents);
  const [loadingEvents, setLoadingEvents] = useState(false);

  // Render tracking to prove render isolation from streaming leaf updates
  const renderCount = useRef(0);
  renderCount.current += 1;

  // Keep track of previous query state to detect external URL changes (e.g. Back/Forward)
  const prevUrlSearchRef = useRef(currentUrlSearch);
  const prevUrlSeverityRef = useRef(currentUrlSeverity);
  const isFirstMountRef = useRef(true);
  const fetchAbortRef = useRef<AbortController | null>(null);

  // 3. Keep local input synchronized when the URL changes externally (Back/Forward navigation)
  useEffect(() => {
    if (currentUrlSearch !== searchInput) {
      setSearchInput(currentUrlSearch);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUrlSearch]);

  // 4. Debounce local search input updates to URL (prevents history pollution via router.replace)
  useEffect(() => {
    // If input already reflects the current URL, skip
    if (searchInput === currentUrlSearch) {
      return;
    }

    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      const trimmed = searchInput.trim();
      if (trimmed) {
        params.set("search", trimmed);
      } else {
        params.delete("search");
      }
      router.replace(`/?${params.toString()}`, { scroll: false });
    }, 250);

    return () => clearTimeout(timer);
  }, [searchInput, currentUrlSearch, searchParams, router]);

  // 5. Fetch events with AbortController when URL filters change (skips on initial mount to avoid duplicate fetch)
  useEffect(() => {
    if (isFirstMountRef.current) {
      isFirstMountRef.current = false;
      return;
    }

    // Only fetch if search or severity actually changed
    if (
      currentUrlSearch === prevUrlSearchRef.current &&
      currentUrlSeverity === prevUrlSeverityRef.current
    ) {
      return;
    }

    prevUrlSearchRef.current = currentUrlSearch;
    prevUrlSeverityRef.current = currentUrlSeverity;

    // Abort previous in-flight event fetch to solve network jitter race conditions
    if (fetchAbortRef.current) {
      fetchAbortRef.current.abort();
    }
    const controller = new AbortController();
    fetchAbortRef.current = controller;

    setLoadingEvents(true);

    const params = new URLSearchParams();
    if (currentUrlSearch) params.set("search", currentUrlSearch);
    if (currentUrlSeverity !== "all") params.set("severity", currentUrlSeverity);

    fetch(`/api/events?${params.toString()}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch events");
        return res.json();
      })
      .then((data) => {
        setEvents(data.events || []);
        setLoadingEvents(false);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }
        setLoadingEvents(false);
      });

    return () => {
      controller.abort();
    };
  }, [currentUrlSearch, currentUrlSeverity]);

  const handleSeverityChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const newSeverity = e.target.value;
      const params = new URLSearchParams(searchParams.toString());
      if (newSeverity !== "all") {
        params.set("severity", newSeverity);
      } else {
        params.delete("severity");
      }
      router.push(`/?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  return (
    <div style={{ borderRight: "1px solid #1e293b", display: "flex", flexDirection: "column", overflow: "hidden", height: "100%" }}>
      {/* Filter Bar */}
      <div style={{ padding: "16px", borderBottom: "1px solid #1e293b", display: "flex", gap: "12px", alignItems: "center" }}>
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Filter by service, title, or ID..."
          style={{
            flex: 1,
            padding: "8px 12px",
            borderRadius: "6px",
            border: "1px solid #334155",
            background: "#1e293b",
            color: "#f8fafc",
            outline: "none",
          }}
        />
        <select
          value={currentUrlSeverity}
          onChange={handleSeverityChange}
          style={{
            padding: "8px 12px",
            borderRadius: "6px",
            border: "1px solid #334155",
            background: "#1e293b",
            color: "#f8fafc",
            outline: "none",
            cursor: "pointer",
          }}
        >
          <option value="all">All Severities</option>
          <option value="info">Info</option>
          <option value="warning">Warning</option>
          <option value="critical">Critical</option>
        </select>
        <span
          suppressHydrationWarning
          style={{ fontSize: "12px", color: "#64748b", whiteSpace: "nowrap" }}
        >
          List renders: {renderCount.current}
        </span>
      </div>

      {/* 500-Row Event Feed */}
      <div style={{ overflowY: "auto", flex: 1 }}>
        {loadingEvents && (
          <div style={{ padding: "12px 16px", color: "#94a3b8", fontSize: "13px" }}>
            Updating events...
          </div>
        )}
        {!loadingEvents && events.length === 0 && (
          <div style={{ padding: "16px", color: "#64748b", fontSize: "14px" }}>
            No events match the current filter criteria.
          </div>
        )}
        {events.map((evt) => (
          <EventRow
            key={evt.id}
            event={evt}
            isSelected={selectedEventId === evt.id}
            onSelect={onSelectEvent}
          />
        ))}
      </div>
    </div>
  );
}
