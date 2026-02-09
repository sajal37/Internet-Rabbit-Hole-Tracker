# Internet Rabbit Hole Tracker (Chrome Extension)

Phase 7 delivers a Chrome-only extension that captures visited pages, calculates
active time per page, builds navigation chains with session boundaries, adds
behavior insights (distraction scores, categories, and session labels), and
ships a standalone dashboard for timeline + graph visualization plus "painfully
honest" insights. The popup shows the top 5 time sinks for the active session.

## Install (Chrome)

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder: `d:\Documents\Internet Rabbit Hole Tracker`.

## Local proxy (required for Ollama)

Run `npm start` (or `npm run dev`) to launch the Ollama proxy on port 3010.

## What it captures

- Active tab switches (`TAB_ACTIVE`)
- Active tab URL changes (`URL_CHANGED`)
- Active time per URL (active tab + focused window, idle-aware)
- Session boundaries after 12 minutes of inactivity (`SESSION_IDLE_THRESHOLD_MS`)
- Navigation edges (`A -> B`) with counts and timestamps
- Trap door candidates based on post-visit time + chain depth (20+ minutes or 6+ hops)
- Distraction scoring (time + chain depth + late-night signals)
- Auto categories (Study, Social, Video, Shopping, News, Random)
- Session label summaries
- Idle-aware timing (chrome.idle + user input inactivity)
- Same-page navigation tracking (title + SPA history + hash changes)
- Damage receipts + return path in the dashboard
- Optional shame callouts in the dashboard

## Popup

Open the extension popup to view the top 5 "time vampires" by active time in
the current session. Use the **Dashboard** button to jump straight into the
live dashboard, or manage the current session with new/archived/deleted actions.

## Dashboard

Open the dashboard from the popup (**Dashboard**) or from the extension
options page. The dashboard reads from `chrome.storage.local` and updates live
as you browse.

You'll see:

- Timeline view (active time blocks)
- Graph view (nodes + edges)
- Stats view (time sinks, top domains, chain depth, trap doors, session label)
- Painfully honest view (damage receipts, return path, optional shame)
- Session controls (new session, archive, delete)
- Settings (session timeout, idle timeout, custom categories, theme, sync toggle)

## Sync (optional)

Enable **Sync data across devices** in the dashboard settings to store recent
sessions in `chrome.storage.sync`. This keeps a small snapshot so you can view
your latest activity on another device.

## Publish (Chrome Web Store)

1. Zip the extension folder.
2. Visit the Chrome Web Store Developer Dashboard.
3. Upload the zip, complete listing details, and submit for review.

## Data model (summary)

The state is stored in `chrome.storage.local` under `irht_state`.

- `sessions`: all captured sessions (per-session nodes, edges, events, trap doors)
- `activeSessionId`: current session id
- `tracking`: current active tab/url for continuity
