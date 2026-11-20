"use client";

import React from "react";

/**
 * Simulates an expensive markdown / syntax highlighting component.
 * Memoized with React.memo so it only re-evaluates when rawPayload changes.
 * Token streaming in sibling/leaf components will NOT trigger the 12ms synchronous loop.
 */
export const HeavyPayloadFormatter = React.memo(
  function HeavyPayloadFormatter({
    rawPayload,
  }: {
    rawPayload: string;
    summaryText?: string;
  }) {
    // Simulate ~12ms of synchronous formatting work per render
    const start = performance.now();
    let checksum = 0;
    while (performance.now() - start < 12) {
      checksum = (checksum + 1) % 1000;
    }

    return (
      <details open suppressHydrationWarning data-checksum={checksum} style={{ marginTop: "16px" }}>
        <summary style={{ cursor: "pointer", color: "#94a3b8", fontSize: "13px", userSelect: "none" }}>
          Raw Telemetry Payload
        </summary>
        <pre
          style={{
            background: "#020617",
            padding: "12px",
            borderRadius: "6px",
            fontSize: "12px",
            overflowX: "auto",
            marginTop: "8px",
          }}
        >
          {rawPayload}
        </pre>
      </details>
    );
  },
  (prev, next) => prev.rawPayload === next.rawPayload
);
