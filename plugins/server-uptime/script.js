/* server-uptime/script.js  v1.0.0
 *
 * Injects a "Server Details" button before the settings gear (#nav-settings-top)
 * in Degoog's #header .header-right area. Works on both home and search pages.
 */

(function () {
  "use strict";

  var PLUGIN_ID = typeof __PLUGIN_ID__ !== "undefined" ? __PLUGIN_ID__ : "server-uptime";
  var API_DATA  = "/api/plugin/" + PLUGIN_ID + "/data";
  var API_MODAL = "/api/plugin/" + PLUGIN_ID + "/modal";
  var BTN_ID    = "su-gear-btn";

  // ── Duration formatter ─────────────────────────────────────────────────────
  function fmtMs(ms) {
    if (ms < 1000) return ms + "ms";
    var s = Math.floor(ms / 1000), m = Math.floor(s / 60),
        h = Math.floor(m / 60),   d = Math.floor(h / 24);
    if (d > 0) return d + "d " + (h % 24) + "h " + (m % 60) + "m";
    if (h > 0) return h + "h " + (m % 60) + "m " + (s % 60) + "s";
    if (m > 0) return m + "m " + (s % 60) + "s";
    return s + "s";
  }

  // ── Live tick ──────────────────────────────────────────────────────────────
  function tick() {
    document.querySelectorAll(".su-live[data-boot]").forEach(function (el) {
      var boot = parseInt(el.dataset.boot, 10);
      if (!isNaN(boot)) el.textContent = fmtMs(Date.now() - boot);
    });
  }

  // ── Modal ──────────────────────────────────────────────────────────────────
  var overlay = null;
  var isOpen  = false;

  function closeModal() {
    if (!overlay) return;
    overlay.classList.remove("su-overlay--open");
    isOpen = false;
    var el = overlay; overlay = null;
    setTimeout(function () { if (el && el.parentNode) el.parentNode.removeChild(el); }, 250);
  }

  async function openModal() {
    if (isOpen) { closeModal(); return; }
    isOpen = true;
    overlay = document.createElement("div");
    overlay.className = "su-overlay";
    overlay.innerHTML =
      '<div class="su-modal-loading"><div class="su-spinner"></div><span>Loading\u2026</span></div>';
    document.body.appendChild(overlay);

    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) closeModal();
    });
    function onEsc(e) {
      if (e.key === "Escape") { closeModal(); document.removeEventListener("keydown", onEsc); }
    }
    document.addEventListener("keydown", onEsc);

    requestAnimationFrame(function () {
      requestAnimationFrame(function () { if (overlay) overlay.classList.add("su-overlay--open"); });
    });

    try {
      var res = await fetch(API_MODAL);
      if (!res.ok) throw new Error("HTTP " + res.status);
      var html = await res.text();
      if (!overlay) return;
      overlay.innerHTML = html;
      var cb = overlay.querySelector("#su-close-btn");
      if (cb) cb.addEventListener("click", closeModal);
      tick();
    } catch (err) {
      if (overlay) {
        overlay.innerHTML =
          '<div class="su-modal-error"><p>\u26a0 Could not load server details.</p>' +
          '<p style="font-size:12px;opacity:.7">' + err.message + "</p>" +
          '<button class="su-modal-close" id="su-close-btn">Close</button></div>';
        var cb2 = overlay.querySelector("#su-close-btn");
        if (cb2) cb2.addEventListener("click", closeModal);
      }
    }
  }

  // ── Inject button before the settings gear ─────────────────────────────────
  // Degoog renders: #header > .header-right > #nav-settings-top
  // We insert our button immediately before #nav-settings-top.

  var btnLabel = "Server Details";

  function injectButton(label) {
    if (document.getElementById(BTN_ID)) return true;

    // Primary: exact ID confirmed from live DOM
    var gear = document.getElementById("nav-settings-top")
      // Fallbacks for future Degoog versions
      || document.querySelector(".header-right a[href='/settings']")
      || document.querySelector("#header a[href='/settings']")
      || document.querySelector("a[href='/settings']");

    if (!gear) return false;

    var btn = document.createElement("button");
    btn.id        = BTN_ID;
    btn.className = "su-gear-btn";
    btn.textContent = label || "Server Details";
    btn.setAttribute("aria-label", "Server Details");
    btn.setAttribute("type", "button");
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      openModal();
    });

    gear.parentNode.insertBefore(btn, gear);
    return true;
  }

  // ── Poll API every 30s ─────────────────────────────────────────────────────
  async function poll() {
    try {
      var res = await fetch(API_DATA);
      if (!res.ok) return;
      var data = await res.json();
      if (data.actionLabel && data.actionLabel !== btnLabel) {
        btnLabel = data.actionLabel;
        var b = document.getElementById(BTN_ID);
        if (b) b.textContent = btnLabel;
      }
      document.querySelectorAll(".su-pct").forEach(function (el) {
        el.textContent = data.uptimePct + "%";
      });
      document.querySelectorAll(".su-bar").forEach(function (el) {
        el.style.width = Math.min(100, parseFloat(data.uptimePct)) + "%";
      });
    } catch (_) {}
  }

  // ── Init ───────────────────────────────────────────────────────────────────
  function init() {
    tick();
    setInterval(tick, 1000);
    setInterval(poll, 30000);

    fetch(API_DATA)
      .then(function (r) { return r.json(); })
      .then(function (data) { btnLabel = data.actionLabel || btnLabel; })
      .catch(function () {})
      .finally(function () {
        if (!injectButton(btnLabel)) {
          // Search page renders #header after DOMContentLoaded — retry
          [100, 300, 700, 1500].forEach(function (ms) {
            setTimeout(function () { injectButton(btnLabel); }, ms);
          });
          var obs = new MutationObserver(function () {
            if (injectButton(btnLabel)) obs.disconnect();
          });
          obs.observe(document.body, { childList: true, subtree: true });
        }
      });

    poll();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
