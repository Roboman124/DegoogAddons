# server-uptime v1.0.0

A Degoog plugin that adds a **Server Details** button next to the settings gear on every page, plus an optional sidebar uptime card.

## Install

Copy `server-uptime/` into `data/plugins/` and restart Degoog.

## What you get

**Two entries in Settings → Plugins:**

| Entry | Description | Configure |
|---|---|---|
| Server Uptime | Shows an uptime card in the sidebar on every search | — |
| Server Uptime | Adds the Server Details button and handles !uptime | ✓ |

**The modal shows:**
- Server name, location, and flag
- Uptime % with a colour-coded progress bar
- Live uptime counter (ticks every second)
- Last downtime timestamp and duration
- Total outage count
- Collapsible list of the last 5 outages

## Settings → Plugins → Server Uptime → Configure

| Setting | What it does |
|---|---|
| Server name | Name shown at the top of the popup |
| Location | Where your server is (e.g. `Frankfurt, Germany`) |
| Flag | Country flag emoji (e.g. `🇩🇪`) |
| Button text | Label on the header button |
| Show location in sidebar | Show/hide location in the sidebar card |
| Hide sidebar card | Only show the header button, no sidebar card |
| Clear outage history | Turn on + Save to erase all past outages |

## Bang commands

`!uptime` · `!up` · `!serverdetails`

## How downtime is tracked

A heartbeat saves `lastShutdownMs` every 60 seconds. On reboot, if the gap exceeds 30 seconds, an outage is recorded. Gaps under 30 s (dev restarts) are ignored.
