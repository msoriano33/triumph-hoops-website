/* ==========================================================================
   JUNIOR WOLVES — CLINIC RSVP PAGE
   --------------------------------------------------------------------------
   Self-contained on purpose. It borrows the patterns of forms.js (in-flight
   lock, inline validation, preserved input on failure, hard timeout) without
   sharing its code, so nothing here can change how tryout registration
   behaves. Posts to /api/clinic-rsvp, never /api/inquiry.

   Everything date-related comes from window.JW_CLINICS (assets/js/clinics.js).
   ========================================================================== */
(function () {
  "use strict";

  var C = window.JW_CLINICS;
  var form = document.getElementById("form-clinic-rsvp");
  if (!C || !form) return;

  var EMAIL_TO = "triumphhoopsacademy@gmail.com";
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function esc(v) {
    return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  /* ---- Which clinics are still upcoming (Chicago time, like the server) --- */
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
  var upcoming = C.clinics.filter(function (c) { return c.id + " " + c.end > now; });
  function byId(id) { for (var i = 0; i < upcoming.length; i++) if (upcoming[i].id === id) return upcoming[i]; return null; }

  var wrap = $("[data-clinic-wrap]");

  if (!upcoming.length) {
    $("[data-clinic-heading]").textContent = "The " + C.season + " clinics have wrapped up.";
    $("[data-clinic-time]").textContent = "";
    wrap.innerHTML = '<div class="stack"><p class="lead">There are no upcoming clinics to RSVP for right now.</p>' +
      '<p class="small muted">Questions? <a href="mailto:' + EMAIL_TO + '">' + EMAIL_TO + '</a></p></div>';
    return;
  }

  var requested = (location.search.match(/[?&]clinic=(\d{4}-\d{2}-\d{2})/) || [])[1];
  var selected = byId(requested) || byId(C.activeClinic) || upcoming[0];

  /* ---- Populate the controlled inputs -------------------------------- */
  var clinicSel = $("#cr-clinic", form);
  clinicSel.innerHTML = upcoming.map(function (c) {
    return '<option value="' + c.id + '"' + (c.id === selected.id ? " selected" : "") + ">" +
      esc((c.short || c.date) + " · " + c.time) + "</option>";
  }).join("");

  $("#cr-grade", form).innerHTML = '<option value="">Select</option>' +
    C.grades.map(function (g) { return '<option value="' + g + '">' + g + "</option>"; }).join("");
  $("#cr-age", form).innerHTML = '<option value="">Select</option>' +
    C.ages.map(function (a) { return '<option value="' + a + '">' + a + "</option>"; }).join("");

  /* ---- Event block follows the selected clinic ----------------------- */
  function render(c) {
    $("[data-clinic-title]").textContent = C.title;
    $("[data-clinic-heading]").textContent = c.weekday + ", " + c.date;
    $("[data-clinic-time]").textContent = c.time;
    $("[data-clinic-eligibility]").textContent = C.eligibility;
    $("[data-clinic-cost]").textContent = C.cost;
    $("[data-clinic-location]").innerHTML = esc(C.location.name) + "<br>" + esc(C.location.street) +
      "<br>" + esc(C.location.cityStateZip);
    $("[data-clinic-maps]").setAttribute("href", C.location.mapsUrl);
  }
  render(selected);
  clinicSel.addEventListener("change", function () { render(byId(clinicSel.value) || selected); });

  /* ---- Validation (same markup and wording style as forms.js) -------- */
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
    return l ? l.textContent.trim() : "This field";
  }
  function check(input) {
    var v = (input.value || "").trim();
    if (input.required && !v) { setError(input, labelOf(input) + " is required."); return false; }
    if (input.type === "email" && v && !EMAIL_RE.test(v)) { setError(input, "Enter a valid email address, like name@email.com."); return false; }
    clearError(input); return true;
  }
  var fields = $$("input, select", form).filter(function (el) { return !el.closest(".hp"); });
  fields.forEach(function (el) {
    el.addEventListener("blur", function () { if (el.value) check(el); });
    el.addEventListener("change", function () { if (el.getAttribute("aria-invalid")) check(el); });
    el.addEventListener("input", function () { if (el.getAttribute("aria-invalid")) check(el); });
  });

  function status(type, html) {
    var s = $(".form-status", form);
    s.innerHTML = '<span class="' + type + '">' + html + "</span>";
  }

  function success(result, payload) {
    var c = byId(payload.clinic) || selected;
    var name = esc(payload.player_first);
    var when = esc(c.weekday + ", " + c.date + " · " + c.time);
    var already = result.duplicate && !result.reactivated;
    wrap.innerHTML =
      '<div class="stack" tabindex="-1" id="clinic-rsvp-success">' +
        '<p class="eyebrow">' + (already ? "Already on the list" : "RSVP received") + "</p>" +
        '<h2 class="h3">' + (already ? name + " is already on the list." : "See you " + esc(c.weekday) + ", " + name + ".") + "</h2>" +
        '<p class="lead">' + when + "<br>" + esc(C.location.name) + "</p>" +
        (already ? '<p class="small muted">No need to RSVP again.</p>' : "") +
        '<p class="small muted">This RSVP helps coaches plan groups. It is not tryout registration.</p>' +
        '<div class="btn-row"><a class="btn btn--outline" href="clinic-rsvp?clinic=' + c.id + '">RSVP another player</a></div>' +
      "</div>";
    var t = document.getElementById("clinic-rsvp-success");
    if (t) t.focus();
  }

  /* ---- Submit -------------------------------------------------------- */
  form.addEventListener("submit", function (event) {
    event.preventDefault();
    if (form.getAttribute("data-submitting") === "true") return;   // double tap guard

    var firstBad = null;
    fields.forEach(function (el) { if (!check(el) && !firstBad) firstBad = el; });
    if (firstBad) { firstBad.focus(); return; }

    var payload = {};
    new FormData(form).forEach(function (v, k) { payload[k] = typeof v === "string" ? v.trim() : v; });

    var button = $("button[type='submit']", form), label = button.textContent;
    function unlock() { form.removeAttribute("data-submitting"); button.disabled = false; button.textContent = label; }
    form.setAttribute("data-submitting", "true");
    button.disabled = true; button.textContent = "Sending…";
    status("ok", "Sending your RSVP…");

    var controller = typeof AbortController === "function" ? new AbortController() : null;
    var timer = setTimeout(function () { if (controller) controller.abort(); }, 20000);

    fetch("/api/clinic-rsvp", {
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
        if (r.ok && r.body && r.body.delivered === true) { success(r.body, payload); return; }
        unlock();
        if (r.status === 400 && r.body && r.body.error) {
          status("err", "<strong>Check one more thing.</strong><br>" + esc(r.body.error));
          return;
        }
        status("err", "<strong>We couldn't save your RSVP just now.</strong><br>" +
          "Your answers are still here &mdash; press the button again. Submitting twice won't create a duplicate.");
      })
      .catch(function () {
        clearTimeout(timer);
        unlock();
        status("err", "<strong>The connection dropped.</strong><br>" +
          "Your answers are still here &mdash; press the button again. If it keeps happening, email " +
          '<a href="mailto:' + EMAIL_TO + '">' + EMAIL_TO + "</a>.");
      });
  });
})();
