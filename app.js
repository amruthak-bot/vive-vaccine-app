/* VIVE — Vaccine Integrity Verification System, web edition.
   Logic mirrors the C++ console program exactly: same validators,
   same location ranges, same decideStatus reason/indication lines. */

"use strict";

/* ---------- Storage locations with cold-chain ranges ---------- */
const LOCATIONS = [
  { name: "Cold Room A",       min: 2,   max: 8   },
  { name: "Cold Room B",       min: 2,   max: 8   },
  { name: "ILR-1",             min: 2,   max: 8   },
  { name: "ILR-2",             min: 2,   max: 8   },
  { name: "Deep Freezer 1",    min: -25, max: -15 },
  { name: "Deep Freezer 2",    min: -25, max: -15 },
  { name: "Walk-in Freezer",   min: -25, max: -15 },
  { name: "Ultra-Low Freezer 1", min: -80, max: -60 },
  { name: "Cold Box 1",        min: 2,   max: 8   },
  { name: "Vaccine Carrier 1", min: 2,   max: 8   },
  { name: "Refrigerated Van",  min: 2,   max: 8   }
];

/* ---------- State ---------- */
let batches = [];
let queue = [];
let history = [];

const LS_KEY = "vive_vaccine_system_v1";

function save() {
  try { localStorage.setItem(LS_KEY, JSON.stringify({ batches, queue, history })); }
  catch (e) { /* storage unavailable: keep in-memory only */ }
}

function load() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    const d = JSON.parse(raw);
    if (d && Array.isArray(d.batches)) batches = d.batches;
    if (d && Array.isArray(d.queue)) queue = d.queue;
    if (d && Array.isArray(d.history)) history = d.history;
  } catch (e) { /* corrupted storage: start clean */ }
}

/* ---------- Validators (identical rules to the C++ program) ---------- */
const trim = s => String(s).replace(/^[\s\t\r]+|[\s\t\r]+$/g, "");
const isAlphaNumeric = s => /^[A-Za-z0-9]+$/.test(s);
const isValidVaccineName = s => /^[A-Za-z0-9 ]+$/.test(s) && trim(s).length > 0;

function isLeapYear(y) {
  return (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0);
}

function isValidDate(d) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const y = +d.slice(0, 4), m = +d.slice(5, 7), day = +d.slice(8, 10);
  if (m < 1 || m > 12) return false;
  const dim = [31, isLeapYear(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= dim[m - 1];
}

function parseNum(s) {
  s = trim(s);
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const v = parseFloat(s);
  return isFinite(v) ? v : null;
}

function systemDate() {
  const d = new Date();
  const p = n => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}

function findBatch(id) {
  return batches.find(b => b.id === id) || null;
}

function locationsSupporting(minT, maxT) {
  return LOCATIONS.filter(l => minT >= l.min && maxT <= l.max);
}

/* ---------- Verification engine (mirrors decideStatus exactly) ---------- */
function decideStatus(b) {
  const today = systemDate();
  if (!b.id || !b.vaccine || !b.expiryDate || !b.location) {
    return { status: "REVIEW REQUIRED", reason: "Required batch details are missing.", indication: "" };
  }
  if (b.expiryDate < today) {
    return { status: "HOLD", reason: "Vaccine batch has expired.", indication: "Do not distribute this batch." };
  }
  const ok = b.readings.every(r => r >= b.minTemp && r <= b.maxTemp);
  if (!ok) {
    return { status: "REVIEW REQUIRED", reason: "Temperature readings are outside the allowed range.", indication: "Batch requires further inspection." };
  }
  return { status: "VERIFIED", reason: "Expiry date and temperature readings are valid.", indication: "Batch passed the implemented verification checks." };
}

function isSortedById() {
  for (let i = 0; i + 1 < batches.length; i++) {
    if (batches[i].id > batches[i + 1].id) return false;
  }
  return true;
}

function binarySearch(id) {
  let lo = 0, hi = batches.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const midId = batches[mid].id;
    if (midId === id) return batches[mid];
    if (midId < id) lo = mid + 1; else hi = mid - 1;
  }
  return null;
}

/* ---------- DOM helpers ---------- */
const $ = id => document.getElementById(id);
const esc = s => String(s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function stamp(s, extra) {
  const key = String(s).replace(/[^A-Za-z0-9]+/g, "_");
  return '<span class="stamp st-' + key + (extra ? " " + extra : "") + '">' +
    String(s).replace(/_/g, " ") + "</span>";
}

function updateTopbar() {
  $("sysDate").textContent = systemDate();
  $("statBatches").textContent = batches.length;
  $("statQueue").textContent = queue.length;
}

/* ---------- Enhancement helpers ---------- */

/* Toast notifications (non-blocking, auto-dismiss). */
function ensureToastWrap() {
  let w = document.querySelector(".toast-wrap");
  if (!w) {
    w = document.createElement("div");
    w.className = "toast-wrap";
    w.setAttribute("aria-live", "polite");
    document.body.appendChild(w);
  }
  return w;
}
function toast(msg, kind) {
  kind = kind || "info";
  const wrap = ensureToastWrap();
  const el = document.createElement("div");
  el.className = "toast " + kind;
  const dot = document.createElement("span");
  dot.className = "dot";
  const txt = document.createElement("span");
  txt.textContent = msg;
  el.appendChild(dot); el.appendChild(txt);
  const dismiss = () => {
    el.classList.add("leaving");
    setTimeout(() => el.remove(), 240);
  };
  el.addEventListener("click", dismiss);
  wrap.appendChild(el);
  setTimeout(dismiss, 3400);
  while (wrap.children.length > 4) wrap.firstChild.remove();
}

/* Animated number counter. */
function animateCount(el, target) {
  target = +target || 0;
  const reduce = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || target <= 0) { el.textContent = target; return; }
  const dur = 650, t0 = performance.now();
  const step = now => {
    const p = Math.min(1, (now - t0) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(target * eased);
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* Stagger entrance of a set of cards. */
function stagger(scope, selector, baseDelay) {
  const reduce = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) return;
  scope.querySelectorAll(selector).forEach((el, i) => {
    el.style.animationDelay = ((baseDelay || 0) + i * 60) + "ms";
  });
}

/* Designed empty state with line-art vial. */
function emptyState(title, sub) {
  return '<div class="empty"><div class="empty-art">' +
    '<svg width="46" height="46" viewBox="0 0 30 30" fill="none" stroke="currentColor" stroke-width="1.6">' +
    '<rect x="11" y="3" width="8" height="4" rx="1" fill="currentColor" stroke="none" opacity="0.5"/>' +
    '<path d="M9 7h12v15a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5V7z"/>' +
    '<path d="M9 15h12"/></svg></div>' +
    '<div class="big">' + esc(title) + "</div>" + esc(sub) + "</div>";
}

/* Confirm dialog built on the existing modal (no native confirm()). */
function openConfirm(title, message, okLabel, onOk) {
  $("modalTitle").textContent = title;
  $("modalBody").innerHTML = "<p style='margin:0'>" + esc(message) + "</p>" +
    '<div class="confirm-btns">' +
    '<button class="btn ghost" id="cf_no" type="button">Cancel</button>' +
    '<button class="btn danger" id="cf_yes" type="button">' + esc(okLabel) + "</button></div>";
  $("modalBackdrop").hidden = false;
  $("cf_no").addEventListener("click", closeModal);
  $("cf_yes").addEventListener("click", () => { closeModal(); onOk(); });
}

/* Temperature bar: allowed zone shaded, readings plotted as dots. */
function tempBar(b) {
  const pad = Math.max(2, (b.maxTemp - b.minTemp) * 0.35);
  const lo = b.minTemp - pad, hi = b.maxTemp + pad;
  const pct = v => Math.min(100, Math.max(0, ((v - lo) / (hi - lo)) * 100));
  const zL = pct(b.minTemp), zW = pct(b.maxTemp) - zL;
  const dots = b.readings.map(r =>
    '<span class="tempbar-dot ' + (r >= b.minTemp && r <= b.maxTemp ? "ok" : "out") + '"' +
    ' style="left:' + pct(r).toFixed(1) + '%" title="' + r + '°C"></span>').join("");
  return '<div class="tempbar"><div class="tempbar-track">' +
    '<span class="tempbar-zone" style="left:' + zL.toFixed(1) + '%;width:' + zW.toFixed(1) + '%"></span>' +
    dots + '</div><div class="tempbar-scale"><span>' + lo.toFixed(0) +
    '°C</span><span>allowed ' + b.minTemp + " to " + b.maxTemp +
    '°C</span><span>' + hi.toFixed(0) + "°C</span></div></div>";
}

/* Specimen card for one batch. */
function specCard(b, opts) {
  opts = opts || {};
  const idAttr = "spec-" + b.id.replace(/[^A-Za-z0-9]/g, "_");
  const statusKey = String(b.status).replace(/[^A-Za-z0-9]+/g, "_");
  let html =
    '<article class="spec spec-status-' + statusKey + '" id="' + idAttr + '">' +
    '<div class="spec-top"><span class="spec-id">' + esc(b.id) + "</span>" + stamp(b.status) + "</div>" +
    '<div class="spec-vac">' + esc(b.vaccine) + "</div>" +
    '<dl class="spec-kv">' +
    "<dt>Expiry</dt><dd>" + esc(b.expiryDate) + "</dd>" +
    "<dt>Location</dt><dd>" + esc(b.location) + "</dd>" +
    "<dt>Readings</dt><dd>" + b.readings.map(esc).join(", ") + " °C</dd>" +
    "</dl>" +
    tempBar(b);
  if (opts.update) {
    html += '<div class="spec-actions"><button class="btn ghost small" data-update="' + esc(b.id) + '" type="button">Update location</button></div>' +
      '<div class="update-panel" id="upd-' + idAttr + '" hidden></div>';
  }
  html += "</article>";
  return html;
}

function locationOptions(selected) {
  let html = LOCATIONS.map((l, i) =>
    '<option value="' + i + '"' + (i === selected ? " selected" : "") + ">" +
    esc(l.name) + " (" + l.min + " to " + l.max + "°C)</option>").join("");
  html += '<option value="other">Other (custom location)</option>';
  return html;
}

/* ---------- Ranges modal ---------- */
function openRangesModal() {
  $("modalTitle").textContent = "Storage temperature ranges";
  $("modalBody").innerHTML =
    '<table class="data"><thead><tr><th>Location</th><th class="mono">Allowed (°C)</th></tr></thead><tbody>' +
    LOCATIONS.map(l => "<tr><td>" + esc(l.name) + '</td><td class="mono">' + l.min + " to " + l.max + "</td></tr>").join("") +
    "</tbody></table>";
  $("modalBackdrop").hidden = false;
}
function closeModal() { $("modalBackdrop").hidden = true; }

/* ---------- Navigation ---------- */
const NAV = [
  { id: "overview", label: "Overview" },
  { id: "add", label: "Add Batch" },
  { id: "batches", label: "Batches" },
  { id: "inspection", label: "Inspection" },
  { id: "search", label: "Search" },
  { id: "history", label: "History" }
];
let currentView = "overview";

function showView(name) {
  currentView = name;
  document.querySelectorAll(".navbtn").forEach(b =>
    b.classList.toggle("active", b.dataset.view === name));
  const v = VIEWS[name];
  const main = $("main");
  main.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "view";
  main.appendChild(wrap);
  if (v) v.render(wrap);
  updateTopbar();
  window.scrollTo(0, 0);
}

function initNav() {
  $("navIn").innerHTML = NAV.map(n =>
    '<button class="navbtn" data-view="' + n.id + '" type="button">' + n.label + "</button>").join("");
  document.querySelectorAll(".navbtn").forEach(b =>
    b.addEventListener("click", () => showView(b.dataset.view)));
  $("modalClose").addEventListener("click", closeModal);
  $("modalBackdrop").addEventListener("click", e => {
    if (e.target === $("modalBackdrop")) closeModal();
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });
  $("wipeData").addEventListener("click", () => {
    openConfirm("Clear all data?",
      "This deletes every batch, queue entry and history record in this browser. This cannot be undone.",
      "Delete everything",
      () => {
        batches = []; queue = []; history = [];
        save(); showView("overview");
        toast("All data cleared", "warn");
      });
  });
}

/* ---------- Views ---------- */
const VIEWS = {};

/* ----- Overview ----- */
VIEWS.overview = {
  render(main) {
    const counts = { VERIFIED: 0, HOLD: 0, "REVIEW REQUIRED": 0, PENDING: 0 };
    batches.forEach(b => { if (counts[b.status] !== undefined) counts[b.status]++; });

    const stat = (n, l, color, wash) =>
      '<div class="card stat-card" style="background:' + wash + '">' +
      '<div class="n" style="color:' + color + '">' + n + '</div><div class="l">' + l + "</div></div>";

    let html =
      '<div class="view-head"><span class="micro">Cold-chain verification console</span>' +
      "<h1>Every batch, <em>accounted for.</em></h1>" +
      "<p>Register vaccine batches, verify their storage conditions against WHO cold-chain ranges, and keep a tamper-evident trail of every inspection. Today is " +
      esc(systemDate()) + " (system date).</p></div>" +

      '<div class="hero"><span class="hero-orb"></span><span class="hero-orb amber"></span><h2 style="font-family:var(--serif);font-size:24px;margin:0 0 8px">Inspection pipeline</h2>' +
      '<p style="margin:0 0 18px;color:var(--ink-soft)">' + queue.length +
      " batch(es) waiting in the FIFO queue. Verification uses the system date automatically.</p>" +
      '<div class="btn-row" style="margin-top:0">' +
      '<button class="btn" data-go="add" type="button">Add new batch</button>' +
      '<button class="btn ghost" data-go="inspection" type="button">Open inspection queue</button>' +
      "</div></div>" +

      '<div class="grid">' +
      stat(batches.length, "Total batches", "var(--teal-deep)", "var(--teal-wash)") +
      stat(queue.length, "Awaiting inspection", "var(--ink-soft)", "var(--slate-wash)") +
      stat(counts["VERIFIED"], "Verified", "var(--emerald)", "var(--emerald-wash)") +
      stat(counts["HOLD"], "On hold", "var(--brick)", "var(--brick-wash)") +
      stat(counts["REVIEW REQUIRED"], "Review required", "var(--amber)", "var(--amber-wash)") +
      stat(history.length, "History entries", "var(--ink-soft)", "#F1EDE2") +
      "</div>";

    if (queue.length > 0) {
      html += '<div class="card anim-in"><div class="micro" style="margin-bottom:10px">Up next</div><ul class="qlist">' +
        queue.slice(0, 3).map((id, i) =>
          "<li><span class='qpos" + (i === 0 ? " front" : "") + "'>" + (i + 1) + "</span><b class='mono'>" +
          esc(id) + "</b>" + (i === 0 ? "<span class='qtag'>Next</span>" : "") + "</li>").join("") +
        "</ul></div>";
    }

    main.innerHTML = html;
    main.querySelectorAll("[data-go]").forEach(b =>
      b.addEventListener("click", () => showView(b.dataset.go)));
    /* animate the stat numbers counting up */
    main.querySelectorAll(".stat-card .n").forEach(el =>
      animateCount(el, el.textContent));
    stagger(main, ".stat-card", 40);
  }
};

/* ----- Add Batch ----- */
VIEWS.add = {
  render(main) {
    let customConfirmed = false;
    const setErr = (id, msg) => { $(id).textContent = msg; };

    main.innerHTML =
      '<div class="view-head"><span class="micro">Intake sheet · 01</span>' +
      "<h2>Register a new batch</h2>" +
      "<p>Every field is validated exactly like the console program — bad input is rejected with a reason, never silently.</p></div>" +

      '<div class="card">' +
      '<div class="form-sec" style="border-top:none;margin-top:0;padding-top:0">' +
      '<div class="form-sec-head"><span class="sec-num">1</span><div class="form-sec-title">Batch identity</div></div>' +
      '<p class="form-sec-sub">How this batch is known in the system.</p>' +
      '<label class="field"><span>Batch ID — letters and numbers only</span>' +
      '<input type="text" id="f_id" class="mono-in" autocomplete="off"><div class="f-err" id="e_id"></div></label>' +
      '<label class="field"><span>Vaccine name — letters and numbers only</span>' +
      '<input type="text" id="f_vac" autocomplete="off"><div class="f-err" id="e_vac"></div></label>' +
      '<label class="field"><span>Expiry date</span>' +
      '<input type="date" id="f_exp"><div class="f-err" id="e_exp"></div></label>' +
      "</div>" +

      '<div class="form-sec"><div class="form-sec-head"><span class="sec-num">2</span><div class="form-sec-title">Cold-chain storage</div></div>' +
      '<p class="form-sec-sub">Pick a validated location — its enforced temperature range applies.</p>' +
      '<label class="field"><span>Storage location</span>' +
      '<select id="f_loc">' + locationOptions(-1) + "</select></label>" +
      '<div class="btn-row" style="margin-top:-4px"><button class="btn ghost small" id="f_ranges" type="button">View temperature ranges</button></div>' +
      '<div id="customWrap" hidden style="margin-top:14px">' +
      '<label class="field"><span>Custom location</span>' +
      '<input type="text" id="f_custom" autocomplete="off"><div class="f-err" id="e_custom"></div></label>' +
      '<div id="confirmWrap" hidden><p style="margin:0 0 8px">You entered \u2018<b id="customEcho"></b>\u2019. Is this correct?</p>' +
      '<div class="btn-row" style="margin-top:0"><button class="btn small" id="customYes" type="button">Yes</button>' +
      '<button class="btn ghost small" id="customNo" type="button">No</button></div></div></div>' +
      '<div id="suggestBox"></div>' +
      '<div class="two-col">' +
      '<label class="field"><span>Minimum temperature (°C)</span>' +
      '<input type="text" id="f_min" class="mono-in" autocomplete="off"><div class="f-err" id="e_min"></div></label>' +
      '<label class="field"><span>Maximum temperature (°C)</span>' +
      '<input type="text" id="f_max" class="mono-in" autocomplete="off"><div class="f-err" id="e_max"></div></label>' +
      "</div></div>" +

      '<div class="form-sec"><div class="form-sec-head"><span class="sec-num">3</span><div class="form-sec-title">Temperature readings</div></div>' +
      '<p class="form-sec-sub">Between 1 and 5 probe readings for this batch.</p>' +
      '<label class="field"><span>Number of readings</span>' +
      '<select id="f_rcount"><option>1</option><option>2</option><option>3</option><option>4</option><option>5</option></select></label>' +
      '<div id="readingsWrap"></div>' +
      "</div>" +

      '<div class="btn-row"><button class="btn" id="f_submit" type="button">Add batch to system</button></div>' +
      '<div id="f_done" style="margin-top:14px"></div>' +
      "</div>";

    const renderReadings = () => {
      const n = parseInt($("f_rcount").value, 10);
      let html = "";
      for (let i = 0; i < n; i++) {
        html += '<label class="field"><span>Reading ' + (i + 1) + " (°C)</span>" +
          '<input type="text" class="f_reading mono-in" autocomplete="off"><div class="f-err"></div></label>';
      }
      $("readingsWrap").innerHTML = html;
    };
    renderReadings();
    $("f_rcount").addEventListener("change", renderReadings);
    $("f_ranges").addEventListener("click", openRangesModal);

    $("f_loc").addEventListener("change", () => {
      const isOther = $("f_loc").value === "other";
      $("customWrap").hidden = !isOther;
      $("confirmWrap").hidden = true;
      customConfirmed = false;
      $("suggestBox").innerHTML = "";
    });
    $("f_custom").addEventListener("input", () => {
      $("confirmWrap").hidden = true;
      customConfirmed = false;
    });

    const askConfirm = () => {
      const v = trim($("f_custom").value);
      if (!v) { setErr("e_custom", "Input cannot be empty."); return; }
      setErr("e_custom", "");
      $("customEcho").textContent = v;
      $("confirmWrap").hidden = false;
    };
    $("f_custom").addEventListener("change", askConfirm);
    $("customYes").addEventListener("click", () => { customConfirmed = true; $("confirmWrap").hidden = true; });
    $("customNo").addEventListener("click", () => {
      customConfirmed = false; $("confirmWrap").hidden = true;
      $("f_custom").value = ""; $("f_custom").focus();
    });

    $("f_submit").addEventListener("click", () => {
      let ok = true;
      const id = trim($("f_id").value);
      if (!isAlphaNumeric(id)) { setErr("e_id", "Batch ID should contain only letters and numbers."); $("f_id").classList.add("bad"); ok = false; }
      else if (findBatch(id)) { setErr("e_id", "Duplicate Batch ID."); $("f_id").classList.add("bad"); ok = false; }
      else { setErr("e_id", ""); $("f_id").classList.remove("bad"); }

      const vac = trim($("f_vac").value);
      if (!isValidVaccineName(vac)) { setErr("e_vac", "Vaccine name should contain only letters and numbers."); ok = false; }
      else setErr("e_vac", "");

      const exp = $("f_exp").value;
      if (!isValidDate(exp)) { setErr("e_exp", "Enter a valid calendar date."); ok = false; }
      else setErr("e_exp", "");

      let location = null, locIdx = -1;
      if ($("f_loc").value === "other") {
        const c = trim($("f_custom").value);
        if (!c) { setErr("e_custom", "Input cannot be empty."); ok = false; }
        else if (!customConfirmed) { askConfirm(); setErr("e_custom", "Please confirm the custom location first."); ok = false; }
        else { setErr("e_custom", ""); location = c; }
      } else {
        locIdx = parseInt($("f_loc").value, 10);
        location = LOCATIONS[locIdx].name;
      }

      const minT = parseNum($("f_min").value), maxT = parseNum($("f_max").value);
      if (minT === null) { setErr("e_min", "Enter a valid number."); ok = false; } else setErr("e_min", "");
      if (maxT === null) { setErr("e_max", "Enter a valid number."); ok = false; } else setErr("e_max", "");
      if (ok && minT >= maxT) { setErr("e_max", "Maximum must be greater than minimum."); ok = false; }

      const readingInputs = Array.from(document.querySelectorAll(".f_reading"));
      const readings = [];
      readingInputs.forEach(inp => {
        const v = parseNum(inp.value);
        const errEl = inp.parentElement.querySelector(".f-err");
        if (v === null) { errEl.textContent = "Enter a valid number."; inp.classList.add("bad"); ok = false; }
        else { errEl.textContent = ""; inp.classList.remove("bad"); readings.push(v); }
      });

      if (!ok) return;

      if (locIdx >= 0 && (minT < LOCATIONS[locIdx].min || maxT > LOCATIONS[locIdx].max)) {
        const fits = locationsSupporting(minT, maxT);
        let html = '<div class="suggest-box"><p>' + esc(LOCATIONS[locIdx].name) +
          " allows temperatures between " + LOCATIONS[locIdx].min + "°C and " + LOCATIONS[locIdx].max +
          "°C. Locations supporting " + minT + "°C to " + maxT + "°C:</p><div class='loc-btns'>";
        html += fits.length === 0
          ? "<p>None — choose Other and enter a custom location.</p>"
          : fits.map(l => '<button class="btn ghost small" data-loc="' + LOCATIONS.indexOf(l) + '" type="button">' + esc(l.name) + "</button>").join("");
        html += "</div></div>";
        $("suggestBox").innerHTML = html;
        $("suggestBox").querySelectorAll("[data-loc]").forEach(b =>
          b.addEventListener("click", () => {
            $("f_loc").value = b.dataset.loc;
            $("suggestBox").innerHTML = '<div class="notice info">Location changed to ' +
              esc(LOCATIONS[+b.dataset.loc].name) + ". Review the temperatures and submit again.</div>";
          }));
        return;
      }

      batches.push({ id, vaccine: vac, expiryDate: exp, location, minTemp: minT, maxTemp: maxT, readings, status: "PENDING" });
      queue.push(id);
      save();
      $("f_done").innerHTML = '<div class="notice good">Batch added successfully. Batch added to inspection queue.</div>';
      toast("Batch " + id + " added to the inspection queue", "good");
      updateTopbar();
      setTimeout(() => showView("inspection"), 900);
    });
  }
};

/* ----- Batches ----- */
VIEWS.batches = {
  render(main, note) {
    let html = '<div class="view-head"><span class="micro">Registry · ' + batches.length + " batch(es)</span>" +
      "<h2>All batch records</h2>" +
      "<p>Every registered batch with its live verification status. Update a batch's storage location from its card.</p></div>";
    if (note) html += '<div class="notice good">' + esc(note) + "</div>";

    html += '<div class="toolbar">' +
      '<button class="btn ghost small" id="t_sortId" type="button">Sort by Batch ID</button>' +
      '<button class="btn ghost small" id="t_sortStatus" type="button">Sort by Status</button>' +
      '<span class="spacer"></span><span class="count-note mono" id="t_count"></span></div>';

    if (batches.length === 0) {
      html += '<div class="card">' + emptyState("No batches yet", "Add your first batch to begin verification.") + "</div>";
    } else {
      html += '<div class="spec-grid">' + batches.map(b => specCard(b, { update: true })).join("") + "</div>";
    }
    main.innerHTML = html;
    $("t_count").textContent = batches.length + " record(s)";
    stagger(main, ".spec-grid .spec", 30);

    $("t_sortId").addEventListener("click", () => {
      batches.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
      save(); showView("batches");
      toast("Sorted by Batch ID", "info");
    });
    $("t_sortStatus").addEventListener("click", () => {
      batches.sort((a, b) => a.status < b.status ? -1 : a.status > b.status ? 1 : 0);
      save(); showView("batches");
      toast("Sorted by Status", "info");
    });

    main.querySelectorAll("[data-update]").forEach(btn =>
      btn.addEventListener("click", () => {
        main.querySelectorAll(".update-panel").forEach(p => { p.hidden = true; p.innerHTML = ""; });
        openUpdatePanel(btn.dataset.update);
      }));
  }
};

/* Inline update-location panel inside a specimen card. */
function openUpdatePanel(id) {
  const b = findBatch(id);
  if (!b) return;
  const panelId = "upd-spec-" + id.replace(/[^A-Za-z0-9]/g, "_");
  const panel = $(panelId);
  if (!panel) return;
  const curIdx = LOCATIONS.findIndex(l => l.name === b.location);

  panel.innerHTML =
    '<div style="margin-top:6px">' +
    '<label class="field"><span>New storage location</span>' +
    '<select id="up_loc">' + locationOptions(curIdx) + "</select></label>" +
    '<div class="two-col">' +
    '<label class="field"><span>Min (°C)</span><input type="text" id="up_min" class="mono-in" value="' + b.minTemp + '"></label>' +
    '<label class="field"><span>Max (°C)</span><input type="text" id="up_max" class="mono-in" value="' + b.maxTemp + '"></label>' +
    "</div><div id='up_msg'></div>" +
    '<div class="btn-row" style="margin-top:6px"><button class="btn small" id="up_save" type="button">Save changes</button>' +
    '<button class="btn ghost small" id="up_cancel" type="button">Cancel</button></div></div>';
  panel.hidden = false;

  $("up_cancel").addEventListener("click", () => { panel.hidden = true; panel.innerHTML = ""; });
  $("up_save").addEventListener("click", () => {
    const sel = $("up_loc").value;
    if (sel === "other") {
      $("up_msg").innerHTML = '<div class="notice info">Custom locations can only be set when adding a batch. Please pick a listed location here.</div>';
      return;
    }
    const minT = parseNum($("up_min").value), maxT = parseNum($("up_max").value);
    if (minT === null || maxT === null || minT >= maxT) {
      $("up_msg").innerHTML = '<div class="notice bad">Enter valid temperatures with minimum less than maximum.</div>';
      return;
    }
    const loc = LOCATIONS[+sel];
    if (minT < loc.min || maxT > loc.max) {
      const fits = locationsSupporting(minT, maxT);
      let html = '<div class="suggest-box"><p>' + minT + "°C to " + maxT + "°C does not suit " +
        esc(loc.name) + ". Locations supporting them:</p><div class='loc-btns'>";
      html += fits.length === 0 ? "<p>None.</p>" :
        fits.map(l => '<button class="btn ghost small" data-uloc="' + LOCATIONS.indexOf(l) + '" type="button">' + esc(l.name) + "</button>").join("");
      html += "</div><p style='margin:8px 0 0'>…or adjust the temperatures and save again.</p></div>";
      $("up_msg").innerHTML = html;
      $("up_msg").querySelectorAll("[data-uloc]").forEach(x =>
        x.addEventListener("click", () => { $("up_loc").value = x.dataset.uloc; $("up_msg").innerHTML = ""; }));
      return;
    }
    b.location = loc.name;
    b.minTemp = minT; b.maxTemp = maxT;
    save();
    toast("Batch " + b.id + " moved to " + loc.name, "good");
    showView("batches");
  });
}

/* ----- Inspection (queue + process) ----- */
VIEWS.inspection = {
  render(main) {
    let html = '<div class="view-head"><span class="micro">FIFO pipeline</span>' +
      "<h2>Inspection queue</h2>" +
      "<p>Batches are verified in the order they were added. Verification uses the system date (" +
      esc(systemDate()) + ") automatically.</p></div>";

    /* pipeline progress: inspected vs total registered */
    const inspected = batches.length - queue.length;
    const pct = batches.length > 0 ? Math.round((inspected / batches.length) * 100) : 0;
    html += '<div class="card anim-in" style="margin-bottom:16px"><div class="prog">' +
      '<div class="prog-top"><span>Inspection progress</span>' +
      '<span class="mono">' + inspected + " of " + batches.length + " inspected</span></div>" +
      '<div class="prog-track"><div class="prog-fill" style="width:' + pct + '%"></div></div>' +
      "</div></div>";

    if (queue.length === 0) {
      html += '<div class="card">' + emptyState("Queue is empty", "Nothing waiting for verification.") + "</div>";
    } else {
      const front = findBatch(queue[0]);
      html += '<div class="card" style="margin-bottom:16px"><div class="micro" style="margin-bottom:12px">Waiting · ' +
        queue.length + ' batch(es)</div><ul class="qlist">' +
        queue.map((qid, i) =>
          "<li><span class='qpos" + (i === 0 ? " front" : "") + "'>" + (i + 1) + "</span>" +
          "<span class='mono' style='font-weight:600'>" + esc(qid) + "</span>" +
          (i === 0 ? "<span class='qtag'>Next</span>" : "") + "</li>").join("") +
        "</ul></div>";

      if (front) {
        html += '<div class="micro" style="margin-bottom:10px">Now inspecting</div>' + specCard(front) +
          '<div class="card" style="margin-top:16px"><div class="btn-row" style="margin-top:0">' +
          '<button class="btn" id="p_go" type="button">Verify batch ' + esc(front.id) + "</button></div></div>";
      }
    }
    html += '<div id="p_out" style="margin-top:16px"></div>';
    main.innerHTML = html;

    const btn = $("p_go");
    if (!btn) return;
    btn.addEventListener("click", () => {
      const qid = queue[0];
      const b = findBatch(qid);
      if (b) {
        const r = decideStatus(b);
        b.status = r.status;
        history.push(b.id + " - " + b.status);
        const toastKind = r.status === "VERIFIED" ? "good" : (r.status === "HOLD" ? "bad" : "warn");
        toast("Batch " + b.id + ": " + r.status.replace(/_/g, " "), toastKind);
        let res = '<div class="card result"><h3>Batch ' + esc(b.id) + " " + stamp(r.status, "stamp-pop") + "</h3>" +
          '<p class="reason"><b>Reason</b><br>' + esc(r.reason) + "</p>";
        if (r.indication) res += '<p class="reason"><b>Indication</b><br>' + esc(r.indication) + "</p>";
        res += '<div class="btn-row"><button class="btn ghost" id="p_next" type="button">Back to queue</button></div></div>';
        $("p_out").innerHTML = res;
        $("p_next").addEventListener("click", () => showView("inspection"));
      }
      queue.shift();
      save();
      updateTopbar();
    });
  }
};

/* ----- Search (sequential + binary) ----- */
VIEWS.search = {
  render(main) {
    main.innerHTML =
      '<div class="view-head"><span class="micro">Lookup</span>' +
      "<h2>Search batches</h2>" +
      "<p>Sequential search scans every record. Binary search needs the list sorted by Batch ID first.</p></div>" +
      '<div class="tabs" role="tablist">' +
      '<button class="active" data-mode="seq" type="button">Sequential</button>' +
      '<button data-mode="bin" type="button">Binary</button></div>' +
      '<div class="card"><label class="field"><span>Batch ID</span>' +
      '<input type="text" id="s_id" class="mono-in" autocomplete="off"><div class="f-err" id="s_err"></div></label>' +
      '<div class="btn-row"><button class="btn" id="s_go" type="button">Search</button></div></div>' +
      '<div id="s_out" style="margin-top:16px"></div>';

    let mode = "seq";
    main.querySelectorAll(".tabs button").forEach(t =>
      t.addEventListener("click", () => {
        mode = t.dataset.mode;
        main.querySelectorAll(".tabs button").forEach(x => x.classList.toggle("active", x === t));
        $("s_out").innerHTML = "";
        $("s_err").textContent = "";
      }));

    const go = () => {
      const id = trim($("s_id").value);
      if (!isAlphaNumeric(id)) { $("s_err").textContent = "Batch ID should contain only letters and numbers."; return; }
      $("s_err").textContent = "";
      if (mode === "bin") {
        if (batches.length === 0) { $("s_out").innerHTML = '<div class="notice warn">No batch records available.</div>'; return; }
        if (!isSortedById()) {
          $("s_out").innerHTML = '<div class="notice warn">Batch list is not sorted by Batch ID.<br>Sort by Batch ID on the Batches page first.</div>';
          return;
        }
        const b = binarySearch(id);
        $("s_out").innerHTML = b ? specCard(b) : '<div class="notice warn">Batch Not Found.</div>';
      } else {
        const b = findBatch(id);
        $("s_out").innerHTML = b ? specCard(b) : '<div class="notice warn">Batch Not Found.</div>';
      }
    };
    $("s_go").addEventListener("click", go);
    $("s_id").addEventListener("keydown", e => { if (e.key === "Enter") go(); });
  }
};

/* ----- History ----- */
VIEWS.history = {
  render(main) {
    let html = '<div class="view-head"><span class="micro">Audit trail</span>' +
      "<h2>Verification history</h2>" +
      "<p>Every verification action, most recent first. The stack never forgets.</p></div>";

    html += '<div class="card anim-in" style="margin-bottom:16px"><div class="micro" style="margin-bottom:8px">Last verification action</div>' +
      (history.length === 0
        ? emptyState("No history yet", "Verify a batch and it will appear here.")
        : '<div class="mono" style="font-size:17px;font-weight:600">' + esc(history[history.length - 1]) + "</div>") +
      "</div>";

    if (history.length > 0) {
      html += '<div class="card"><ul class="hist">' +
        history.slice().reverse().map(h => "<li>" + esc(h) + "</li>").join("") +
        "</ul></div>";
    }
    main.innerHTML = html;
  }
};

/* ---------- Boot ---------- */
load();
initNav();
showView("overview");
