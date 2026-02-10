# Internet Rabbit Hole Tracker

A Chrome extension that acts as a calm, honest mirror of your browsing habits. It tracks where your time actually goes, maps how navigation chains form, and surfaces patterns you might not notice — focus streaks, attention drift, late-night spirals, and the exact page that pulled you down the rabbit hole.

No surveillance. No productivity scores. Just reflective insight.

---

## What It Does

**Active time tracking** — Only counts time when you're actually looking at a tab (focused window + active tab + not idle). No inflated numbers from background tabs.

**Navigation graph** — Builds a real-time map of how you move between pages. Every `A → B` transition is recorded with visit counts and time spent.

**Distraction scoring** — Each page gets a score based on active time, chain depth, late-night browsing, category, and behavioral signals like rapid hopping or feed scrolling.

**Intent drift detection** — Measures how scattered your attention is across domains and categories using entropy analysis. Tells you when you've drifted far from where you started.

**Trap door detection** — Identifies the specific page that sent you spiraling. "You visited reddit.com and then spent 45 minutes going 12 pages deep."

**Daily sessions** — One session per calendar day (midnight to midnight). No arbitrary timeout-based splitting.

**Auto-categorization** — Pages are classified as Study, Social, Video, Shopping, News, or Random based on domain rules, with full override support.

---

## Screenshots

| Popup                                 | Dashboard                           | Graph                                          |
| ------------------------------------- | ----------------------------------- | ---------------------------------------------- |
| Quick-glance metrics + one-tap action | Timeline, stats, insights, sessions | Interactive navigation graph by domain or page |

---

## Install

### Chrome (Developer Mode)

```
1. Clone this repo (or download the ZIP)
2. Open chrome://extensions
3. Enable "Developer mode" (top right)
4. Click "Load unpacked"
5. Select the project folder
```

That's it. No build step required — the extension runs directly from source.

### Optional: AI Summaries via Ollama

If you have [Ollama](https://ollama.ai) running locally, the extension can generate AI-powered session summaries.

```bash
npm install
npm start        # starts proxy on http://localhost:3010
```

The proxy relays prompts to Ollama's API. Configure the endpoint and model in dashboard settings.

---

## Usage

### Popup

Click the extension icon for an at-a-glance view:

- Active time, top domain, distraction score, session label
- Customizable quick-glance metrics (pick up to 5)
- One-tap primary action (open dashboard, pause tracking, copy summary, start focus)
- Mood chip, notes, and micro-notes for personal context

### Dashboard

Open from the popup button or the extension's options page. It updates live as you browse.

- **Overview** — Mirror summary, behavioral insights, and session actions
- **Timeline** — Visual blocks of active time per domain across the day
- **Graph** — Interactive force-directed graph of your navigation (domain or page mode, filterable, searchable)
- **Stats** — Deepest chain, top domains, top pages, top distractions, trap doors, common start points
- **Honesty** — Damage receipts, return path from start → trap door → end, optional direct callouts
- **Sessions** — Browse, favorite, delete, and filter past sessions with calendar navigation

### Settings

Four organized settings pages:

| Page                | Controls                                                                                                                            |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Popup**           | Layout, density, quick-glance toggles, primary action, labels, mood                                                                 |
| **Dashboard**       | Section visibility, session list style, focus prompts, story mode                                                                   |
| **Personalization** | Theme (6 options), tone, typography, accent color, motion, summary style (voice, personality, emoji, length, verbosity, formatting) |
| **Technical**       | Timeouts, site lists, category overrides, Ollama config, sync, export, reset                                                        |

---

## Architecture

```
┌─────────────┐     user_activity     ┌──────────────────┐
│ content.js  │ ───────────────────→  │  background.js   │
│ (activity   │                       │  (service worker) │
│  heartbeat) │                       │                   │
└─────────────┘                       │  Sessions, graph, │
                                      │  scoring, persist │
┌─────────────┐     chrome.storage    │                   │
│  popup.js   │ ←───────────────────  └──────────────────┘
│ (micro UI)  │                              │
└─────────────┘                              │ port / storage
                                             ▼
┌─────────────────────────────────────────────────────┐
│  dashboard/dashboard.js                             │
│  (timeline, graph, stats, honesty, settings, AI)    │
│                                                     │
│  dashboard/realtime-worker.js  (Web Worker for      │
│   graph/timeline/stats derivation off main thread)  │
└─────────────────────────────────────────────────────┘
         │
         │ optional
         ▼
┌─────────────────┐        ┌─────────────┐
│ ollama-proxy.js │ ──→    │  Ollama API │
│ (localhost:3010)│        │  (local LLM)│
└─────────────────┘        └─────────────┘
```

**Key design decisions:**

- MV3 service worker — no persistent background page
- Active time = tab focused + window focused + user not idle (triple-gated)
- Content script uses adaptive throttling (2.5s–14s based on activity type)
- Navigation events are coalesced (150ms–900ms window) to avoid SPA noise
- Storage uses URL table deduplication + session trimming to stay under Chrome limits
- Events stored in a ring buffer (max 5,000 per session)
- Realtime dashboard updates via `chrome.runtime.connect` ports with optional delta sync and batching

---

## Project Structure

```
├── manifest.json              # MV3 extension manifest
├── background.js              # Service worker — tracking core
├── content.js                 # Activity heartbeat (mouse/keyboard/scroll/visibility)
├── shared.js                  # Shared scoring (distraction, intent drift, entropy)
├── insights.js                # Heuristic session analysis (no AI)
├── categories.js              # Domain → category rules + multipliers
├── popup.html / popup.js      # Extension popup UI
├── popup.css                  # Popup styles
├── ollama-proxy.js            # Optional Node.js proxy for Ollama
├── dashboard/
│   ├── index.html             # Dashboard page
│   ├── dashboard.js           # Dashboard logic (7k+ lines)
│   ├── dashboard.css          # Dashboard styles
│   ├── realtime-worker.js     # Web Worker for heavy computation
│   ├── summary-shared.js      # Shared summary data builder
│   ├── settings.html          # Settings hub (popup settings)
│   ├── settings-dashboard.html
│   ├── settings-personalization.html
│   ├── settings-technical.html
│   └── settings.css           # Settings styles
├── test/
│   ├── background.test.js
│   ├── content.test.js
│   ├── dashboard.test.js
│   ├── insights.test.js
│   ├── popup.test.js
│   ├── shared.test.js
│   ├── ollama-proxy.test.js
│   ├── realtime-worker.test.js
│   └── test-helpers.js
├── package.json
└── PROJECT.md                 # Exhaustive internal documentation
```

---

## Testing

```bash
npm test
```

Runs the full test suite using Node's built-in test runner with [c8](https://github.com/bcoe/c8) for coverage. **100% coverage is enforced** on lines, functions, branches, and statements — the build fails if any metric drops below 100%.

8 test files cover all source modules. No external test framework needed.

---

## How Scoring Works

### Distraction Score (per page)

Each visited page gets a distraction score from these weighted signals:

| Signal              | What it measures                                                                                          |
| ------------------- | --------------------------------------------------------------------------------------------------------- |
| Active time weight  | Log-scaled time on page (capped at 1.6)                                                                   |
| Chain depth weight  | How deep in the navigation chain the page sits                                                            |
| Late-night weight   | +0.6 if visited between 11 PM and 6 AM                                                                    |
| Category multiplier | Study (0.7×) → News (0.85×) → Random (1.0×) → Shopping (1.15×) → Social (1.3×) → Video (1.4×)             |
| Intent modifiers    | Technical URLs (0.4×), sustained focus (0.75×), rapid hops (1.15×), feed scrolling (1.1×), looping (1.1×) |
| Site overrides      | Productive sites (0.7×), distracting sites (1.2×)                                                         |

The session-level score is the time-weighted average across all pages, normalized to 0–100.

### Intent Drift (per session)

Measures attention scatter using:

- Domain entropy (how spread your time is across domains)
- Category entropy (how mixed the content types are)
- Hop rate, short dwell ratio, cross-domain transitions
- Anchor strength (how much one page held attention)

Output: Low / Medium / High with confidence level and top contributing factors.

---

## Storage

All data stays local by default.

| Key               | Location               | Purpose                                 |
| ----------------- | ---------------------- | --------------------------------------- |
| `irht_state`      | `chrome.storage.local` | Full state (sessions, graph, tracking)  |
| `irht_settings`   | `chrome.storage.sync`  | User settings                           |
| `irht_state_sync` | `chrome.storage.sync`  | Optional slim snapshot for multi-device |

Enable **Sync** in settings to keep a small snapshot of recent sessions in `chrome.storage.sync` for multi-device continuity.

---

## Permissions

| Permission                         | Why                                                        |
| ---------------------------------- | ---------------------------------------------------------- |
| `tabs`                             | Track active tab switches                                  |
| `storage`                          | Persist session data and settings                          |
| `webNavigation`                    | Detect page navigations, SPA history changes, hash changes |
| `idle`                             | Detect system idle state                                   |
| `alarms`                           | Periodic idle checks and active time flush                 |
| `windows`                          | Detect window focus changes                                |
| `host_permissions: <all_urls>`     | Content script for activity detection on all pages         |
| `host_permissions: localhost:3010` | Optional AI proxy communication                            |

---

## License

MIT
