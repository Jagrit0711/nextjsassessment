# Frontend Architecture & Debugging Decisions

Please answer these four questions concisely before submitting your solution.

## 1. Root-Cause Diagnosis
What caused each of the three reported issues in the starter codebase?
- **Stream cross-contamination:**
  The starter code initiated `fetch('/api/stream-summary?eventId=...')` within `handleSelectEvent` using an uncancelled `ReadableStream` reader (`while (true) { ... }`). It lacked both an `AbortController` to cancel HTTP streams at the transport layer and an active request/session correlation token. When the user switched from Event A to Event B before Event A finished streaming, Event A's asynchronous read loop continued executing in the background, appending stale chunks via `setSummaryText((prev) => prev + chunk)` into Event B's summary panel.
- **Duplicate fetches & broken history navigation:**
  Two competing `useEffect` hooks created a cyclic feedback loop: Effect 1 watched `[search, severity]` and called `router.push('/?...')` on every keystroke, while Effect 2 watched `[searchParams]` and wrote back to `setSearch` and `setSeverity`. Calling `router.push` on every raw keystroke flooded the browser's session history with intermediate single-character entries (breaking the Back/Forward buttons). Furthermore, an un-debounced fetch effect fired on every character change; because `/api/events` introduces 150ms–550ms of random network jitter, out-of-order network responses created race conditions where slower, older responses overwrote newer queries.
- **Render cascade during streaming:**
  The streaming state (`summaryText` and `isStreaming`) was hoisted to the root `DashboardPage` component. As the AI stream pushed chunks every ~45ms, calling `setSummaryText` triggered a top-down re-render of the entire page on every chunk. This forced all 500 table rows to be reconciled and caused `<HeavyPayloadFormatter />`—which contained an un-memoized synchronous 12ms CPU checksum loop—to execute on every token. The resulting ~12ms+ main-thread block every 45ms caused severe UI freezing and dropped frames when scrolling or typing.

## 2. Server vs. Client Component Boundaries
Which parts of the application did you move to Server Components vs. keep as Client Components, and why? What serializable props cross the boundary?
- **Server Components (`src/app/page.tsx`):**
  Moved the top-level route and layout shell to a React Server Component (RSC). The RSC resolves `searchParams` on the server and computes the initial filtered list of events from the dataset. It wraps client interactivity in a `<Suspense>` boundary, allowing Next.js 15 to perform SSR/streaming without CSR bailouts.
- **Client Components (`src/components/DashboardClient.tsx`, `EventListPane.tsx`, `IncidentDrawer.tsx`, `StreamingSummary.tsx`, `HeavyPayloadFormatter.tsx`):**
  - `DashboardClient`: Coordinates the active selection (`selectedEvent`) between panes.
  - `EventListPane`: Manages local debounced typing input, URL filter synchronization, and rendering the 500-row list.
  - `IncidentDrawer`: Layout drawer for the right-hand panel.
  - `StreamingSummary`: Isolated leaf component owning the stream reader, `summaryText`, and `isStreaming` state.
  - `HeavyPayloadFormatter`: Leaf presentation component memoized with `React.memo`.
- **Serializable Props Crossing the Boundary:**
  - `initialEvents`: Array of plain `SystemEvent` objects (`id`, `timestamp`, `service`, `severity`, `title`, `rawPayload`—all primitive strings).
  - `initialSearch`: Primitive string representing the initial search query.
  - `initialSeverity`: Primitive string representing the initial severity filter (`"all" | "info" | "warning" | "critical"`).

## 3. Stream Cancellation & Race-Condition Strategy
How did you guarantee that rapid clicks across multiple events never interleave chunks or throw unhandled `AbortError` exceptions? What happens if a user selects Event A -> Event B -> Event A quickly?
- **Transport-level Cancellation (`AbortController`):** A ref holds the active `AbortController`. Before starting a stream for any newly selected event, `abortControllerRef.current?.abort()` is invoked immediately, aborting the underlying HTTP request and signaling the server route's `request.signal.aborted` guard to terminate token generation.
- **Request Correlation Token (`activeRequestIdRef`):** An incremental integer ID (`currentRequestId = ++activeRequestIdRef.current`) tags every stream invocation. Both before and after `await reader.read()`, the loop verifies `activeRequestIdRef.current === currentRequestId`. If the ID no longer matches, the loop cancels the reader (`reader.cancel().catch(() => {})`) and breaks without committing any text chunks to state.
- **Silent `AbortError` Handling:** Fetch and stream reader errors are wrapped in a `try...catch` block. If `err.name === "AbortError"`, the error is swallowed silently, ensuring zero unhandled rejections or noisy console errors.
- **Rapid A -> B -> A Transition:**
  1. **Click A (Req #1):** Controller 1 is created; stream begins.
  2. **Click B (Req #2):** Controller 1 is aborted. Req ID increments to 2. Controller 2 starts streaming Event B. Even if Req #1 had a chunk buffered in memory, its ID check fails (`1 !== 2`), and the chunk is discarded.
  3. **Click A (Req #3):** Controller 2 is aborted. Req ID increments to 3. Controller 3 starts streaming Event A. Any lingering chunks from Req #1 or #2 are discarded (`reqId !== 3`). Only chunks tagged with Req #3 ever append to `summaryText`.

## 4. State Synchronization & Render Performance
- How did you synchronize filter inputs with `useSearchParams` / `router.replace` (or `push`) without creating a `useEffect` feedback loop?
  - **Decoupled Input State & URL as Single Source of Truth:** `searchInput` maintains local component state for instant, 60fps typing. A debounced `useEffect` (250ms) pushes updates to the URL via `router.replace(`/?${params.toString()}`, { scroll: false })`, replacing the history entry to prevent back-button pollution.
  - **Loop Prevention:** The debouncer only updates the URL if `searchInput !== currentUrlSearch`. Conversely, the URL-sync effect only updates `searchInput` if `currentUrlSearch !== searchInput` (e.g., when the user clicks the browser's Back or Forward buttons). Because neither effect executes when values are identical, the ping-pong feedback loop is completely eliminated.
  - **Mount Deduplication & Jitter Cancellation:** Initial events are rendered directly from the RSC props (`isFirstMountRef` skips initial client fetch). On subsequent URL changes, `/api/events` is fetched with an `AbortController` ref, automatically cancelling any in-flight requests and preventing slow jittered responses (150–550ms) from overwriting newer query results.
- How did you verify that token updates in the summary panel no longer trigger re-renders in the event table?
  - **Leaf State Encapsulation:** `summaryText` and `isStreaming` state were pushed down strictly into the `<StreamingSummary />` leaf component. Neither `DashboardClient` nor `EventListPane` re-renders when streaming tokens arrive.
  - **Memoized Heavy Formatter:** `<HeavyPayloadFormatter />` is wrapped with `React.memo` with a custom comparator checking `prev.rawPayload === next.rawPayload`. During streaming, `rawPayload` is unchanged, completely avoiding the 12ms synchronous formatting penalty per token.
  - **Memoized Event Rows:** Individual list rows are wrapped in `React.memo(EventRow)`, ensuring that when `selectedEvent` changes, only the two impacted rows (previous and newly selected) re-render rather than all 500 rows.
  - **Verification:** Both panes feature independent render counters (`List renders: {count}` and `Summary renders: {count}`). During active token streaming, `Summary renders` increments with each incoming chunk while `List renders` remains strictly frozen at its baseline value.
