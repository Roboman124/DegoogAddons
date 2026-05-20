/**
 * users-online — Degoog plugin v1.0.0
 *
 * Tracks anonymous visitors in real time using a heartbeat ping.
 * Each browser gets a random ID in localStorage. Every 30s it pings
 * /api/plugin/<id>/ping. The server counts unique IDs seen in the
 * last N minutes (configurable). Hidden visitors ping with hidden=true
 * and are excluded from the public count.
 *
 * Exports:
 *   slot        — sidebar card (no Configure button)
 *   default     — bang command !users + Configure button
 *   routes      — /ping, /count, /modal
 *
 * isClientExposed: false — the browser only contacts this server's own
 * plugin routes (/ping, /count, /modal), not any external service.
 */

// ── In-memory visitor store ───────────────────────────────────────────────────
// Map of visitorId → { lastSeen: timestamp, hidden: bool }
const visitors = new Map();

let config = {
  buttonLabel:      "Users Online",
  showCount:        "true",   // show the live number on the button
  showSidebar:      "true",   // show the sidebar card
  inactiveMinutes:  "5",      // how long before a visitor stops counting
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function activeWindowMs() {
  return parseInt(config.inactiveMinutes, 10) * 60_000;
}

function countVisible() {
  const cutoff = Date.now() - activeWindowMs();
  let n = 0;
  for (const v of visitors.values()) {
    if (v.lastSeen >= cutoff && !v.hidden) n++;
  }
  return n;
}

// Hidden users are fully excluded — they don't appear in any count
// shown to other users, so there's no "anonymous" number to display.

// Prune visitors that have been inactive longer than 2× the window
// to keep the map from growing forever.
function pruneOld() {
  const cutoff = Date.now() - activeWindowMs() * 2;
  for (const [id, v] of visitors.entries()) {
    if (v.lastSeen < cutoff) visitors.delete(id);
  }
}
setInterval(pruneOld, 60_000);

// ── HTML builders ─────────────────────────────────────────────────────────────

function buildSidebarHtml(count) {
  return `
<div class="uo-sidebar degoog-panel">
  <div class="uo-sidebar-header">
    <span class="uo-sidebar-icon">👥</span>
    <span class="uo-sidebar-title">Users Online</span>
  </div>
  <div class="uo-count-row">
    <span class="uo-count" id="uo-sidebar-count">${count}</span>
    <span class="uo-count-label">browsing right now</span>
  </div>
  <div class="uo-hint">Hover the header button to hide yourself.</div>
</div>`;
}

function buildModalHtml(visible) {
  return `
<div class="uo-modal-inner" role="dialog" aria-modal="true" aria-label="Users Online">
  <button class="uo-modal-close" id="uo-close-btn" aria-label="Close">✕</button>

  <div class="uo-modal-header">
    <span class="uo-modal-icon">👥</span>
    <div>
      <div class="uo-modal-title">Users Online</div>
      <div class="uo-modal-sub">People browsing this server right now</div>
    </div>
  </div>

  <div class="uo-modal-count-row">
    <span class="uo-modal-count" id="uo-modal-count">${visible}</span>
    <span class="uo-modal-count-label">people online</span>
  </div>

  <div class="uo-modal-note">
    Counts anyone who loaded a page in the last ${config.inactiveMinutes} minute${config.inactiveMinutes !== "1" ? "s" : ""}.
  </div>

  <div class="uo-hide-section">
    <div class="uo-hide-header">Your presence</div>
    <label class="uo-hide-toggle-row" title="When hidden, you are not counted for other users.">
      <span class="uo-hide-label">
        <span class="uo-hide-label-title">Hide me from the counter</span>
        <span class="uo-hide-label-desc">You'll still see the count, but others won't see you.</span>
      </span>
      <button
        class="uo-toggle-btn"
        id="uo-hide-toggle"
        role="switch"
        aria-checked="false"
        title="Toggle your visibility"
      >
        <span class="uo-toggle-knob"></span>
      </button>
    </label>
  </div>
</div>`;
}

// ── Settings ──────────────────────────────────────────────────────────────────

const settingsSchema = [
  {
    key: "buttonLabel",
    label: "Button label",
    type: "text",
    placeholder: "Users Online",
    description: "Text on the header button next to the settings gear.",
  },
  {
    key: "showCount",
    label: "Show live count on button",
    type: "toggle",
    description: "Displays the number on the button itself, e.g. 👥 Users Online · 12.",
  },
  {
    key: "showSidebar",
    label: "Show sidebar card",
    type: "toggle",
    description: "Shows the count in the sidebar on search pages.",
  },
  {
    key: "inactiveMinutes",
    label: "Inactivity timeout (minutes)",
    type: "text",
    placeholder: "5",
    description: "How many minutes of no activity before someone stops counting.",
  },
];

function configure(settings) {
  if (settings.buttonLabel     !== undefined) config.buttonLabel     = settings.buttonLabel     || config.buttonLabel;
  if (settings.showCount       !== undefined) config.showCount       = settings.showCount;
  if (settings.showSidebar     !== undefined) config.showSidebar     = settings.showSidebar;
  if (settings.inactiveMinutes !== undefined) {
    const n = parseInt(settings.inactiveMinutes, 10);
    if (!isNaN(n) && n > 0) config.inactiveMinutes = String(n);
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

let initialised = false;
function init(_ctx) {
  if (initialised) return;
  initialised = true;
  // Nothing async needed — visitor store is in-memory
}

// ── Slot — sidebar card, no Configure button ──────────────────────────────────

export const slot = {
  id:            "users-online-slot",
  name:          "Users Online",
  description:   "Shows a live visitor count in the sidebar on every search.",
  isClientExposed: false,
  slotPositions: ["above-sidebar", "below-sidebar", "at-a-glance"],

  init,

  trigger() { return config.showSidebar !== "false"; },

  async execute() {
    return {
      title: "Users Online",
      html:  buildSidebarHtml(countVisible()),
    };
  },
};

// ── Bang command — !users, !online, !who ──────────────────────────────────────

export default {
  id:          "users-online",
  name:        "Users Online",
  description: "Shows live visitor count. Type !users to open the panel. Configure timeout, button label, and sidebar visibility.",
  isClientExposed: false,

  trigger:     "users",
  aliases:     ["online", "who"],
  naturalLanguagePhrases: ["how many users online", "who is online", "users online"],

  settingsSchema,
  configure,
  init,

  async execute() {
    return {
      title: `Users Online — ${countVisible()} browsing now`,
      html:  buildModalHtml(countVisible()),
    };
  },
};

// ── Routes ────────────────────────────────────────────────────────────────────

export const routes = [
  // POST /ping — called every 30s by each browser
  // Body: { id: string, hidden: bool }
  {
    method: "post",
    path: "/ping",
    async handler(req) {
      try {
        const body = await req.json();
        const id     = String(body.id     || "").slice(0, 64);
        const hidden = Boolean(body.hidden);
        if (!id) return new Response("bad request", { status: 400 });
        visitors.set(id, { lastSeen: Date.now(), hidden });
        return new Response(
          JSON.stringify({ count: countVisible() }),
          { headers: { "Content-Type": "application/json" } }
        );
      } catch {
        return new Response("bad request", { status: 400 });
      }
    },
  },

  // GET /count — lightweight poll for updating the button badge
  {
    method: "get",
    path: "/count",
    handler(_req) {
      return new Response(
        JSON.stringify({
          count:           countVisible(),
          buttonLabel:     config.buttonLabel,
          showCount:       config.showCount,
          inactiveMinutes: config.inactiveMinutes,
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    },
  },

  // GET /modal — fresh modal HTML fetched on button click
  {
    method: "get",
    path: "/modal",
    handler(_req) {
      return new Response(buildModalHtml(countVisible()), {
        headers: { "Content-Type": "text/html" },
      });
    },
  },
];
