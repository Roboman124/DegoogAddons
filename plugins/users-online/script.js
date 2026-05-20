/* users-online/script.js  v1.0.0
 *
 * 1. Assigns each browser a random persistent ID in localStorage.
 * 2. Pings /ping every 30s with that ID and the hidden preference.
 * 3. Injects a live "👥 Users Online · N" button before #nav-settings-top.
 * 4. Opens a modal on click with a "Hide me" toggle.
 * 5. Polls /count every 30s to keep the button badge up to date.
 */

(function () {
  "use strict";

  var PLUGIN_ID  = typeof __PLUGIN_ID__ !== "undefined" ? __PLUGIN_ID__ : "users-online";
  var API_PING   = "/api/plugin/" + PLUGIN_ID + "/ping";
  var API_COUNT  = "/api/plugin/" + PLUGIN_ID + "/count";
  var API_MODAL  = "/api/plugin/" + PLUGIN_ID + "/modal";
  var BTN_ID     = "uo-header-btn";
  var STORAGE_ID = "uo-visitor-id";
  var STORAGE_HIDDEN = "uo-hidden";

  // ── Visitor identity ───────────────────────────────────────────────────────
  // Generates a random ID once and stores it in localStorage.
  // This is purely local — never sent to any external service.

  function getVisitorId() {
    try {
      var id = localStorage.getItem(STORAGE_ID);
      if (!id) {
        id = "v-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
        localStorage.setItem(STORAGE_ID, id);
      }
      return id;
    } catch (_) {
      // localStorage blocked (private browsing with strict settings)
      return "v-" + Math.random().toString(36).slice(2);
    }
  }

  function isHidden() {
    try { return localStorage.getItem(STORAGE_HIDDEN) === "true"; }
    catch (_) { return false; }
  }

  function setHidden(val) {
    try { localStorage.setItem(STORAGE_HIDDEN, val ? "true" : "false"); }
    catch (_) {}
  }

  // ── Heartbeat ping ─────────────────────────────────────────────────────────

  var visitorId = getVisitorId();
  var lastCount = 0;
  var showCount = true;
  var btnLabel  = "Users Online";

  async function ping() {
    try {
      var res = await fetch(API_PING, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: visitorId, hidden: isHidden() }),
      });
      if (!res.ok) return;
      var data = await res.json();
      lastCount = data.count;
      updateBadge(data.count);
      updateSidebarCount(data.count);
      updateModalCount(data.count);
    } catch (_) {}
  }

  // ── Button injection ───────────────────────────────────────────────────────
  // Same confirmed selector as server-uptime: #nav-settings-top

  function buildBtnText(count) {
    var label = btnLabel || "Users Online";
    if (showCount) return "👥 " + label + " · " + count;
    return "👥 " + label;
  }

  function updateBadge(count) {
    var btn = document.getElementById(BTN_ID);
    if (btn) btn.textContent = buildBtnText(count);
  }

  function updateSidebarCount(count) {
    var el = document.getElementById("uo-sidebar-count");
    if (el) el.textContent = count;
  }

  function updateModalCount(visible) {
    var el = document.getElementById("uo-modal-count");
    if (el) el.textContent = visible;
  }

  function injectButton() {
    if (document.getElementById(BTN_ID)) return true;

    var gear = document.getElementById("nav-settings-top")
      || document.querySelector(".header-right a[href='/settings']")
      || document.querySelector("#header a[href='/settings']")
      || document.querySelector("a[href='/settings']");

    if (!gear) return false;

    var btn = document.createElement("button");
    btn.id        = BTN_ID;
    btn.className = "uo-header-btn";
    btn.setAttribute("type", "button");
    btn.setAttribute("aria-label", "Users Online");
    btn.textContent = buildBtnText(lastCount);

    // Tooltip on hover — hints at the hide feature
    btn.title = "Click to see who's online. You can hide yourself from the count.";

    btn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      openModal();
    });

    gear.parentNode.insertBefore(btn, gear);
    return true;
  }

  // ── Modal ──────────────────────────────────────────────────────────────────

  var overlay = null;
  var isOpen  = false;

  function closeModal() {
    if (!overlay) return;
    overlay.classList.remove("uo-overlay--open");
    isOpen = false;
    var el = overlay; overlay = null;
    setTimeout(function () { if (el && el.parentNode) el.parentNode.removeChild(el); }, 250);
  }

  async function openModal() {
    if (isOpen) { closeModal(); return; }
    isOpen = true;

    overlay = document.createElement("div");
    overlay.className = "uo-overlay";
    overlay.innerHTML =
      '<div class="uo-modal-loading"><div class="uo-spinner"></div><span>Loading\u2026</span></div>';
    document.body.appendChild(overlay);

    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) closeModal();
    });
    function onEsc(e) {
      if (e.key === "Escape") { closeModal(); document.removeEventListener("keydown", onEsc); }
    }
    document.addEventListener("keydown", onEsc);

    requestAnimationFrame(function () {
      requestAnimationFrame(function () { if (overlay) overlay.classList.add("uo-overlay--open"); });
    });

    try {
      var res = await fetch(API_MODAL);
      if (!res.ok) throw new Error("HTTP " + res.status);
      var html = await res.text();
      if (!overlay) return;
      overlay.innerHTML = html;

      // Wire close button
      var cb = overlay.querySelector("#uo-close-btn");
      if (cb) cb.addEventListener("click", closeModal);

      // Wire hide toggle — reflects current localStorage state
      wireHideToggle();

    } catch (err) {
      if (overlay) {
        overlay.innerHTML =
          '<div class="uo-modal-error"><p>\u26a0 Could not load panel.</p>' +
          '<p style="font-size:12px;opacity:.7">' + err.message + "</p>" +
          '<button class="uo-modal-close" id="uo-close-btn">Close</button></div>';
        var cb2 = overlay.querySelector("#uo-close-btn");
        if (cb2) cb2.addEventListener("click", closeModal);
      }
    }
  }

  // ── Hide toggle ────────────────────────────────────────────────────────────

  function wireHideToggle() {
    var toggle = overlay && overlay.querySelector("#uo-hide-toggle");
    if (!toggle) return;

    var hidden = isHidden();
    toggle.setAttribute("aria-checked", hidden ? "true" : "false");
    toggle.classList.toggle("uo-toggle-on", hidden);

    toggle.addEventListener("click", function () {
      hidden = !hidden;
      setHidden(hidden);
      toggle.setAttribute("aria-checked", hidden ? "true" : "false");
      toggle.classList.toggle("uo-toggle-on", hidden);
      // Ping immediately so the count updates right away
      ping();
    });
  }

  // ── Poll /count every 30s ──────────────────────────────────────────────────

  async function pollCount() {
    try {
      var res = await fetch(API_COUNT);
      if (!res.ok) return;
      var data = await res.json();

      // Sync config values that may have changed in settings
      if (data.buttonLabel) btnLabel  = data.buttonLabel;
      showCount = data.showCount !== "false";

      lastCount = data.count;
      updateBadge(data.count);
      updateSidebarCount(data.count);
    } catch (_) {}
  }

  // ── Init ───────────────────────────────────────────────────────────────────

  function tryInject() {
    if (!injectButton()) {
      [100, 300, 700, 1500].forEach(function (ms) {
        setTimeout(function () { injectButton(); }, ms);
      });
      var obs = new MutationObserver(function () {
        if (injectButton()) obs.disconnect();
      });
      obs.observe(document.body, { childList: true, subtree: true });
    }
  }

  function init() {
    // Fetch config FIRST so showCount and buttonLabel are correct
    // before the button is injected — avoids the flash of wrong text.
    fetch(API_COUNT)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.buttonLabel) btnLabel  = data.buttonLabel;
        showCount  = data.showCount !== "false";
        lastCount  = data.count || 0;
      })
      .catch(function () {})
      .finally(function () {
        // Inject button with correct label/count now that config is loaded
        tryInject();
        // Register this visitor immediately after injecting
        ping();
      });

    // Heartbeat every 30s
    setInterval(ping, 30_000);
    // Re-sync config every 30s
    setInterval(pollCount, 30_000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
