# Internet Rabbit Hole Tracker - Full Project Documentation

This document is intentionally exhaustive and descriptive. It covers the purpose, behavior, and structure of the project without pasting source code.

## Purpose (Why)

Internet Rabbit Hole Tracker is a Chrome extension that helps users understand how their browsing sessions unfold. It records where time goes, how navigation chains form, and what patterns emerge (focus, drift, looping, late-night behavior). The goal is not surveillance or productivity scoring - it is reflective insight: a calm, honest mirror of browsing habits with optional AI summaries.

## What the Project Delivers (What)

- Session-aware browsing capture with active-time tracking (tab focus + user activity + idle detection).
- A navigational graph of visited pages and transitions (nodes + edges).
- Heuristic insights and labels (no AI required).
- Optional AI summaries through a local Ollama proxy.
- A popup "micro dashboard" for at-a-glance stats and actions.
- A full dashboard with timelines, graph visualization, stats, honest insights, and settings.
- Optional sync of a slim snapshot for multi-device continuity.

## Where Things Live (Repository Map)

### Core JavaScript
- `background.js` - MV3 service worker. Tracking, session lifecycle, storage, insights, message handling.
- `content.js` - Content script that pings user activity for accurate active-time tracking.
- `shared.js` - Shared scoring/utility helpers used by background and dashboard.
- `insights.js` - Heuristic mirror summaries and insight generation (no AI).
- `popup.js` - Popup UI logic and rendering.
- `dashboard/dashboard.js` - Dashboard UI logic, summaries, rendering, settings, graph, timeline.

### UI
- `popup.html`, `popup.css` - Extension popup UI.
- `dashboard/index.html`, `dashboard/dashboard.css` - Main dashboard UI.
- `dashboard/settings.html` - Popup settings page.
- `dashboard/settings-dashboard.html` - Dashboard settings page.
- `dashboard/settings-personalization.html` - Look-and-feel + summary style settings.
- `dashboard/settings-technical.html` - Technical settings + export/reset.
- `dashboard/settings.css` - Shared settings UI styles.

### Configuration and Metadata
- `manifest.json` - Extension manifest (MV3, permissions, content scripts).
- `package.json`, `package-lock.json` - Development scripts and dependencies.
- `README.md` - Quick install and overview.

### Optional Local AI Proxy
- `ollama-proxy.js` - Node.js proxy that forwards prompts to local Ollama.

### Tests
- `test/background.test.js`
- `test/content.test.js`
- `test/insights.test.js`
- `test/shared.test.js`
- `test/popup.test.js`
- `test/dashboard.test.js`
- `test/test-helpers.js`

### Generated/Local Artifacts
- `coverage/` - Coverage output from tests.
- `node_modules/` - Node dependencies.

## Install / Run / Test (How)

- Load the extension unpacked via `chrome://extensions` (Developer mode enabled).
- Optional AI summaries: run `npm start` or `npm run dev` to start the local Ollama proxy at `http://localhost:3010/analyze`.
- Tests: `npm test` runs Node's test runner with c8 coverage, enforcing 100% on background/content/popup/dashboard.

## Manifest (Extension Configuration)

- Manifest: MV3 (`manifest_version: 3`).
- Name: Internet Rabbit Hole Tracker
- Version: 0.1.0
- Description: Tracks active browsing time and navigation chains.
- Permissions: `tabs`, `history`, `storage`, `webNavigation`, `idle`, `alarms`.
- Host permissions: `<all_urls>` and `http://localhost:3010/*` (local proxy).
- Background service worker: `background.js`.
- Options page: `dashboard/settings.html` (opens in tab).
- Content script: `content.js` on `<all_urls>`, run at `document_idle`.
- Action popup: `popup.html`.

## Packages and Tooling

- `npm test` uses `node --test` plus `c8` with `--check-coverage` and 100% thresholds.
- Dev dependencies: `c8`, `jsdom`.
- No build step; assets are used directly by Chrome.

## System Architecture (How It Works)

### Data Flow Summary

1. **Content script** observes real user activity (mouse, keyboard, scroll, visibility) and sends `user_activity` messages to the background service worker.
2. **Background service worker** listens to browser events (tabs, navigation, idle, alarms) and builds a session graph with nodes, edges, and events.
3. **State** is persisted to `chrome.storage.local` (`irht_state`) and optionally a slim snapshot to `chrome.storage.sync` (`irht_state_sync`).
4. **Popup** reads from storage and shows a compact glance + action.
5. **Dashboard** reads from storage and renders summaries, insights, graph, timeline, and settings. It also triggers AI summaries through the local proxy when enabled.

### Core Components

- **Background (tracking core):** session lifecycle, active time calculations, graph building, scoring, persistence, and runtime messaging.
- **Content script:** activity heartbeat and throttling logic for accurate "active time."
- **Shared + Insights:** shared scoring and heuristic analysis used across the system.
- **Popup:** micro dashboard + quick action.
- **Dashboard:** full visualization and settings hub.
- **Ollama proxy:** optional local AI prompt relay.

### Content Script Activity Sampling

- Listens to mouse, keyboard, scroll, pointer, touch, and visibility events.
- High-frequency events (mousemove/scroll/wheel/pointerdown) only count when the tab is visible and focused.
- Throttling tiers: 2.5s (typing/visibility), 7s (mixed), 10s (default), 14s (reading/scroll).
- Batches rapid activity into a 250ms window to avoid message spam.

## Storage Model (Where Data Lives)

### Chrome Storage Keys

- Local storage key: `irht_state` - full state (sessions, tracking, settings cache used by UI).
- Sync storage key: `irht_settings` - user settings.
- Sync storage key: `irht_state_sync` - optional slim snapshot (latest sessions only).
- Local storage key: `irht_daily_session_reset_v4` - one-time flag for daily-session reset.

### Local Storage Keys (Dashboard)

- `irht_force_summary_refresh` - forces summary regeneration on demand.
- `rabbit_shame_enabled` - dashboard toggle for direct callouts.
- `irht_settings_undo` - snapshot for settings undo.

### Persisted State Schema (Top Level)

- `schemaVersion`: 4
- `sessions`: map of sessionId -> session object
- `sessionOrder`: ordered array of session ids
- `activeSessionId`: currently active session id
- `tabs`: per-tab tracking data (trimmed on persist)
- `tracking`: live tracking state (active tab/url, last activity, idle flags)

### Session Object (Core Fields)

- Identity and timing: `id`, `startedAt`, `updatedAt`, `endedAt`, `endReason`, `lastActivityAt`
- Graph data: `nodes` (URL nodes), `edges` (transition edges)
- Tracking: `navigationCount`, `events` ring buffer + `eventCursor`, `eventCount`
- Insights: `metrics`, `trapDoors`, `categoryTotals`, `distractionAverage`, `label`, `labelDetail`
- Summaries: `summaryBrief`, `summaryDetailed`, `summaryUpdatedAt`
- Archive/delete/favorite flags: `archived`, `archivedAt`, `deleted`, `deletedAt`, `favorite`, `favoriteAt`

### Node Object (Per URL)

- `id`, `url`, `title`
- `category` (auto/override category)
- `visitCount`
- `activeMs`
- `firstNavigationIndex`, `lastNavigationIndex`
- `firstSeen`, `lastSeen`
- `distractionScore`, `distractionComponents`

### Edge Object (Transition)

- `id` ("from -> to")
- `from`, `to`
- `visitCount`
- `activeMs`
- `firstSeen`, `lastSeen`

## Session Lifecycle and Event Capture

### Session Boundaries

- Sessions align to the local calendar day: start at 12:00 AM and end at 11:59 PM.
- A session is created for a day when Chrome is open that day; if Chrome is never opened, no session is created.
- Inactivity no longer splits sessions (idle still gates active-time tracking).
- The active session is updated while the tab is active, window focused, and the user is not idle.
- One-time migration: existing sessions are cleared the first time daily sessions are enabled.

### Event Sources

- Tabs: activated, updated, created, removed.
- Windows: focus changes.
- Web navigation: committed, history state updates, hash changes, created targets.
- Idle: state changes.
- Alarms: periodic idle checks.
- Runtime messages: session actions and user activity.
- Storage changes: settings updates.

### Event Types (Recorded)

- navigation, tab_activated, tab_active, tab_created, tab_closed
- url_changed, title_changed, hash_changed, navigation_target_created
- user_active, user_inactive, idle_state_changed
- session_started, session_ended, active_time_flushed
- storage_error, sync_error, url_untrackable, window_focus_changed

### Navigation Coalescing and Timing

- Navigation events are coalesced for stability.
- Coalesce window: baseline 350ms, min 150ms, max 900ms.
- Daily rollover ends the session at 11:59 PM and starts the next day's session at 12:00 AM.
- Active time is computed per node and summarized into session metrics.

## Classification and Categories

### Built-in Categories

- Study, Social, Video, Shopping, News, Random

### Category Rules

- Category rules are domain-based (built-in lists in `background.js`).
- Overrides allow custom domain patterns to force a category.
- An optional AI category hook (`IRHTAICategoryHook`) can propose categories when integrated.
- Technical URLs (login/auth/redirect flows) are detected and treated as lower-intent browsing.

### Category Multipliers (Impact on Score)

- Study: 0.7
- News: 0.85
- Shopping: 1.15
- Social: 1.3
- Video: 1.4
- Random: 1.0

### Site Lists (Intent Overrides)

- Productive sites: down-weight distraction score.
- Distracting sites: up-weight distraction score.

## Distraction Scoring (Shared Logic)

The distraction score is computed per node and summarized at the session level. It combines:

- Active time weight (log-scaled and capped)
- Chain depth weight (how deep the navigation chain went)
- Late-night weight (if browsing happened late-night)
- Intent modifiers (technical URL, focused dwell, rapid hop, feed-like, looping)
- Site-list overrides (productive vs distracting)
- Category multiplier

Key constants:

- Active weight cap: 1.6
- Active weight divisor: 1.45
- Late-night window: 23:00-06:00
- Late-night weight: 0.6
- Productive weight: 0.7
- Distracting weight: 1.2

## Heuristic Insights (No AI Required)

### Insights Engine

`insights.js` analyzes sessions and generates:

- Mirror summary (short descriptive label)
- Insight list (focus, wander, loop, feed-like, late-night, short session)

### Thresholds

- Short session: totalActiveMs < 90s
- Focus: topShare >= 0.6 AND avgActiveMs >= 120s AND hopRate <= 1.5
- Wandering: avgActiveMs <= 45s OR hopRate >= 3
- Looping: revisitShare >= 0.35 AND totalPages >= 4
- Feed-like: avgActiveMs < 40s AND navCount >= pages x 1.3, OR hopRate >= 4
- Late-night: first activity between 23:00-06:00

### Tone

- Neutral (default) or Direct.

## Trap Door Detection

Trap doors are pages that appear to pull users into deeper browsing.

- Minimum post-visit duration: 20 minutes
- Minimum post-visit depth: 6 steps
- Score: duration share x 0.7 + depth share x 0.3
- Max results: 3

## Graph and Timeline

### Graph

- Graph is available for any session when the graph section is enabled (no minimum node count).
- Two modes: **By domain** and **By page**.
- Nodes are pages or domains; edges are transitions between them.
- Empty state: "No graph yet." appears when there are zero nodes.
- Graph data cap (initial): 40 nodes.
- Graph data cap (warm): 80 nodes.
- Trimming favors the most active nodes.
- Node size reflects active time; colors are drawn from a fixed palette.
- Layout is preserved across updates when the underlying graph key matches.
- `ForceGraph` drives layout and interaction (tooltip on hover).

### Timeline

- Timeline segments visualize active time blocks per domain.
- Start and end times show the session range.
- Segments are proportional to time and colored by domain.

## Summaries (AI + Heuristic)

### Heuristic Summaries

- Always available via `IRHTInsights.buildSessionMirror`.
- Used as fallback when AI summaries are unavailable.

### AI Summaries (Optional)

- Dashboard builds **brief** and **detailed** prompts based on session data and user summary preferences.
- Prompts are sent to the local proxy (`ollamaEndpoint`), which forwards to Ollama's `/api/generate`.
- Summaries are cached per session and can be refreshed manually.
- Cooldown and cache duration are configurable.
- Auto-refresh (if enabled) refreshes summaries when session data changes.
- Refresh logic avoids duplicate work when summaries are already up to date.

### Summary Prompt Data Inputs

- Session range, active time, pages touched, navigation events
- Label and label detail
- Mirror summary + origin
- Optional top categories and top domains
- Optional turning point (trap door)

### Summary Style Controls

- Tone (neutral/direct)
- Voice (mentor/analyst/friend)
- Personality (gentle/balanced/direct)
- Technicality (soft/neutral/technical)
- Emoji level (none/low/medium/high)
- Formatting (plain/markdown)
- Bullets and metaphors toggles
- Length (short/medium/long)
- Verbosity (brief/standard/detailed)

## Popup UI (Micro Dashboard)

### What It Shows

- Header ("Attention Atlas")
- Optional mood chip, note, micro note
- Quick-glance metrics (selectable)
- One-tap action button

### Quick-Glance Metrics

- Active time
- Top domain
- Distraction score
- Session label
- Last action
- Active time includes live time from the currently active tab when tracking is in progress.
- Quick-glance ordering prioritizes active time, distraction score, and last action.
- If more than three metrics are enabled, a More/Less toggle appears.
- If no metrics are enabled, the quick-glance block is hidden.
- If metrics are enabled but there is no session data, a "No session yet" placeholder is shown.

### Actions

- Open dashboard
- Pause tracking
- Copy summary
- Start focus

An internal "adaptive" action exists in popup logic but is not exposed in the settings UI.

### Popup Layout and Density

- Layouts: stack, cards, focus
- Densities: roomy, compact

## Dashboard UI

### Core Views

- Summary cards (brief optional + detailed)
- Session list (cards/list/minimal)
- Overview highlights (mirror + insights + actions)
- Deep dive tab: Timeline
- Deep dive tab: Graph
- Deep dive tab: Stats
- Deep dive tab: Honesty
- Session list renders the full list in the DOM (no virtualization).
- A live indicator reflects whether the dashboard is reading active data.

### Stats Panel

- Session range
- Active time
- Pages touched
- Navigation edges
- Deepest chain
- Common start
- Trap door
- Session label
- Top domains, pages, distractions

### Honesty Panel

- Damage receipts
- Return path (start -> trap door -> end)
- Callouts

### Session Controls

- Delete (confirmation + undo).
- Favorites star toggle on each session card (only shown if enabled).
- Favorites-only filter in the session controls (only shown if enabled).
- Pin active session.
- Delete button is only shown when enabled in settings.

## Settings (All Categories)

### Popup Settings (settings.html)

- Popup layout style (stack/cards/focus)
- Quick-glance toggles (active time, top domain, distraction score, session label, last action)
- One-tap action (open dashboard, pause tracking, copy summary, start focus)
- Popup subtitle
- Micro note
- Mood chip text
- Popup density
- Open dashboard label

### Dashboard Settings (settings-dashboard.html)

- Dashboard focus note
- Section toggle: Overview
- Brief summary (toggle, default off)
- Section toggle: Sessions (default off; enabling it auto-enables calendar/favorites/delete)
- Enable calendar (toggle, default off)
- Enable favorites (toggle, default off)
- Enable delete button (toggle, default off)
- Section toggle: Timeline
- Section toggle: Graph
- Section toggle: Stats
- Section toggle: Honesty
- Section toggle: Callouts
- Story mode (reflow layout)
- Focus prompts (list)
- Outcome highlights and overview highlights
- Session list style (cards/list/minimal)
- Pin active session
- Session list limit

### Personalization (settings-personalization.html)

- Theme (warm, ink, forest, retro, paper, noir)
- Tone (neutral/direct)
- Direct callouts toggle
- UI density (comfortable/compact)
- Reduce motion
- Accent color (hex)
- Typography style (calm/bold/technical)
- Summary style control: Personality
- Summary style control: Emoji level
- Summary style control: Formatting (plain/markdown)
- Summary style control: Bullets
- Summary style control: Metaphors
- Summary style control: Length
- Summary style control: Verbosity
- Summary style control: Technicality
- Summary style control: Voice

### Technical (settings-technical.html)

- Session timeout minutes
- Idle timeout minutes
- Productive and distracting site lists
- Category overrides
- Summary auto-refresh
- Summary cache duration
- Summary refresh cooldown
- Ollama endpoint and model
- Sync toggle
- Tracking pause toggle
- Export data
- Reset state
- Delete all sessions

## Defaults (Complete Settings Snapshot)

- sessionTimeoutMinutes: 15
- userIdleMinutes: 3
- theme: warm
- syncEnabled: false
- trackingPaused: false
- categoryOverrides: {}
- tone: neutral
- directCallouts: false
- productiveSites: []
- distractingSites: []
- summaryAutoRefresh: false
- dashboardFocusNote: ""
- popupNote: ""
- dashboardButtonLabel: "Open dashboard"
- uiDensity: comfortable
- reduceMotion: false
- sessionListLimit: 12
- ollamaEndpoint: "http://localhost:3010/analyze"
- ollamaModel: "gpt-oss:120b-cloud"
- popupLayout: stack
- popupDensity: roomy
- popupQuickGlance: []
- popupPrimaryAction: open_dashboard
- popupMicroNote: ""
- popupMood: ""
- dashboardSections: overview true, sessions false, timeline false, graph false, stats false, honesty false, callouts false
- dashboardStoryMode: false
- sessionListStyle: cards
- pinActiveSession: true
- focusPrompts: []
- showOutcomeHighlights: false
- showOverviewHighlights: false
- showBriefSummary: false
- showDeleteButton: false
- showFavorites: false
- showCalendar: false
- accentColor: ""
- typographyStyle: calm
- summaryPersonality: balanced
- summaryEmojis: low
- summaryFormatting: plain
- summaryBullets: false
- summaryMetaphors: false
- summaryLength: medium
- summaryVerbosity: standard
- summaryTechnicality: neutral
- summaryVoice: mentor
- summaryRefreshCooldownMinutes: 0
- summaryCacheMinutes: 0

## Performance, Limits, and Trimming

- Max session events: 5000 (ring buffer).
- Persist debounce: 1200ms (max wait 5000ms).
- Deleted session retention: 7 days.
- Session event retention: 14 days.
- Deleted session prune interval: 30 minutes.
- URL metadata cache size: 2000 entries.
- Storage trimming: full detail retained for last 5 sessions + active session.
- Storage trimming: trim to 60 nodes, 120 edges, 350 events per session for older sessions.
- Encoded storage uses a URL table to deduplicate URLs.

## Sync Behavior

- When `syncEnabled` is on, a slim snapshot is written to `chrome.storage.sync`.
- Sync snapshot prioritizes recent sessions and compact data for bandwidth/size limits.

## Ollama Proxy (Optional, Local)

- Runs on port 3010 and exposes `/analyze`.
- Forwards prompts to local Ollama at `http://localhost:11434/api/generate`.
- Uses model `gpt-oss:120b-cloud` by default.
- Adds CORS headers to allow the dashboard to fetch summaries.

## Testing

- Node built-in test runner (`node --test`) with `jsdom` for DOM simulation.
- c8 enforces 100% coverage for `background.js`, `content.js`, `popup.js`, and `dashboard/dashboard.js`.
- Tests cover migrations, session logic, scoring, insights, UI rendering, storage edge cases, and async flows.

## Design and UX Notes

- The dashboard branding is "Attention Atlas."
- The system prefers "reflection over judgment."
- Direct callouts are optional and user-controlled.
- Everything works offline except optional AI summaries.

## Known Behavior Notes

- Graph visualization is available for any session size; if no nodes exist, the empty state is shown.
- Summary regeneration is rate-limited by settings and can be manually triggered.
- Storage writes are debounced to reduce churn.

## Deep Dive Appendix (Exhaustive Behavior Details)

This section expands on the "why, how, and where" of each major part of the system with explicit behavior notes and edge cases. It still avoids pasting source code.

### Background Service Worker: Initialization Flow

1. Imports `shared.js` when running in the service worker context.
2. Loads state from storage (`irht_state`) and runs schema upgrade/migration logic as needed.
3. Primes a few recent sessions for dashboard use (precomputes insights or metrics).
4. Prunes deleted sessions if enough time has passed since the last prune.
5. Hydrates runtime variables from stored state.
6. Ensures the active session is aligned to the current day (rolls over at midnight).
7. Loads settings from sync, sanitizes them, and applies any tracking pause changes.
8. Configures idle detection (`chrome.idle.setDetectionInterval(60)`).
9. Creates a 1 minute alarm that periodically evaluates idle state.
10. Refreshes window focus, idle state, and active tab data.
11. Registers all listeners and persists state.

### Background Service Worker: Listeners and Inputs

- Tabs:
  - onActivated, onUpdated, onRemoved, onCreated.
- Windows:
  - onFocusChanged.
- Idle:
  - onStateChanged.
- WebNavigation:
  - onCommitted for http/https schemes.
  - onHistoryStateUpdated (SPA navigation).
  - onReferenceFragmentUpdated (hash changes).
  - onCreatedNavigationTarget.
- Alarms:
  - periodic idle evaluation (alarm name: `user_idle_check`).
- Runtime messaging:
  - reads full state and performs session actions.
- Storage changes:
  - applies updated settings and sync state.

### Background Runtime State (In-Memory)

- Active tab identity: id, url, title.
- Active edge key (current from -> to transition).
- Activity timestamps: `activeSince`, `lastInteractionAt`, `lastInactiveAt`.
- Idle state flags: `userIdle`, `idleState`, `windowFocused`.
- Settings cache: the current sanitized settings.
- URL meta caches: normalized URL cache and URL meta cache (limit 2000 entries each).

### Session Splitting Rules (When a New Session Starts)

- Daily rollover:
  - If the current time is in a new day, the prior session ends at 11:59 PM with reason `day_end`.
  - A new session starts at 12:00 AM with reason `day_start`.
- Inactivity and intent shifts no longer split sessions (idle still gates active-time tracking).

### Navigation Event Coalescing (Background)

Navigation events are coalesced to avoid noisy duplicates:
- If the previous navigation happened <= 1200ms ago, coalesce window is 150ms.
- If the previous navigation happened <= 4000ms ago, coalesce window is 350ms.
- If older than that, coalesce window is 900ms.

### Session Trimming Strategy (Storage Size Control)

The state is trimmed before persistence to reduce size while keeping meaningful data:

- Keep recent sessions:
  - Always keep the last 60 sessions (`SESSION_KEEP_RECENT`).
  - Always keep archived and deleted sessions.
  - Always keep the active session.
- Keep high-value sessions:
  - Score sessions by active time + nav count + node count + distraction.
  - Keep the top 20 high-value sessions (`SESSION_KEEP_HIGH_VALUE`).
- Drop trivial sessions:
  - A session is considered trivial if:
    - active time < 2 minutes
    - navigation count < 3
    - node count < 4
  - Trivial sessions outside the keep sets are removed.
- Full detail retention:
  - Only the most recent 5 sessions plus the active session keep full details.
  - Older sessions are trimmed to:
    - Top 60 nodes (by weighted value)
    - Top 120 edges (by weighted value)
    - Top 350 events

### Session Value Scoring (Used for Trimming)

Session value uses a simple weighted sum:
- activeMs
- navCount * 15000
- nodeCount * 10000
- distraction * 1000

### Compact Storage Format (URL Table Encoding)

For compact storage, URLs are de-duplicated into a table:

- `urlTable`: array of unique URLs.
- Nodes store `urlId` instead of URL strings.
- Edges store `fromId` and `toId` instead of URLs.
- Trap doors store `urlId` (URL string removed).

Decoding restores:
- `nodes` as a map keyed by URL with full node fields.
- `edges` as a map keyed by "from -> to".
- `trapDoors` with the URL rehydrated.

### Node and Edge Trim Weighting

- Node trim uses:
  - active time * (1 + distraction weight)
  - late-night signal is cached on the node
  - classification is filled if missing
- Edge trim uses:
  - active time
  - amplified by connected node scores

### Category Classification (Background and Dashboard)

URL classification logic:
- Category overrides in settings win first (domain pattern match).
- `.edu` -> Study, `.gov` -> News, `news.*` -> News.
- Google search URLs count as Study.
- Domain rule lists apply next.
- Optional AI hook can propose a category (must match known categories).
- Fallback: Random.

### Settings Sanitization (Background)

The background service worker clamps and normalizes:
- sessionTimeoutMinutes: 3 to 120 (default 15, no longer splits daily sessions)
- userIdleMinutes: 1 to 30 (default 3)
- tone: "direct" or "neutral"
- syncEnabled, trackingPaused, directCallouts: booleans
- categoryOverrides: normalized domain patterns and canonical categories
- productiveSites, distractingSites: normalized domain pattern lists

### Dashboard: High-Level Flow

1. Starts in offline mode if chrome storage is not available.
2. Attempts to read state from background (fast path with an 80ms timeout).
3. Falls back to local storage, then to sync storage (if enabled).
4. Applies sanitized settings and theme before rendering.
5. Renders the overview, timeline, and deep dive sections.
6. Only renders the graph when the Graph tab is active, to avoid extra work.

### Dashboard: Live Indicator Behavior

- "Live data" when reading local state.
- "Sync snapshot" when using sync state.
- "Open from extension" when opened outside the extension environment.
- "Tracking paused" overrides the indicator when tracking is paused.

### Dashboard: Session List Behavior (Exact)

- The list is built from `sessionOrder` but excludes deleted sessions.
- Archived sessions are treated like normal sessions (no archive filter).
- Sessions are sorted by most recent start time.
- If "Pin active session" is enabled, the active session is moved to the top.
- Active sessions without an end time use a display end time based on last activity.
- If favorites-only is enabled, only favorite sessions are shown.
- Each session row shows the day + date (no time-of-day group headers).
- If the calendar is enabled, picking a date selects the matching session or shows a toast if none exists.
- The Sessions panel is hidden by default; enabling Sessions auto-enables calendar, favorites, and delete toggles.
- The list auto-scrolls to the pinned active session using a fixed height estimate.

### Dashboard: Session Selection Rules

- Clicking a session card sets `followActiveSession`:
  - If you click the active session, it stays in follow mode.
  - If you click a past session, follow mode is disabled so the selection does not auto-jump.
- When new state arrives:
  - If follow mode is off, the dashboard keeps your current selection if it still exists.
  - If follow mode is on, it selects the active session.

### Dashboard: Deep Dive Tabs

- Tabs: Timeline, Graph, Stats, Honesty.
- The Graph tab sets `graphReady = true` and triggers graph render.
- If settings hide a section, its tab and panel are hidden.
- If all deep tabs are hidden, the deep dive container is hidden.

### Timeline Rendering Details

- Timeline segments are built from `active_time_flushed` events.
- Each segment includes start, end, duration, and domain.
- If the session is active, a live segment is appended using `tracking.activeSince`.
- Labels are based on domain name when available.
- Start/end labels use local time formatting (`toLocaleTimeString`).

### Graph Rendering Details (ForceGraph)

- Graph data is built in one of two modes:
  - "By page": nodes are URLs, edges are URL transitions.
  - "By domain": nodes are domains, edges are domain transitions.
- Graph caps:
  - Initial cap: 40 nodes.
  - Warm cap: 80 nodes.
- If graph data is empty, the empty overlay is shown.
- Layout is preserved when the computed graph key is unchanged.

ForceGraph physics and visuals:
- Node radius: 8 + sqrt(activeMs / maxMs) * 18.
- Node color: hashed from node id, mapped to a fixed palette.
- Only the top 8 most active nodes show labels.
- Edge width: 1 + log1p(edge.count) * 1.2.
- Simulation constants:
  - Repulsion: 1400
  - Spring: 0.0025
  - Centering force: 0.0015
  - Damping: 0.85
  - Target distance: 120
  - Iterations: 240 frames
- Tooltip:
  - Appears when the cursor is within radius + 6 px.
  - Displays truncated label (40 chars) and formatted active time.

### Summary Generation: Prompt Composition Details

Each prompt is built from:
- A base instruction block (brief or detailed).
- Style lines:
  - Tone
  - Voice
  - Personality
  - Technicality
  - Emoji level
  - Formatting
  - Bullets and metaphors rules
  - Length and verbosity preferences
- Session data lines:
  - Range, active time, page count, navigation count, label, label detail
  - Mirror summary and origin
  - Optional top categories and top domains
  - Optional turning point

Summary length rules:
- Brief:
  - short -> 1-2 sentences
  - medium -> 2-3 sentences
  - long -> 3-5 sentences
- Detailed:
  - short -> 1 short paragraph
  - medium -> 2-3 short paragraphs
  - long -> 3-5 short paragraphs

### Summary Caching and Refresh Rules

- Each summary has a `summaryUpdatedAt` timestamp.
- Cached summaries expire if `summaryCacheMinutes` is set.
- Auto-refresh (if enabled) schedules refreshes after summary debounce.
- Manual refresh always forces a new request.
- A request id guard prevents stale responses from overwriting newer ones.

### Popup: Detailed Behavior Notes

- The popup reads settings from sync and state from local storage.
- Quick-glance items render only for keys enabled in settings.
- If there is no session or metrics are missing:
  - The glance area shows a "No session yet" placeholder.
- Quick-glance ordering priority:
  - activeTime, distractionScore, lastAction
  - Remaining items keep their configured order.
- If more than 3 items are enabled, the list collapses and a "More" toggle appears.
- Primary action can be:
  - open_dashboard
  - pause_tracking
  - copy_summary
  - start_focus
- If "adaptive" is selected internally, the popup chooses action based on idle/session state.
- The dashboard button label defaults to "Open dashboard" if blank.
- Mood chip, note, and micro note hide themselves when empty.

### Dashboard Settings: Validation and Normalization Details

Settings are sanitized and normalized on every save:
- Colors accept #RGB or #RRGGBB and are normalized to #rrggbb.
- Session list limit is clamped to 3-40.
- Summary cache and cooldown are clamped:
  - cooldown: 0-120 minutes
  - cache: 0-1440 minutes
- Popup notes and labels are length-limited:
  - dashboard button label: 40 chars
  - popup note: 160 chars
  - micro note: 90 chars
  - mood: 12 chars
- Focus prompts are normalized:
  - Trim whitespace
  - Max 10 entries
  - Max 120 chars per entry

### Export Behavior

- Export button builds a JSON payload in this order:
  1) In-memory app state (if present)
  2) Fresh state from background
  3) Local storage state
  4) Sync state (if enabled)
- Output file name: `rabbit-hole-sessions-YYYY-MM-DD.json`.
- If blob export is not supported, the UI shows "Export unavailable."

### Error and Fallback Behavior

- If chrome storage is unavailable, the dashboard stays in offline mode.
- If the local proxy does not respond, summaries show "Summary unavailable."
- Storage read errors fall back to empty state without crashing UI.
- Clipboard errors in popup copy flow are silently ignored.

### Chrome APIs Used (By Feature)

- tabs: active tab tracking and opening new tabs.
- webNavigation: capture SPA and navigation transitions.
- idle: idle state changes and detection interval.
- alarms: periodic idle evaluation.
- storage: local state persistence and sync settings.
- runtime messaging: state fetch, session actions, and summary updates.

### Additional Dashboard UI State and Theme Rules

- Theme class toggles on body: `theme-warm`, `theme-ink`, `theme-forest`, `theme-retro`, `theme-paper`, `theme-noir`.
- Density class toggle: `ui-compact` when uiDensity is compact.
- Motion toggle: `reduce-motion` when reduceMotion is true.
- Story mode toggle: `story-mode` when dashboardStoryMode is true.
- Typography class toggles:
  - `typo-bold` when typographyStyle is bold.
  - `typo-technical` when typographyStyle is technical.
  - `typo-calm` when typographyStyle is calm.
- Accent color affects CSS variables:
  - `--accent` is the raw accent color.
  - `--accent-2` is a mixed, lighter accent.
  - `--accent-ink` is derived from accent luminance for contrast.

### Dashboard: DOM Element Map (Every ID and Purpose)

This is a full map of elements in `dashboard/index.html` and how they are used:

- `live-indicator`: visual live/sync/offline state.
- `live-label`: text for the live indicator.
- `summary-refresh`: button to regenerate AI summaries.
- `open-settings`: opens the settings pages.
- `summary-status`: text showing "Updating summary..." during AI calls.
- `brief-summary`: brief summary text.
- `detailed-summary`: detailed summary text.
- `focus-note`: custom focus note or prompt.
- `session-list`: list of sessions (cards).
- `session-list-empty`: empty-state for sessions.
- `session-delete`: deletes the current session (only shown if enabled; prompts for confirmation).
- `session-filter-favorites`: checkbox to show only favorite sessions (only shown if enabled).
- `session-calendar`: calendar control wrapper (only shown if enabled).
- `session-date-picker`: date input to jump to a specific session day.
- `overview-panel`: the overview highlights section.
- `overview-summary`: mirror summary.
- `overview-origin`: origin explanation.
- `overview-insights`: list of insights.
- `overview-insights-empty`: empty-state for insights.
- `overview-actions`: action recommendations.
- `overview-actions-empty`: empty-state for actions.
- `deep-dive`: container for deep dive panels.
- `timeline-track`: timeline blocks container.
- `timeline-legend`: timeline legend container.
- `timeline-start`: start time label.
- `timeline-end`: end time label.
- `graph-canvas`: force graph canvas.
- `graph-empty`: graph empty overlay text.
- `graph-tooltip`: hover tooltip for graph nodes.
- `deepest-chain`: chain length label.
- `deepest-chain-detail`: chain detail string.
- `common-start`: common start domain label.
- `common-start-detail`: additional common-start detail.
- `trap-door`: trap door domain label.
- `trap-door-detail`: trap door detail string.
- `session-label`: session label text.
- `session-label-detail`: label detail text.
- `top-domains`: top domains list.
- `top-pages`: top pages list.
- `top-distractions`: top distractions list.
- `damage-receipts`: honesty list of time sinks.
- `path-start`: return-path start.
- `path-trap`: return-path trap door.
- `path-end`: return-path end.
- `path-meta`: return-path meta string.
- `callouts-list`: list of callout messages.
- `toast`: toast container.
- `toast-message`: toast text.
- `toast-action`: toast action button (Undo).

### Dashboard: Session Actions UI Summary

- Delete:
  - Prompts for confirmation before sending.
  - Sends `session_delete`.
  - If it was active, ends it and starts a new session.
- Undo:
  - Delete undo uses `session_restore`.

### Popup: DOM Element Map (Every ID and Purpose)

- `popup-card`: layout container (layout classes apply here).
- `popup-note`: subtitle text.
- `popup-micro-note`: small sub-note.
- `popup-mood`: mood chip (emoji or short text).
- `popup-glance`: quick-glance metrics container.
- `dashboard-button`: main action button.

### Settings Pages: Field-to-Setting Mapping (Exact)

Each field id -> settings key -> value type -> normalization rules:

Popup settings (`dashboard/settings.html`):

- `setting-popup-layout` -> `popupLayout` -> enum:
  - must be one of stack/cards/focus, else default.
- `setting-popup-show-active-time` -> `popupQuickGlance` includes `activeTime` if checked.
- `setting-popup-show-top-domain` -> `popupQuickGlance` includes `topDomain` if checked.
- `setting-popup-show-distraction` -> `popupQuickGlance` includes `distractionScore` if checked.
- `setting-popup-show-session-label` -> `popupQuickGlance` includes `sessionLabel` if checked.
- `setting-popup-show-last-action` -> `popupQuickGlance` includes `lastAction` if checked.
- `setting-popup-action` -> `popupPrimaryAction` -> enum:
  - must be one of open_dashboard/pause_tracking/copy_summary/start_focus, else default.
- `setting-popup-note` -> `popupNote` -> text, max 160 chars.
- `setting-popup-micro-note` -> `popupMicroNote` -> text, max 90 chars.
- `setting-popup-mood` -> `popupMood` -> text, max 12 chars.
- `setting-popup-density` -> `popupDensity` -> enum:
  - must be roomy or compact.
- `setting-dashboard-button-label` -> `dashboardButtonLabel` -> text, max 40 chars.

Dashboard settings (`dashboard/settings-dashboard.html`):

- `setting-dashboard-note` -> `dashboardFocusNote` -> text, max 160 chars.
- `setting-dashboard-show-overview` -> `dashboardSections.overview` -> boolean.
- `setting-dashboard-show-sessions` -> `dashboardSections.sessions` -> boolean.
- `setting-dashboard-show-timeline` -> `dashboardSections.timeline` -> boolean.
- `setting-dashboard-show-graph` -> `dashboardSections.graph` -> boolean.
- `setting-dashboard-show-stats` -> `dashboardSections.stats` -> boolean.
- `setting-dashboard-show-honesty` -> `dashboardSections.honesty` -> boolean.
- `setting-dashboard-show-callouts` -> `dashboardSections.callouts` -> boolean.
- `setting-dashboard-show-overview-highlights` -> `showOverviewHighlights` -> boolean.
- `setting-dashboard-show-brief-summary` -> `showBriefSummary` -> boolean.
- `setting-dashboard-show-favorites` -> `showFavorites` -> boolean.
- `setting-dashboard-show-calendar` -> `showCalendar` -> boolean.
- `setting-dashboard-show-delete` -> `showDeleteButton` -> boolean.
- `setting-dashboard-story-mode` -> `dashboardStoryMode` -> boolean.
- `setting-focus-prompts` -> `focusPrompts` -> list:
  - max 10 items
  - max 120 chars each
  - trimmed and de-duplicated
- `setting-outcome-highlights` -> `showOutcomeHighlights` -> boolean.
- `setting-session-list-style` -> `sessionListStyle` -> enum (cards/list/minimal).
- `setting-pin-active-session` -> `pinActiveSession` -> boolean.
- `setting-session-list-limit` -> `sessionListLimit` -> number, clamped 3-40.

Personalization settings (`dashboard/settings-personalization.html`):

- `setting-theme` -> `theme` -> enum (warm/ink/forest/retro/paper/noir).
- `setting-tone` -> `tone` -> enum (neutral/direct).
- `setting-direct-callouts` -> `directCallouts` -> boolean.
- `setting-ui-density` -> `uiDensity` -> enum (comfortable/compact).
- `setting-reduce-motion` -> `reduceMotion` -> boolean.
- `setting-accent-color` -> `accentColor` -> color:
  - accepts #RGB or #RRGGBB, normalized to #rrggbb.
- `setting-typography-style` -> `typographyStyle` -> enum (calm/bold/technical).
- `setting-summary-personality` -> `summaryPersonality` -> enum (gentle/balanced/direct).
- `setting-summary-emojis` -> `summaryEmojis` -> enum (none/low/medium/high).
- `setting-summary-formatting` -> `summaryFormatting` -> enum (plain/markdown).
- `setting-summary-bullets` -> `summaryBullets` -> boolean.
- `setting-summary-metaphors` -> `summaryMetaphors` -> boolean.
- `setting-summary-length` -> `summaryLength` -> enum (short/medium/long).
- `setting-summary-verbosity` -> `summaryVerbosity` -> enum (brief/standard/detailed).
- `setting-summary-technicality` -> `summaryTechnicality` -> enum (soft/neutral/technical).
- `setting-summary-voice` -> `summaryVoice` -> enum (mentor/analyst/friend).

Technical settings (`dashboard/settings-technical.html`):

- `setting-session-timeout` -> `sessionTimeoutMinutes` -> number, clamped 3-120 (no longer splits daily sessions).
- `setting-idle-timeout` -> `userIdleMinutes` -> number, clamped 1-30.
- `setting-productive-sites` -> `productiveSites` -> list:
  - splits on newlines or commas
  - ignores empty lines and # comments
  - normalizes patterns (supports `*.` and `.` prefix)
- `setting-distracting-sites` -> `distractingSites` -> list (same rules as productive).
- `setting-category-overrides` -> `categoryOverrides` -> map:
  - one per line in the format `pattern=Category`
  - patterns normalized like site lists
  - categories must match built-in categories
- `setting-summary-auto-refresh` -> `summaryAutoRefresh` -> boolean.
- `setting-summary-cache` -> `summaryCacheMinutes` -> number, clamped 0-1440.
- `setting-summary-cooldown` -> `summaryRefreshCooldownMinutes` -> number, clamped 0-120.
- `setting-ollama-endpoint` -> `ollamaEndpoint` -> URL:
  - must be http/https
  - defaults to `http://localhost:3010/analyze`.
- `setting-ollama-model` -> `ollamaModel` -> text, max 80 chars.
- `setting-sync` -> `syncEnabled` -> boolean.
- `setting-tracking-paused` -> `trackingPaused` -> boolean.
- `export-data` -> triggers export pipeline.
- `reset-state` -> clears all state.
- `delete-all-sessions` -> marks all sessions deleted.

### Data Model: Field-by-Field Definitions

State (top-level):

- `schemaVersion`: schema version number (current 4).
- `sessions`: map of session id -> session object.
- `sessionOrder`: ordered list of session ids.
- `activeSessionId`: id of the active session.
- `tabs`: per-tab tracking state.
- `tracking`: active tracking state (see below).
- `syncMeta` (sync-only): contains `syncedAt` and `trimmed`.

Tracking object:

- `activeTabId`: active tab id.
- `activeUrl`: normalized active URL.
- `activeEdgeKey`: last edge id for the active tab.
- `activeSince`: timestamp when active timing started.
- `lastInteractionAt`: last user input timestamp.
- `userIdle`: boolean idle flag.
- `lastInactiveAt`: timestamp when user went idle.

Tab state:

- `lastUrl`: most recent URL seen for the tab.
- `lastTitle`: last known title.
- `lastEdgeKey`: last edge id created for this tab.
- `pendingSourceUrl`: stored source URL for new navigation targets.

Session object:

- `id`: session id string.
- `startedAt`: timestamp (daily sessions use local 12:00 AM).
- `firstActivityAt`: timestamp of first tracked activity (nullable).
- `updatedAt`: timestamp of last mutation.
- `endedAt`: timestamp when session ended (nullable, daily sessions end at 11:59 PM).
- `endReason`: end reason string (nullable).
- `lastActivityAt`: timestamp of last activity in session.
- `navigationCount`: number of navigation events.
- `nodes`: map of URL -> node object.
- `edges`: map of edge id -> edge object.
- `events`: array (ring buffer).
- `eventCursor`: ring buffer pointer.
- `eventCount`: ring buffer length.
- `metrics`: metrics object (nullable).
- `trapDoors`: array of trap door objects.
- `categoryTotals`: map of category -> total activeMs.
- `distractionAverage`: raw average distraction score.
- `distractionNormalized`: normalized score 0-100.
- `distractionLabel`: label (Focused/Mixed/Distracted).
- `label`: session label text.
- `labelDetail`: label detail text.
- `summaryBrief`: cached brief summary.
- `summaryDetailed`: cached detailed summary.
- `summaryUpdatedAt`: timestamp of last summary update.
- `archived`: boolean.
- `archivedAt`: timestamp or null.
- `deleted`: boolean.
- `deletedAt`: timestamp or null.
- `favorite`: boolean.
- `favoriteAt`: timestamp or null.

Node object:

- `id`: same as URL.
- `url`: normalized URL string.
- `title`: last known title.
- `category`: category label.
- `visitCount`: number of visits.
- `activeMs`: total active time.
- `firstNavigationIndex`: first navigation index (nullable).
- `lastNavigationIndex`: last navigation index (nullable).
- `firstSeen`: timestamp.
- `lastSeen`: timestamp.
- `distractionScore`: computed distraction score.
- `distractionComponents`: object (see below).
- `_lateNight`: cached boolean for late-night classification.
- `_scoreCache`: cached key + data for scoring.

Edge object:

- `id`: "from -> to".
- `from`: source URL.
- `to`: destination URL.
- `visitCount`: number of transitions.
- `activeMs`: total time spent after crossing this edge.
- `firstSeen`: timestamp.
- `lastSeen`: timestamp.

Metrics object (version 1):

- `version`: number (1).
- `totalActiveMs`: sum of node activeMs.
- `nodesCount`: count of nodes.
- `maxNodeActiveMs`: maximum activeMs of any node.
- `revisitCount`: number of nodes with visitCount > 1.
- `weightedScore`: sum of activeMs * distractionScore.
- `categoryTotals`: category -> activeMs.
- `maxDirty`: boolean indicating max node must be recomputed.

Trap door object:

- `url`: URL string (may be replaced with `urlId` in compact form).
- `urlId`: URL table index (compact form only).
- `postVisitDurationMs`: duration after first visit.
- `postVisitDepth`: navigation depth after first visit.
- `score`: combined trap door score.

Distraction components object:

- `activeTimeWeight`: active time contribution.
- `chainDepthWeight`: chain depth contribution.
- `lateNightWeight`: late-night bonus.
- `category`: category used.
- `intentWeight`: multiplier from intent heuristics.

### Event Types and Payload Fields

The following event types are recorded. Payload fields may vary by event type.

Session lifecycle:

- `session_started`: { ts, type, reason }
- `session_ended`: { ts, type, reason }

User activity:

- `user_active`: { tabId, reason }
- `user_inactive`: { tabId, reason }
- `idle_state_changed`: { state }

Active timing:

- `active_time_flushed`: { reason, tabId, url, durationMs }

Tab and window:

- `tab_activated`: { tabId, windowId, url }
- `TAB_ACTIVE`: { tabId, windowId, url }
- `tab_created`: { tabId, windowId, url }
- `tab_closed`: { tabId, windowId }
- `window_focus_changed`: { windowId, focused }

URL and title:

- `TITLE_CHANGED`: { tabId, windowId, url, title }
- `URL_CHANGED`: { tabId, windowId, url, fromUrl }
- `url_untrackable`: { tabId, url }
- `HASH_CHANGED`: { tabId, windowId, url, rawUrl }

Navigation graph:

- `navigation`: { tabId, windowId, fromUrl, toUrl, transitionType, transitionQualifiers, source }
- `navigation_target_created`: { tabId, sourceTabId, sourceUrl, targetUrl }

Storage:

- `storage_error`: { message, reason }
- `sync_error`: { message }

### Data Normalization Rules (Important Details)

- URL normalization:
  - Only http/https.
  - Hash fragments are stripped.
- Domain normalization:
  - Patterns support `*.` or `.` prefix.
  - URLs with paths or schemes are parsed to host.
  - Lines beginning with `#` are ignored.
- Category overrides:
  - Uses normalized pattern + canonical category match.
  - Invalid or unknown categories are dropped.

### Summary Prompt Building: Exact Inputs

For each session summary request, the prompt includes:

- Range (humanized session range)
- Active time (computed from nodes + live tracking)
- Pages touched (node count)
- Navigation events (navigation count)
- Label and label detail
- Mirror summary and mirror origin
- Top categories (optional, up to 3)
- Top domains (optional, up to 5)
- Turning point (optional, derived from trap door)

### Popup Quick-Glance Metrics: Exact Computation

- Active time: sum of node activeMs + live time if the active URL is part of the session.
- Top domain: highest total activeMs by domain.
- Distraction score: normalized session average score.
- Session label: session label text.
- Last action: derived from the last event type and mapped to a label.

## Ultra-Deep Appendix (Everything, Step by Step)

This section goes even deeper into per-feature behavior, sequence rules, and edge cases, organized by subsystem.

### Background: Event Recording and Ring Buffer

- Events are appended to a per-session ring buffer:
  - `eventCursor` points to the next insert slot.
  - `eventCount` tracks how many events are retained (max 5000).
- When trimming events for storage:
  - Low-value events are deprioritized: `idle_state_changed`, `user_active`, `user_inactive`.
  - Non-low-value events are kept first.
  - If space remains, the most recent low-value events are included.

### Background: Active Time Tracking (Exact Sequence)

- Active timing begins only when:
  - There is an active tab and active URL.
  - Tracking is not paused.
  - The window is focused.
  - Chrome idle state is active.
  - The user is not considered idle by activity timestamps.
- When tracking starts:
  - `activeSince` is set to the current timestamp.
- When tracking stops (flush):
  - Duration is computed as now - `activeSince`.
  - The current node's active time and lastSeen are updated.
  - The current edge (if any) gets active time and lastSeen.
  - Session metrics and labels are updated via an incremental path.
  - An `active_time_flushed` event is recorded with reason and duration.

### Background: Adaptive Idle Threshold

- Base idle timeout: `userIdleMinutes` in milliseconds.
- Adaptive behavior based on last activity type:
  - Typing or click-like events (keydown, mousedown, pointerdown, touchstart):
    - Timeout is reduced to 60% of base, but never below 30 seconds.
  - Reading events (scroll, wheel, mousemove):
    - Timeout is increased to 160% of base, capped at 10 minutes.
  - Other events:
    - Base timeout is used unchanged.

### Background: User Activity Messages

- Content script sends `user_activity` only for the active tab.
- Background only accepts it if the sender tab id matches the active tab id.
- When an activity message arrives:
  - `lastInteractionAt` is updated.
  - `user_idle` flips to false if needed.
  - `user_active` events are recorded when transitioning from idle.
  - Active timing is started if conditions allow.

### Background: Tab Activation Handling

When a tab is activated:

- The URL is normalized (http/https only, hash stripped).
- A session is ensured based on activity rules.
- Node visit count is incremented.
- Node navigation index is updated.
- Session insights are updated incrementally.
- `tab_activated` and `TAB_ACTIVE` events are recorded.
- Active timing is switched to the new tab.

### Background: Tab Updates

- Title changes:
  - If the title changes on the active tab, a `TITLE_CHANGED` event is recorded.
  - The node is ensured for that URL.
- URL changes:
  - If a URL becomes untrackable (non-http/https), active timing is flushed and active URL is cleared.
  - A `url_untrackable` event is recorded.
  - If the URL is trackable and different, the tab's last URL is updated.
- Tab updates do not trigger navigation events; those are handled by webNavigation.

### Background: Window Focus Changes

- On blur:
  - Active timing is flushed.
  - `lastInactiveAt` is set.
  - A persist flush happens immediately.
- On focus:
  - A session is ensured.
  - A `window_focus_changed` event is recorded.
  - Active timing resumes.

### Background: Idle State Changes (chrome.idle)

- When chrome idle state becomes idle:
  - Active timing is flushed.
  - `lastInactiveAt` is set.
  - Persist is flushed.
- When it becomes active:
  - A session is ensured.
  - A `user_active` event can be recorded.
  - Active timing resumes.

### Background: Navigation Handling

Navigation is driven by webNavigation events:

- `onCommitted` and `onHistoryStateUpdated` both call the shared navigation handler.
- Hash-only navigation uses a separate `HASH_CHANGED` event and does not create edges.
- New tab target creation (`onCreatedNavigationTarget`) stores a `pendingSourceUrl` to link the next navigation.

Navigation handler details:
- Ignores duplicate navigations when the URL is unchanged and there is no pending source.
- Increments session navigation count.
- Ensures a node for the destination URL and increments visit count.
- Creates or updates an edge from the previous URL (if any).
- Updates node navigation indexes.
- Records a `navigation` event with from/to URL and transition metadata.
- If this is the active tab, updates active URL and active edge.

### Background: URL Normalization and Metadata

- Only `http` and `https` URLs are tracked.
- Hash fragments are stripped to avoid treating anchors as new pages.
- Normalized URLs are cached to limit repeated parsing.
- URL metadata includes:
  - normalized URL
  - domain (hostname without www)
  - computed category
- Category decisions include overrides, domain rules, and optional AI suggestions.

### Background: Metrics and Insight Updates (Incremental)

- Each node update adjusts:
  - totalActiveMs
  - weightedScore
  - revisitCount
  - categoryTotals
  - maxNodeActiveMs (or sets maxDirty)
- Metrics update only recomputes the full label when the session insight key changes.
- The insight key is derived from:
  - node count
  - navigation count bucket
  - total active bucket
  - dominant category
  - distraction score bucket

### Background: Full Insight Recompute Triggers

- Full recompute happens when:
  - There is no label.
  - Metrics are missing or maxDirty is true.
  - Node count mismatches cached metrics.
  - Category totals are missing.

### Background: Trap Door Analysis Pipeline

- Trap door evaluation runs on a debounce (400ms) after navigation.
- A node can be a trap door when:
  - Post-visit duration >= 20 minutes
  - Post-visit depth >= 6 steps
- Trap doors are ranked by:
  - Duration share (70%)
  - Depth share (30%)
- Up to 3 trap doors are retained.

### Background: Persistence and Sync

- Persistence is debounced to avoid rapid writes:
  - Debounce: 1200ms
  - Max wait: 5000ms
- Local storage writes include:
  - trimmed sessions
  - compact URL tables
  - trimmed tabs state
- Sync storage writes include:
  - last 3 sessions only
  - events trimmed to 800 entries
  - a `syncMeta` object with `syncedAt` and `trimmed: true`

### Background: Session Actions (From Dashboard)

- session_reset:
  - Ends the current session (`manual_reset`)
  - Starts a new session with the same reason
- session_delete:
  - Marks deleted and deletedAt
  - If active, ends it and starts a new session
- session_restore:
  - Clears deleted flags
- session_favorite_toggle:
  - Toggles `favorite` and updates `favoriteAt`
- session_delete_all:
  - Marks all sessions deleted
  - Starts a fresh session afterward
- reset_state:
  - Clears all state and reinitializes tracking
- session_summary_update:
  - Updates cached summaries and timestamps in state

### Content Script: Event Set (Exact)

- High-frequency: mousemove, scroll, wheel, pointerdown (only when visible and focused).
- Typing/click-like: keydown, mousedown, pointerdown, touchstart.
- Reading-like: scroll, wheel, mousemove.
- Visibility: `visibilitychange` triggers a "visibility" activity ping.

### Popup: Rendering and State Refresh

- Settings are read from sync; state is read from local storage.
- If local storage is missing or errors:
  - The quick-glance shows a "No session yet" placeholder (when enabled).
- The popup re-renders on:
  - settings changes (sync)
  - state changes (local)
- The primary action behavior:
  - pause_tracking: writes to sync settings
  - start_focus: clears tracking pause and opens dashboard
  - copy_summary: writes to clipboard if a summary exists
  - open_dashboard: opens dashboard tab

### Dashboard: Settings Auto-Save

- Settings form is auto-saved on input and change events.
- A 250ms debounce reduces rapid writes.
- Undo snapshots are stored in localStorage and shown when available.
- Reset and undo actions also go through the same sanitize/save pipeline.

### Dashboard: Visibility Toggles

- Dashboard sections can be hidden by settings:
  - Overview, sessions, timeline, graph, stats, honesty, callouts
- Graph toggle affects:
  - graph canvas
  - graph empty overlay
  - graph mode toggles
  - graph tab and panel
- If all deep dive tabs are hidden, the entire deep dive block is hidden.

### Dashboard: Settings Preview Behavior

- Preview uses sanitized settings.
- Theme, density, typography, and accent are reflected in a preview card.
- Accent preview also derives an ink color for contrast.

### Dashboard: Summary Update Guardrails

- Summary refresh is skipped when:
  - no session exists
  - summary is already updated for the latest session timestamp
  - the same session already has cached brief + detailed summaries
  - cooldown minutes have not elapsed
- A request id ensures stale responses do not override newer summaries.

### Dashboard: Export and Error Handling

- Export uses a best-available state source (memory, background, local, sync).
- If browser APIs are unavailable for blob downloads:
  - A toast warns "Export unavailable in this environment."
- Storage errors are handled without crashing the UI.

---

This file should be kept in sync with actual behavior and settings exposed in the UI and background logic. It intentionally avoids code listings while capturing how the system works.
