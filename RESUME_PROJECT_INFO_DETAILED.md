# Internet Rabbit Hole Tracker: Detailed Project Information for Resume Tailoring

This document is a comprehensive, implementation-grounded knowledge base for the Internet Rabbit Hole Tracker project. Its purpose is to capture the complete technical and product story in one place so role-specific resume bullets can be generated later without re-reading source code. It is intentionally narrative and dense, and it focuses on what the system actually does in code today.

The project is a Chrome extension built on Manifest V3 that tracks browsing behavior as daily sessions, measures active attention time with strict gating logic, models navigation as a graph, computes behavior-derived analytics such as distraction and intent drift, and presents those insights through both a compact popup interface and a full dashboard. It supports optional local AI summaries through an Ollama proxy and keeps all core functionality working offline without cloud dependencies.

## Product intent and positioning

The central product goal is reflective self-awareness rather than surveillance or gamified productivity scoring. The extension is designed to answer practical questions such as where attention went, how a browsing thread started, where it drifted, which pages acted as turning points, and what recurring behavior patterns exist across sessions. The interface language, settings, and insights architecture all support this intent by allowing neutral tone defaults, optional direct callouts, and user control over visibility of specific sections.

In practice, the project combines telemetry collection, graph modeling, heuristic analysis, scoring, UI visualization, and optional local language model summarization in one cohesive extension. The resulting output is both operational data and interpretable narrative, which is valuable for resume presentation because it demonstrates full-stack ownership across data collection, analytics logic, user experience, and quality engineering.

## Runtime platform and delivery model

The extension runs directly from source with no build step. The manifest is MV3 (`manifest_version: 3`) and currently identifies version `1.0.0`. Core permissions include `tabs`, `windows`, `storage`, `webNavigation`, `idle`, and `alarms`, which together enable accurate event capture and active-time modeling. Host permissions include all HTTP/HTTPS URLs for content script coverage and `http://localhost:3000/*` for optional local AI proxy communication.

The background process is implemented as a service worker (`background.js`) and acts as the authoritative tracking and persistence engine. The content script (`content.js`) runs on all pages at `document_idle` and emits user activity heartbeats. The popup (`popup.html` and `popup.js`) gives a micro-dashboard. The full dashboard (`dashboard/index.html` and `dashboard/dashboard.js`) contains deep visualization and configuration workflows. Optional AI proxy behavior is provided by `ollama-proxy.js`, a Node HTTP server that relays prompts to a local Ollama endpoint.

## Repository shape and implementation footprint

The repository includes large, non-trivial source files that indicate a mature feature surface. `background.js` is over 100 KB and handles state lifecycle, metrics, messaging, and storage optimization. `dashboard/dashboard.js` is over 200 KB and centralizes rendering, settings management, summary generation, realtime behavior, and interaction logic. `graph.js`, `realtime-worker.js`, `shared.js`, `insights.js`, `popup.js`, and `categories.js` modularize key responsibilities.

The testing suite is extensive and includes coverage for background, content, popup, dashboard, shared logic, insights, realtime worker, and proxy server behavior. The `npm test` script enforces strict coverage thresholds using c8 with lines, functions, branches, and statements all set to 100 percent. This is notable resume evidence for engineering rigor because test discipline is encoded in CI-facing command defaults rather than treated as optional.

## End-to-end architecture and data flow

The data path starts in `content.js` and continues through background runtime state, persisted storage, and UI consumers. The content script listens to interaction signals such as mouse input, keyboard input, scroll, touch, pointer events, wheel, and visibility changes. It uses adaptive throttling and batching to reduce noise. Messages are sent as `user_activity` payloads to the background service worker.

The background worker listens to a broad event surface that includes tab activation and updates, tab creation and removal, window focus shifts, browser idle-state transitions, web navigation events (including committed navigation, SPA history updates, hash changes, and target creation), alarms for periodic evaluation, and runtime messages from popup/dashboard/content contexts.

The background worker merges these event streams into a normalized session model containing URL nodes, transition edges, event history, aggregate metrics, labels, trap door candidates, summaries, and session flags such as favorite, archived, or deleted state. State is persisted to local storage under `irht_state`, optionally compacted for sync storage under `irht_state_sync`, and accompanied by settings in `irht_settings`.

The popup and dashboard read this state and render different levels of detail. The popup prioritizes glanceable metrics and one-tap actions. The dashboard adds timeline, graph, stats, honesty views, session browsing controls, summary generation, and settings administration. With realtime mode enabled, the dashboard can subscribe to live updates over a runtime port named `irht_live`.

## Initialization lifecycle in the background worker

On startup, the service worker loads state from storage, applies schema migration to the current schema version, runs one-time daily-session reset behavior when required by migration flag (`irht_daily_session_reset_v4`), hydrates runtime state, ensures the active session aligns with the current day, loads and sanitizes settings from sync storage, configures idle detection interval, schedules recurring alarms, refreshes current browser focus and active-tab context, registers listeners, and persists normalized state.

This initialization sequence is operationally important because it protects consistency across browser restarts and extension reloads. It also ensures the runtime starts from deterministic, sanitized data structures, which reduces edge-case failures in later event handling.

## Session model and lifecycle semantics

Sessions are calendar-day scoped. A session starts for a local date when Chrome is active that day and ends at day boundary rollover. The architecture previously supported timeout-style splitting, but current behavior aligns sessions by day and uses idle state primarily as an active-time gate rather than a session-splitting trigger.

The session object includes identity fields, start and end timestamps, update timestamps, end reason metadata, node and edge maps, navigation counts, event ring buffer cursor metadata, metrics caches, category totals, trap door analysis output, distraction and intent-drift outputs, summary payloads, and lifecycle flags for archive/delete/favorite actions. This schema is intentionally rich so both analytics and UI can work from one source rather than recomputing expensive derivations for every render.

Session mutation pathways include passive updates from navigation and activity, explicit resets, archive and unarchive commands, delete and restore flows, summary updates, favorite toggles, and delete-all operations that mark existing sessions as deleted and immediately start a fresh active session.

## Event ingestion and ring-buffer strategy

Events are stored with a fixed upper bound (`MAX_EVENTS = 5000`) using a cursor-based ring buffer. When below capacity, events append normally and cursor advances with length. At capacity, new events overwrite at cursor index and cursor wraps modulo max size. A separate `eventCount` field tracks retained event volume. This provides predictable memory and storage behavior under long sessions while preserving recency.

The event surface includes navigation and state transitions such as tab activation, tab-created and tab-closed events, URL/title/hash changes, session boundaries, active-time flush events, user active and inactive transitions, idle changes, and error markers for storage or sync failures. Coalescing logic for navigation avoids duplicate noise, especially in SPA-heavy browsing patterns.

## Active-time measurement fidelity

The project uses triple gating for active-time credibility: focused window state, active tab state, and non-idle user state. This avoids inflated totals from background tabs and unattended browser windows. The content script contributes user-activity evidence with adaptive cadence controls, while the background worker controls flush boundaries and interval behavior.

The content script defines throttle tiers with constants set to 2.5 seconds, 7 seconds, 10 seconds, and 14 seconds based on interaction type and interaction continuity. It batches pending activity in a 250 ms window and applies stricter send eligibility for high-frequency events by requiring document visibility and focus checks.

The background worker flushes active-time segments and attributes duration both to active nodes and current transitions where relevant. This supports timeline rendering and more accurate edge weighting, not just node totals.

## Navigation graph modeling

The system models browsing as directed graph transitions with per-node and per-edge activity metadata. Nodes represent pages and include URL, title, category, visit counts, active milliseconds, and first/last seen indexes and timestamps. Edges represent transitions in `from -> to` format and include visit count, active milliseconds, and first/last seen timestamps.

In dashboard rendering, graph data can be projected in page mode or domain mode. Page mode preserves URL-level granularity. Domain mode aggregates pages by host and merges edge flows at domain level. Graph output is capped differently for initial and warm states, using a lower cap for initial work and a higher cap after interaction. Additional filters include minimum node activity threshold, minimum edge count threshold, search matching, hide-isolates behavior, and node cap controls.

Graph rendering uses a force simulation implementation in `graph.js` and is integrated into dashboard state handling. Layout persistence keys allow retaining node positions across updates when the graph topology key remains stable. This improves UX continuity during live updates.

## Timeline and temporal visualization

The timeline view is built from active-time flush segments and can append a live segment when the selected session is active and tracking is currently running. Segment labels are domain-centric when available, with start and end metadata displayed in local time formatting. This implementation communicates temporal distribution of attention rather than only aggregate totals.

Because active-time events are explicit and not inferred from coarse timestamps alone, timeline blocks are defensible as a user-facing representation of attentive time rather than mere tab-open duration.

## Classification and category system

The project includes domain-based category rules in `categories.js` plus override support from user settings. Current categories are `Study`, `Dev Tools`, `AI & ML`, `Health`, `Finance`, `News`, `Music`, `Shopping`, `Gaming`, `Social`, `Video`, and `Random`. Category multipliers are explicitly defined and participate in distraction scoring.

The category system supports canonicalization and normalized override matching. Domain-pattern normalization handles raw host strings, wildcard formats, URL-like inputs, and dotted-prefix variants. Overrides are sanitized so only recognized categories and valid patterns persist.

Category fallback behavior uses rule matching plus heuristics, with optional AI category hook compatibility through shared utilities when present.

## Distraction scoring model

Distraction scoring is implemented in shared logic (`computeDistractionScore`) and combines multiple weighted factors. Inputs include active-time effect with log scaling and cap behavior, navigation depth, late-night signal, category multiplier, technical URL down-weighting, revisit and feed-like behaviors, and productive/distracting site-list modifiers. Constants include active-weight cap `1.6`, active-weight divisor `1.45`, late-night weight `0.6`, productive modifier `0.7`, and distracting modifier `1.2`.

Session-level distraction representation is produced by aggregating node-level scoring behavior and normalizing results to user-facing labels through helper functions. This separation of raw score computation and normalized presentation is useful for testing and future tuning.

## Intent drift detection model

Intent drift is a distinct signal pipeline implemented in shared logic (`computeIntentDrift`) and applied per session in both background and dashboard contexts. It uses entropy-oriented and behavior-oriented features including domain entropy, category entropy, hop rate, short dwell proportions, transition spread, anchor strength, feed-like indicators, technical-share dampening, and productive/distracting alignment with top domain behavior.

Output includes score, label, confidence, reason, and top drivers. Sensitivity can be tuned through settings (`low`, `balanced`, `high`). Confidence increases with richer session evidence such as duration, page count, and navigation counts. This gives the project a second analytic dimension beyond distraction: not merely intensity of distraction but structural drift from initial intent.

## Heuristic insight engine

The insight layer in `insights.js` provides narrative summaries and prioritized session insights independent of AI availability. It computes focused, wandering, looping, feed-like, deep-dive, scattered, late-night, and tab-explosion patterns from session characteristics, then derives mirror summaries and top insights with tone variants.

The engine limits insight count (`MAX_INSIGHTS = 2`) and supports tone resolution including neutral, direct, and poetic variants in copy dictionaries. It also includes historical contextual utilities such as domain repetition, late-night pattern counting, typical drift timing estimates, session trend analysis, and productivity streak computation. This is a strong example of behavior analytics without external model dependency.

## Trap door detection

Trap door logic identifies pages that appear to trigger prolonged downstream browsing. Current thresholds include minimum post-visit duration of 20 minutes, minimum depth of 6 transitions, and capped result count. Scoring blends duration share and depth share for ranking. This feature is conceptually useful in resume framing because it shows sequence-aware attribution, not just isolated event counting.

## Storage architecture and compaction

Primary state persists under `irht_state` in `chrome.storage.local`. Sync settings persist under `irht_settings`. Optional multi-device snapshot data persists under `irht_state_sync` when sync is enabled.

To stay within extension storage constraints, the project applies structured trimming and compact encoding. It keeps recent sessions and high-value sessions, retains full detail for a limited set of recent sessions, trims older sessions to bounded node, edge, and event counts, and removes low-value trivial sessions when they fall outside keep criteria.

Compact storage format de-duplicates URL strings into a shared table and stores node and edge references by ID, then decodes back to full structures when loaded. This decreases storage footprint without discarding essential relational information.

Persistence is debounced (`1200 ms`) with maximum wait control (`5000 ms`) to avoid churn under high event throughput. Deleted sessions and old events are pruned according to retention policies.

## Realtime dashboard update pipeline

The project supports optional realtime update behavior with multiple tuning flags in settings. Core controls include stream enablement, background push preference, delta sync mode, live timers, UI batching, batch-window duration, priority-update mode, optimistic UI actions, worker offload, and frame-aligned rendering.

When enabled, the dashboard connects to background via a long-lived runtime port and can process either snapshots or deltas. Delta application merges session patches, node patches, and edge patches into local state to reduce full-render overhead. Optional batching smooths update frequency. Optional priority mode updates key information before heavier charts. Optional optimistic mode applies session action effects immediately before background confirmation.

A web worker (`dashboard/realtime-worker.js`) can offload expensive derivations such as graph construction, timeline segmentation, summary-line preparation, and stats preparation. Request IDs and timeout guards prevent stale or hung tasks from corrupting UI state.

## Popup behavior and micro-dashboard logic

The popup presents a compact branded card (`Attention Atlas`) with optional mood chip, note, micro-note, quick-glance metrics, and one primary action button. Supported quick-glance keys include active time, top domain, distraction score, session label, and last action. Ordering logic prioritizes attention-critical metrics.

Primary actions include opening dashboard, pausing tracking, copying summary, and starting focus mode. Settings include layout and density variants, label customization, and visual preferences inherited from global theme and accent choices.

The popup writes a force-refresh key for dashboard handoff behavior and falls back gracefully if extension APIs are unavailable in constrained contexts.

## Dashboard behavior and UI composition

The dashboard is the main analysis surface and includes summary panels, session list controls, overview highlights, and deep-dive tabs for timeline, graph, stats, and honesty. Section visibility is settings-driven, and the interface can hide entire regions when feature toggles disable them.

Session list behavior includes sorting and selection rules, optional active-session pinning, favorites filtering, date picker selection, delete controls, and undo workflows. It supports list-style variants and enforces limits through settings. The dashboard also manages live indicator states that distinguish local live data, sync snapshot source, paused tracking, and extension-context availability.

The stats and honesty panels translate structural data into interpretable outputs such as deepest chain, common start across sessions, trap door presentation, return path sequence, and callout messaging. This demonstrates a full pipeline from telemetry to human-facing interpretation.

## Summary generation and AI integration

The system supports two summary modes: deterministic heuristic summaries and optional AI-generated summaries. Heuristic output is always available, ensuring resilient functionality. AI summaries are generated through prompt construction in dashboard logic and can produce brief and detailed variants.

Prompt payloads include session range, active time, pages touched, navigation count, labels, mirror summary, category/domain highlights, trap door cues, and style preferences such as tone, voice, personality, technicality, verbosity, length, formatting mode, bullet style preference, metaphor preference, and emoji level.

Caching and refresh controls include cooldown and cache duration settings. Summary refresh behavior is debounce-controlled and protected by request identity checks so stale responses cannot override newer state.

The local proxy server (`ollama-proxy.js`) listens on port 3000 at `/analyze`, validates request shape, applies origin checks, handles CORS for allowed origins, enforces body and prompt size bounds, applies per-origin or per-address rate limiting, forwards non-streamed generation calls to local Ollama (`http://localhost:11434/api/generate`), and returns normalized responses. This includes defensive error handling for invalid routes, payload oversize, model fallback, upstream failure propagation, and startup port conflicts.

## Settings system and sanitization discipline

Settings are distributed across popup, dashboard, personalization, and technical pages. The implementation normalizes and clamps user input before state application. Numeric fields enforce ranges for session timeout, idle timeout, list size, summary windows, and realtime batch windows. Enum-like fields are constrained to explicit allowed choices. Free-text fields are trimmed and length-limited. Endpoint fields are URL-normalized with protocol checks. Site lists and category overrides are parsed and canonicalized.

The settings architecture includes undo snapshot support (`irht_settings_undo`) and immediate save scheduling behavior. Dashboard settings include both content visibility and behavior toggles, making the interface adaptable while preserving deterministic defaults.

## Session actions and message protocol

Runtime messages from dashboard and popup to background include `get_state`, `user_activity`, `reset_state`, `session_reset`, `session_archive`, `session_unarchive`, `session_delete`, `session_restore`, `session_favorite_toggle`, `session_delete_all`, and `session_summary_update`. These handlers are centralized in background runtime messaging and return explicit response payloads where appropriate.

This protocol design allows UI components to remain mostly declarative, delegating state mutation authority to the background worker and reducing duplicate business logic.

## Security, privacy, and data locality

Core operation is local-first. Browsing state is stored in browser storage, not a remote backend. AI calls are optional and can remain local when using Ollama on the same machine. The proxy enforces origin and rate constraints and only exposes a narrow endpoint shape. No cloud requirement exists for baseline tracking, scoring, and dashboard behavior.

Permissions are broad enough to capture navigation and activity accurately, but the architecture narrows data use to local reflective analytics. Sync is optional and uses a slim snapshot model rather than full raw event mirror by default.

## Performance and scalability controls

Performance controls exist at every layer. In ingestion, content script throttling and batching reduce message pressure. In persistence, debounced writes reduce storage churn. In storage format, session trimming and URL-table compaction reduce footprint. In dashboard rendering, graph caps, conditional graph rendering, realtime batching, optional worker offload, and optional frame-aligned painting reduce main-thread load. In port updates, delta mode reduces payload size when enabled.

These controls are not superficial options; they map directly to constants and feature toggles in code, making performance tuning observable and configurable.

## Testing strategy and quality signals

The project uses Node's built-in test runner and jsdom where DOM simulation is needed. Test files include `background.test.js`, `content.test.js`, `dashboard.test.js`, `insights.test.js`, `ollama-proxy.test.js`, `popup.test.js`, `realtime-worker.test.js`, `shared.test.js`, and `test-helpers.js`. The test corpus size and coverage thresholds indicate strong investment in regression resistance for both logic and UI behavior.

The system also exposes targeted test hooks under `__IRHT_TEST_HOOKS__` in modules, enabling deterministic unit-level access to internals without needing brittle integration-only tests. This is a meaningful engineering pattern because it balances encapsulation with testability.

## Notable defaults and constants

Representative defaults include `sessionTimeoutMinutes = 15`, `userIdleMinutes = 3`, `summaryAutoRefresh = false`, `syncEnabled = false`, `trackingPaused = false`, `sessionListLimit = 12`, `ollamaEndpoint = http://localhost:3000/analyze`, and `ollamaModel = llama3`. Realtime controls default mostly off except `realtimePortPush = true`, indicating a conservative opt-in approach for advanced streaming behavior.

Core behavioral constants include max events `5000`, graph initial node cap `40`, warm graph cap `80`, navigation coalesce windows ranging from `150 ms` to `900 ms`, trap door thresholds of `20 minutes` and depth `6`, and storage trim bounds of `60` nodes, `120` edges, and `350` events for older sessions.

## Resume signal extraction guidance by role

For backend and platform-oriented roles, this project demonstrates event-driven system design, schema migration, compact serialization, retention policies, debounced persistence, realtime delta broadcasting, and resilient state recovery on startup. It also demonstrates practical handling of browser API constraints and storage ceilings with explicit trimming heuristics.

For frontend and product engineering roles, it demonstrates large-scale single-file UI orchestration, state-driven rendering, multi-panel interaction design, graph and timeline visualization, settings UX architecture, optimistic updates, and render-performance controls including worker offload and frame alignment.

For data, analytics, and applied ML-adjacent roles, it demonstrates feature engineering from user-behavior telemetry, interpretable scoring systems, entropy-based intent drift modeling, heuristic narrative generation, trap door attribution logic, and optional LLM integration with deterministic fallback paths.

For QA and SDET roles, it demonstrates strict coverage enforcement, module-level test hooks, heavy edge-case validation, and integration tests across background event processing, UI rendering, worker orchestration, and network proxy behavior.

For security- and reliability-leaning roles, it demonstrates local-first architecture, controlled API surface exposure, CORS and rate-limiting safeguards in auxiliary services, and fail-safe behavior when optional dependencies are unavailable.

## Current documentation drift notes

The implementation contains features that exceed or differ from older documentation snapshots. Manifest version in code is currently `1.0.0` while older docs may reference earlier semantic version values. Category coverage in code includes twelve categories, while some documentation text still reflects an earlier six-category set. Realtime and intent-drift settings are implemented across background and dashboard code paths and technical settings UI, and they should be treated as first-class current features.

This project dossier should therefore be considered more authoritative for resume extraction than stale summary text, because it was assembled from current implementation files.

## Proven metrics (repo-verified)

The following metrics are directly verified from code and command output in this repository, not estimated:

- Measurement snapshot timestamp: `2026-02-13 21:35:37 +05:30`.
- Tracked files in git: `35`.
- Source composition (tracked): `20` JavaScript files, `6` HTML files, and `3` CSS files.
- Dashboard directory footprint (tracked files): `11`.
- Test file count (`test/*.js`): `9`.
- Source JavaScript footprint (excluding `test/`): `11` files and `13,660` lines.
- Test JavaScript footprint: `9` files and `15,974` lines.
- Largest runtime modules by size:
- `dashboard/dashboard.js`: `6,431` lines, `207,047` bytes.
- `background.js`: `3,636` lines, `107,735` bytes.
- `graph.js`: `752` lines, `22,806` bytes.
- Background message actions handled in `handleMessage`: `11`.
- Background listener registrations (`addListener` occurrences): `16`.
- Category metrics from `categories.js` runtime evaluation:
- Category rule groups: `11`.
- Final category list size: `12`.
- Manifest/runtime baseline:
- Manifest version: `3` (MV3).
- Extension version: `1.0.0`.
- Chrome permissions count: `6`.
- Host permission entries: `3`.
- Minimum Chrome version: `116`.
- Hard limits and constants verified in code:
- Max session events ring buffer: `5000`.
- Session keep-recent count: `60`.
- Session keep-high-value count: `20`.
- Full-detail sessions retained: `5`.
- Trim caps for older sessions: `60` nodes, `120` edges, `350` events.
- Navigation coalesce windows: `150 ms` min, `350 ms` base, `900 ms` max.
- Trap door thresholds: `20 minutes` post-duration, `6` depth, `3` max results.
- Content activity throttles: `2.5 s`, `7 s`, `10 s`, `14 s`, with `250 ms` batch window.
- Dashboard graph and async timing limits:
- Initial graph cap: `40` nodes; warm cap: `80` nodes.
- Worker task timeout: `4000 ms`.
- Ollama request timeout: `20000 ms`.
- Summary refresh timeout: `25000 ms`.
- Proxy safety limits (`ollama-proxy.js`):
- Port: `3000`.
- Max request body: `512 KB`.
- Max prompt length: `20,000` chars.
- Rate limit window: `60 s`.
- Rate limit max: `30` requests per key per window.
- Test command and coverage gate (from `package.json`):
- `npm test` uses `c8 --check-coverage --all --lines 100 --functions 100 --branches 100 --statements 100 node --test`.
- Latest local run result:
- Test cases executed: `277`.
- Pass: `277`, Fail: `0`.
- Total test duration: `9102.8799 ms`.
- c8 combined coverage summary: `98.98%` statements, `96.03%` branches, `99.62%` functions, `98.98%` lines.
- Because thresholds are globally set to `100%` for all files, the command currently exits with coverage failure even though all tests passed.

## Candidate impact statements to quantify later

This section records measurable axes that can be turned into quantified resume bullets once personal usage or benchmark data is available. Candidate metrics include event throughput handled without UI lockups, storage footprint reduction from URL-table compaction compared with raw JSON, dashboard render-time improvement with worker offload enabled, message volume reduction with delta sync and batching, summary refresh latency with and without caching, and regression reduction evidenced by strict coverage gates. Quantified values are not embedded here because they depend on local measurement runs, but the instrumentation and feature flags needed for comparison already exist.

## Final project summary

Internet Rabbit Hole Tracker is a full-stack browser analytics product implemented as a Chrome MV3 extension with local-first architecture, rich behavioral modeling, configurable UX surfaces, optional local AI summaries, and unusually strong test rigor for a client-side extension project. It is suitable for resume positioning across frontend, backend, analytics, applied AI integration, and quality engineering tracks because the codebase contains substantive evidence in each area rather than superficial feature stubs.
