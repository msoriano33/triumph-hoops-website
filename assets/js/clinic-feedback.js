/* ==========================================================================
   JUNIOR WOLVES — CLINIC FEEDBACK PAGE
   --------------------------------------------------------------------------
   Same submission discipline as the RSVP page: one id per submission so a
   retry can never double-count a rating, a hard timeout, a patient "still
   saving" state, and no success shown until the server confirms the row.

   Clinic list comes from window.JW_CLINICS. Feedback is only offered for a
   clinic that has already finished - you cannot review something that has
   not happened.
   ========================================================================== */
(function () {
  "use strict";

  var C = window.JW_CLINICS;
  var form = document.getElementById("form-clinic-feedback");
  if (!C || !form) return;

  var EMAIL_TO = "triumphhoopsacademy@gmail.com";
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function esc(v) {
    return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function chicagoNow() {
    try {
      var p = {};
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", hour12: false
      }).formatToParts(new Date()).forEach(function (x) { p[x.type] = x.value; });
      return p.year + "-" + p.month + "-" + p.day + " " + (p.hour === "24" ? "00" : p.hour) + ":" + p.minute;
    } catch (e) {
      return new Date().toISOString().slice(0, 16).replace("T", " ");
    }
  }

  var now = chicagoNow();
  /* Most recent first: the clinic a parent is most likely writing about. */
  var past = C.clinics.filter(function (c) { return c.id + " " + c.end <= now; })
                      .sort(function (a, b) { return a.id < b.id ? 1 : -1; });

  var wrap = $("[data-feedback-wrap]");

  if (!past.length) {
    wrap.innerHTML = '<div class="stack"><p class="lead">There is no clinic to give feedback on yet.</p>' +
      '<p class="small muted">Questions? <a href="mailto:' + EMAIL_TO + '">' + EMAIL_TO + '</a></p></div>';
    return;
  }

  var requested = (location.search.match(/[?&]clinic=(\d{4}-\d{2}-\d{2})/) || [])[1];
  var source = ((location.search.match(/[?&]source=([a-z0-9_-]{1,32})(?:&|$)/) || [])[1]) || "web";
  function byId(id) { for (var i = 0; i < past.length; i++) if (past[i].id === id) return past[i]; return null; }
  var selected = byId(requested) || past[0];

  $("#cf-clinic", form).innerHTML = past.map(function (c) {
    return '<option value="' + c.id + '"' + (c.id === selected.id ? " selected" : "") + ">" +
      esc(c.weekday + ", " + c.date) + "</option>";
  }).join("");

  /* Session choices follow the clinic, so a clinic that was never split does
     not ask a question that has no answer. */
  function fillSessions(c) {
    var sel = $("#cf-session", form);
    var opts = ['<option value="">Select</option>'];
    if (c.sessions && c.sessions.length > 1) {
      c.sessions.forEach(function (s) { opts.push('<option value="' + esc(s.label) + '">' + esc(s.label) + "</option>"); });
    }
    opts.push('<option value="Not sure">Not sure</option>');
    sel.innerHTML = opts.join("");
    /* A single-session clinic has only one honest answer: hide the question. */
    var field = sel.closest(".field");
    if (!c.sessions || c.sessions.length < 2) { sel.value = "Not sure"; field.hidden = true; }
    else { field.hidden = false; }
  }
  fillSessions(selected);
  $("#cf-clinic", form).addEventListener("change", function () {
    fillSessions(byId(this.value) || selected);
  });

  /* ---- Validation ---------------------------------------------------- */
  function wrapOf(input) { return input.closest(".field") || input.parentNode; }
  function errEl(input) {
    var id = input.id + "-error", el = document.getElementById(id);
    if (!el) { el = document.createElement("p"); el.id = id; el.className = "field-error"; wrapOf(input).appendChild(el); }
    return el;
  }
  function setError(input, msg) {
    var el = errEl(input); el.textContent = msg; el.classList.add("is-visible");
    input.setAttribute("aria-invalid", "true"); input.setAttribute("aria-describedby", el.id);
  }
  function clearError(input) {
    var el = document.getElementById(input.id + "-error");
    if (el) { el.textContent = ""; el.classList.remove("is-visible"); }
    input.removeAttribute("aria-invalid");
  }
  function labelOf(input) {
    var l = $(".label", wrapOf(input));
    return l ? l.textContent.replace(/\(optional[^)]*\)/i, "").trim().replace(/\s+/g, " ") : "This question";
  }
  function check(input) {
    if (wrapOf(input).hidden) { clearError(input); return true; }
    var v = (input.value || "").trim();
    if (input.required && !v) { setError(input, "Please answer: " + labelOf(input)); return false; }
    if (input.type === "email" && v && !EMAIL_RE.test(v)) { setError(input, "Enter a valid email address, or leave this blank."); return false; }
    clearError(input); return true;
  }
  var fields = $$("input, select, textarea", form).filter(function (el) { return !el.closest(".hp"); });
  fields.forEach(function (el) {
    el.addEventListener("blur", function () { if (el.value) check(el); });
    el.addEventListener("change", function () { if (el.getAttribute("aria-invalid")) check(el); });
    el.addEventListener("input", function () { if (el.getAttribute("aria-invalid")) check(el); });
  });

  function status(type, html) {
    $(".form-status", form).innerHTML = '<span class="' + type + '">' + html + "</span>";
  }

  function success(payload) {
    var c = byId(payload.clinic) || selected;
    wrap.innerHTML =
      '<div class="stack" tabindex="-1" id="clinic-feedback-success">' +
        '<p class="eyebrow">Thank you</p>' +
        '<h2 class="h3">That is genuinely useful.</h2>' +
        '<p class="lead">Your feedback on ' + esc(c.weekday + ", " + c.date) + " is in.</p>" +
        '<p class="small muted">Our staff reads these before planning the next clinic. If you left an email and asked for a reply, you will hear from us.</p>' +
        '<div class="btn-row"><a class="btn btn--primary" href="clinic-rsvp">RSVP for the next clinic</a></div>' +
      "</div>";
    var t = document.getElementById("clinic-feedback-success");
    if (t) t.focus();
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    if (form.getAttribute("data-submitting") === "true") return;

    var firstBad = null;
    fields.forEach(function (el) { if (!check(el) && !firstBad) firstBad = el; });
    if (firstBad) { firstBad.focus(); return; }

    var payload = {};
    new FormData(form).forEach(function (v, k) { payload[k] = typeof v === "string" ? v.trim() : v; });
    payload.source = source;
    try {
      var rnd = new Uint8Array(4); (window.crypto || window.msCrypto).getRandomValues(rnd);
      payload.feedback_id = "CF-2026-" + Array.prototype.map.call(rnd, function (x) { return ("0" + x.toString(16)).slice(-2); }).join("").toUpperCase();
    } catch (e) { /* the server assigns one */ }

    var button = $("button[type='submit']", form), label = button.textContent;
    function unlock() { form.removeAttribute("data-submitting"); button.disabled = false; button.textContent = label; }
    form.setAttribute("data-submitting", "true");
    button.disabled = true; button.textContent = "Sending…";
    status("ok", "Sending your feedback…");

    var MAX = 5, attempt = 0, started = Date.now();
    function give(html) { unlock(); status("err", html); }
    function again(pending) {
      if (attempt < MAX && Date.now() - started < 70000) {
        if (attempt >= 2) status("ok", "Still saving — please keep this page open.");
        setTimeout(send, 2500);
        return;
      }
      give(pending
        ? "<strong>We haven’t been able to confirm that yet.</strong><br>It may already be saved. Press the button again — it won’t be counted twice."
        : "<strong>We couldn’t save that just now.</strong><br>Your answers are still here — press the button again, or email <a href=\"mailto:" + EMAIL_TO + "\">" + EMAIL_TO + "</a>.");
    }
    function send() {
      attempt++;
      var controller = typeof AbortController === "function" ? new AbortController() : null;
      var timer = setTimeout(function () { if (controller) controller.abort(); }, 25000);
      fetch("/api/clinic-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
        signal: controller ? controller.signal : undefined
      })
        .then(function (res) {
          return res.json().catch(function () { return {}; }).then(function (b) { return { ok: res.ok, status: res.status, body: b }; });
        })
        .then(function (r) {
          clearTimeout(timer);
          var b = r.body || {};
          if (b.feedbackId) payload.feedback_id = b.feedbackId;
          if (r.ok && b.delivered === true) { success(payload); return; }
          if (r.status === 400 && b.error) { give("<strong>Check one more thing.</strong><br>" + esc(b.error)); return; }
          again(r.status === 202);
        })
        .catch(function () { clearTimeout(timer); again(true); });
    }
    send();
  });
})();
