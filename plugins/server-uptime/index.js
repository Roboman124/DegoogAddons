/**
 * server-uptime — Degoog plugin v5.0
 *
 * Single export (slot only) — fixes the double entry in Settings.
 * Bang command (!uptime) is registered via slot.bangs[] not a separate export.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

let pluginDir = "";
let cache     = null;
const BOOT_TIME = Date.now();

let config = {
  serverName:   "My Server",
  location:     "",
  countryFlag:  "",
  showLocation: "true",
  buttonOnly:   "false",
  actionLabel:  "Server Details",
};

// ── State ─────────────────────────────────────────────────────────────────────

const stateFile = () => join(pluginDir, "state.json");

function loadState() {
  try {
    if (existsSync(stateFile()))
      return JSON.parse(readFileSync(stateFile(), "utf8"));
  } catch {}
  return { outages: [], totalDownMs: 0, firstSeenMs: BOOT_TIME };
}

function saveState(st) {
  try { writeFileSync(stateFile(), JSON.stringify(st, null, 2), "utf8"); }
  catch (e) { console.error("[server-uptime] save failed:", e.message); }
}

function recordBoot(st) {
  const gap = BOOT_TIME - (st.lastShutdownMs || 0);
  if (st.lastShutdownMs && gap > 30_000) {
    st.outages.push({ start: st.lastShutdownMs, end: BOOT_TIME, durationMs: gap });
    st.totalDownMs = (st.totalDownMs || 0) + gap;
    if (st.outages.length > 50) st.outages.splice(0, st.outages.length - 50);
  }
  st.lastShutdownMs = BOOT_TIME;
  st.firstSeenMs    = st.firstSeenMs || BOOT_TIME;
  saveState(st);
  return st;
}

let state = {};

function startHeartbeat() {
  setInterval(() => { state.lastShutdownMs = Date.now(); saveState(state); }, 60_000);
}

// ── Stats ─────────────────────────────────────────────────────────────────────

function computeStats() {
  const now           = Date.now();
  const totalObserved = now - (state.firstSeenMs || BOOT_TIME);
  const totalDown     = state.totalDownMs || 0;
  const uptimePct     = totalObserved > 0
    ? Math.min(100, ((totalObserved - totalDown) / totalObserved) * 100).toFixed(2)
    : "100.00";
  const lastOutage = state.outages.length
    ? state.outages[state.outages.length - 1] : null;
  return {
    currentUptimeMs: now - BOOT_TIME,
    uptimePct,
    totalOutages:    state.outages.length,
    lastOutage,
    recentOutages:   state.outages.slice(-5).reverse(),
    bootTime:        BOOT_TIME,
    firstSeenMs:     state.firstSeenMs || BOOT_TIME,
  };
}

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtMs(ms) {
  if (ms < 1000) return ms + "ms";
  const s = Math.floor(ms / 1000), m = Math.floor(s / 60),
        h = Math.floor(m / 60),    d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h ${m % 60}m`;
  if (h > 0) return `${h}h ${m % 60}m ${s % 60}s`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

function fmtDate(ms) {
  return new Date(ms).toLocaleString("en-GB", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function pctColor(pct) {
  return pct >= 99.9 ? "var(--success)" : pct >= 99 ? "var(--warning)" : "var(--danger)";
}
function statusDot(pct) {
  return pct >= 99.9 ? "🟢" : pct >= 99 ? "🟡" : "🔴";
}

// ── Sidebar HTML ──────────────────────────────────────────────────────────────

function buildSidebarHtml(stats) {
  const pct   = parseFloat(stats.uptimePct);
  const color = pctColor(pct);
  const dot   = statusDot(pct);
  const loc   = config.showLocation === "true" && config.location
    ? `<div class="su-server-location">${config.countryFlag ? config.countryFlag + " " : ""}${config.location}</div>`
    : "";
  const lastDown = stats.lastOutage
    ? `<div class="su-row"><span class="su-label">last down</span>
         <span class="su-value">${fmtDate(stats.lastOutage.start)}</span></div>
       <div class="su-row"><span class="su-label">duration</span>
         <span class="su-value su-danger">${fmtMs(stats.lastOutage.durationMs)}</span></div>`
    : `<div class="su-row"><span class="su-label">last down</span>
         <span class="su-value su-success">never</span></div>`;
  return `
<div class="su-sidebar degoog-panel">
  <div class="su-sidebar-header">
    <div class="su-server-name">${config.serverName}</div>${loc}
  </div>
  <div class="su-bar-wrap" title="${stats.uptimePct}% uptime">
    <div class="su-bar" style="width:${Math.min(100,pct)}%;background:${color}"></div>
  </div>
  <div class="su-rows">
    <div class="su-row"><span class="su-label">${dot} uptime</span>
      <span class="su-pct" style="color:${color}">${stats.uptimePct}%</span></div>
    <div class="su-row"><span class="su-label">been up for</span>
      <span class="su-value su-live" data-boot="${stats.bootTime}">${fmtMs(stats.currentUptimeMs)}</span></div>
    ${lastDown}
    <div class="su-row"><span class="su-label">total outages</span>
      <span class="su-value ${stats.totalOutages === 0 ? "su-success" : "su-danger"}">${stats.totalOutages}</span></div>
  </div>
</div>`;
}

// ── Modal HTML ────────────────────────────────────────────────────────────────

function buildModalHtml(stats) {
  const pct   = parseFloat(stats.uptimePct);
  const color = pctColor(pct);
  const dot   = statusDot(pct);
  const loc   = config.location
    ? `<div class="su-modal-location">
         ${config.countryFlag ? `<span class="su-modal-flag">${config.countryFlag}</span>` : ""}
         <span>${config.location}</span></div>` : "";
  const recentRows = stats.recentOutages.length
    ? stats.recentOutages.map(o =>
        `<div class="su-outage-row">
           <span class="su-outage-date">${fmtDate(o.start)}</span>
           <span class="su-outage-dur">${fmtMs(o.durationMs)}</span>
         </div>`).join("")
    : `<div class="su-outage-none">No outages on record.</div>`;
  return `
<div class="su-modal-inner" role="dialog" aria-modal="true" aria-label="Server Details">
  <button class="su-modal-close" id="su-close-btn" aria-label="Close">✕</button>
  <div class="su-modal-brand">
    <div class="su-modal-name">${config.serverName}</div>${loc}
  </div>
  <div class="su-modal-pct-row">
    <span class="su-modal-dot">${dot}</span>
    <span class="su-modal-pct" style="color:${color}">${stats.uptimePct}%</span>
    <span class="su-modal-pct-label">uptime</span>
  </div>
  <div class="su-modal-bar-wrap">
    <div class="su-modal-bar" style="width:${Math.min(100,pct)}%;background:${color}"></div>
  </div>
  <div class="su-modal-grid">
    <div class="su-modal-stat">
      <div class="su-modal-stat-label">up since</div>
      <div class="su-modal-stat-value">${fmtDate(stats.bootTime)}</div>
    </div>
    <div class="su-modal-stat">
      <div class="su-modal-stat-label">current uptime</div>
      <div class="su-modal-stat-value su-live" data-boot="${stats.bootTime}">${fmtMs(stats.currentUptimeMs)}</div>
    </div>
    <div class="su-modal-stat">
      <div class="su-modal-stat-label">last went down</div>
      <div class="su-modal-stat-value ${stats.lastOutage ? "su-danger" : "su-success"}">
        ${stats.lastOutage ? fmtDate(stats.lastOutage.start) : "never recorded"}</div>
    </div>
    <div class="su-modal-stat">
      <div class="su-modal-stat-label">outage lasted</div>
      <div class="su-modal-stat-value ${stats.lastOutage ? "su-danger" : "su-success"}">
        ${stats.lastOutage ? fmtMs(stats.lastOutage.durationMs) : "—"}</div>
    </div>
    <div class="su-modal-stat">
      <div class="su-modal-stat-label">total outages</div>
      <div class="su-modal-stat-value ${stats.totalOutages === 0 ? "su-success" : "su-danger"}">
        ${stats.totalOutages}</div>
    </div>
    <div class="su-modal-stat">
      <div class="su-modal-stat-label">tracking since</div>
      <div class="su-modal-stat-value">${fmtDate(stats.firstSeenMs)}</div>
    </div>
  </div>
  <details class="su-details degoog-accordion">
    <summary class="degoog-accordion-toggle su-details-toggle">
      recent outages (${stats.recentOutages.length})
    </summary>
    <div class="degoog-accordion-body su-outage-list">
      ${recentRows}
    </div>
  </details>
</div>`;
}

// ── Settings — plain simple language ─────────────────────────────────────────

const settingsSchema = [
  {
    key: "serverName",
    label: "Server name",
    type: "text",
    placeholder: "My Server",
    description: "The name shown at the top of the server details popup.",
  },
  {
    key: "location",
    label: "Location",
    type: "text",
    placeholder: "e.g. New York, USA",
    description: "Where your server is physically hosted.",
  },
  {
    key: "countryFlag",
    label: "Flag",
    type: "text",
    placeholder: "e.g. 🇺🇸",
    description: "Paste a flag emoji for your server's country.",
  },
  {
    key: "actionLabel",
    label: "Button text",
    type: "text",
    placeholder: "Server Details",
    description: "What the button next to the logo says.",
  },
  {
    key: "showLocation",
    label: "Show location in sidebar",
    type: "toggle",
    description: "Show the server location inside the sidebar card.",
  },
  {
    key: "buttonOnly",
    label: "Hide sidebar card",
    type: "toggle",
    description: "Only show the logo button, not the sidebar card. Good if you want a cleaner look.",
  },
  {
    key: "clearOutages",
    label: "Clear outage history",
    type: "toggle",
    description: "Turn this on and hit Save to erase all past outages and start the uptime % from zero.",
  },
];

function configure(settings) {
  if (settings.serverName  !== undefined) config.serverName  = settings.serverName  || config.serverName;
  if (settings.location    !== undefined) config.location    = settings.location;
  if (settings.countryFlag !== undefined) config.countryFlag = settings.countryFlag;
  if (settings.actionLabel !== undefined) config.actionLabel = settings.actionLabel || config.actionLabel;
  if (settings.showLocation !== undefined) config.showLocation = settings.showLocation;
  if (settings.buttonOnly   !== undefined) config.buttonOnly   = settings.buttonOnly;

  if (settings.clearOutages === "true" || settings.clearOutages === true) {
    state.outages     = [];
    state.totalDownMs = 0;
    state.firstSeenMs = Date.now();
    saveState(state);
    if (cache) cache.set("sidebar", null);
    console.log("[server-uptime] Outage history cleared by admin.");
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

let initialised = false;
function init(ctx) {
  if (initialised) return;
  initialised = true;
  pluginDir = ctx.dir;
  cache     = ctx.createCache(8_000);
  state     = loadState();
  state     = recordBoot(state);
  startHeartbeat();
}

// ── Slot — sidebar widget, no Configure button ────────────────────────────────
// Appears in Settings as: "Shows an uptime card in the sidebar on every search."
// No settingsSchema = no Configure button, matching the spellcheck plugin pattern.

export const slot = {
  id:          "server-uptime-slot",
  name:        "Server Uptime",
  description: "Shows an uptime card in the sidebar on every search.",

  position:      "above-sidebar",
  slotPositions: ["above-sidebar", "below-sidebar", "knowledge-panel", "at-a-glance"],

  // No settingsSchema or configure here — Configure lives on the bang plugin below
  init,

  trigger() { return config.buttonOnly !== "true"; },

  async execute() {
    const cached = cache.get("sidebar");
    if (cached) return { title: "Server Uptime", html: cached };
    const html = buildSidebarHtml(computeStats());
    cache.set("sidebar", html);
    return { title: "Server Uptime", html };
  },
};

// ── Bang plugin — !uptime command + all settings + logo button ────────────────
// Appears in Settings as: "Adds a hover button to the logo and lets you type
// !uptime to see full server details. Configure server name, location, and more."
// Has settingsSchema = shows Configure button.

export default {
  id:          "server-uptime",
  name:        "Server Uptime",
  description: "Adds a 'Server Details' button next to the settings icon and lets you type !uptime to see full server details. Configure server name, location, and more.",

  trigger:     "uptime",
  aliases:     ["up", "serverdetails"],
  naturalLanguagePhrases: ["server uptime", "server details", "is the server up"],

  settingsSchema,
  configure,
  init,

  async execute() {
    const stats = computeStats();
    return {
      title: `${config.serverName} — ${stats.uptimePct}% uptime`,
      html:  buildModalHtml(stats),
    };
  },
};

// ── Routes ────────────────────────────────────────────────────────────────────

export const routes = [
  {
    method: "get", path: "/data",
    handler(_req) {
      const stats = computeStats();
      return new Response(JSON.stringify({
        currentUptimeMs: stats.currentUptimeMs,
        uptimePct:       stats.uptimePct,
        bootTime:        stats.bootTime,
        lastOutage:      stats.lastOutage,
        totalOutages:    stats.totalOutages,
        serverName:      config.serverName,
        location:        config.location,
        countryFlag:     config.countryFlag,
        actionLabel:     config.actionLabel,
        buttonOnly:      config.buttonOnly,
      }), { headers: { "Content-Type": "application/json" } });
    },
  },
  {
    method: "get", path: "/modal",
    handler(_req) {
      cache.set("sidebar", null);
      return new Response(buildModalHtml(computeStats()), {
        headers: { "Content-Type": "text/html" },
      });
    },
  },
];
