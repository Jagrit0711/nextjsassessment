"use client";

import React, { useEffect, useRef, useState } from "react";
import type { SystemEvent } from "@/lib/mockData";

interface StreamingSummaryProps {
  selectedEvent: SystemEvent | null;
}

/**
 * Parses inline formatting like **bold** and `code` into styled React nodes.
 */
function renderInlineFormatting(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*.*?\*\*|`.*?`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith("**") && token.endsWith("**")) {
      parts.push(
        <strong key={`bold-${match.index}`} style={{ color: "#f1f5f9", fontWeight: 700 }}>
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith("`") && token.endsWith("`")) {
      parts.push(
        <code
          key={`code-${match.index}`}
          style={{
            background: "#0f172a",
            padding: "2px 6px",
            borderRadius: "4px",
            color: "#38bdf8",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            fontSize: "0.88em",
            border: "1px solid #334155",
          }}
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

/**
 * Parses Markdown structure (headings, lists, paragraphs) into styled elements.
 */
function renderFormattedMarkdown(rawText: string, isStreaming: boolean): React.ReactNode {
  if (!rawText) return null;

  const lines = rawText.split("\n");
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!line.trim()) {
      elements.push(<div key={`spacer-${i}`} style={{ height: "6px" }} />);
      continue;
    }

    if (line.startsWith("### ")) {
      elements.push(
        <h4
          key={`heading-${i}`}
          style={{
            margin: "4px 0 10px 0",
            fontSize: "15px",
            fontWeight: 700,
            color: "#38bdf8",
            letterSpacing: "-0.01em",
          }}
        >
          {renderInlineFormatting(line.replace("### ", ""))}
        </h4>
      );
    } else if (/^\d+\.\s/.test(line)) {
      const match = line.match(/^(\d+\.)\s+(.*)$/);
      elements.push(
        <div
          key={`item-${i}`}
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "8px",
            margin: "4px 0",
            paddingLeft: "4px",
            lineHeight: 1.5,
          }}
        >
          <span style={{ color: "#38bdf8", fontWeight: 700, minWidth: "18px" }}>
            {match ? match[1] : "•"}
          </span>
          <span style={{ color: "#cbd5e1" }}>
            {match ? renderInlineFormatting(match[2]) : renderInlineFormatting(line)}
          </span>
        </div>
      );
    } else {
      elements.push(
        <p key={`p-${i}`} style={{ margin: "4px 0", color: "#cbd5e1", lineHeight: 1.55 }}>
          {renderInlineFormatting(line)}
        </p>
      );
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {elements}
      {isStreaming && (
        <span
          style={{
            display: "inline-block",
            width: "6px",
            height: "14px",
            background: "#38bdf8",
            marginLeft: "3px",
            marginTop: "4px",
            verticalAlign: "middle",
            animation: "pulse 1s infinite",
          }}
        />
      )}
    </div>
  );
}

/**
 * Leaf component responsible exclusively for consuming and rendering the streaming AI summary.
 * State updates here are isolated and will NEVER trigger re-renders in the parent shell or event table.
 */
export function StreamingSummary({ selectedEvent }: StreamingSummaryProps) {
  const [summaryText, setSummaryText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);

  const renderCount = useRef(0);
  renderCount.current += 1;

  const abortControllerRef = useRef<AbortController | null>(null);
  const activeRequestIdRef = useRef(0);

  useEffect(() => {
    // 1. Abort any active in-flight stream immediately
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    if (!selectedEvent) {
      setSummaryText("");
      setIsStreaming(false);
      return;
    }

    // 2. Increment request ID correlation token and instantiate new AbortController
    const currentRequestId = ++activeRequestIdRef.current;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setSummaryText("");
    setIsStreaming(true);

    async function streamIncidentSummary() {
      try {
        const res = await fetch(`/api/stream-summary?eventId=${encodeURIComponent(selectedEvent!.id)}`, {
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          throw new Error(`Failed to fetch stream summary: status ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          // Guard check before waiting for read
          if (controller.signal.aborted || activeRequestIdRef.current !== currentRequestId) {
            try {
              await reader.cancel();
            } catch {
              // Ignore reader cancellation errors
            }
            break;
          }

          const { done, value } = await reader.read();
          if (done) break;

          // Guard check after read resolves
          if (controller.signal.aborted || activeRequestIdRef.current !== currentRequestId) {
            break;
          }

          const chunk = decoder.decode(value, { stream: true });
          setSummaryText((prev) => prev + chunk);
        }
      } catch (err: unknown) {
        // Silently ignore aborted requests - clean cancellation is expected
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }
        if (typeof err === "object" && err !== null && "name" in err && (err as { name: string }).name === "AbortError") {
          return;
        }
        console.error("Stream reading error:", err);
      } finally {
        if (activeRequestIdRef.current === currentRequestId) {
          setIsStreaming(false);
        }
      }
    }

    streamIncidentSummary();

    // 3. Cleanup on unmount or when selectedEvent changes
    return () => {
      controller.abort();
    };
  }, [selectedEvent]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: "12px", color: isStreaming ? "#38bdf8" : "#94a3b8" }}>
          {isStreaming ? "Streaming tokens..." : selectedEvent ? "Analysis complete" : "Awaiting selection"}
        </span>
        <span suppressHydrationWarning style={{ fontSize: "12px", color: "#64748b" }}>
          Summary renders: {renderCount.current}
        </span>
      </div>

      <div
        style={{
          background: "#1e293b",
          padding: "16px",
          borderRadius: "8px",
          border: "1px solid #334155",
          lineHeight: 1.55,
          minHeight: "180px",
          color: "#f8fafc",
          fontSize: "13.5px",
        }}
      >
        {summaryText ? (
          renderFormattedMarkdown(summaryText, isStreaming)
        ) : (
          <span style={{ color: "#64748b" }}>
            {selectedEvent ? "Connecting to AI streaming service..." : "Select an event to generate an AI incident analysis..."}
          </span>
        )}
      </div>
    </div>
  );
}
