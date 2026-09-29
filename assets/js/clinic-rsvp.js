/* ==========================================================================
   JUNIOR WOLVES — CLINIC RSVP PAGE
   --------------------------------------------------------------------------
   Self-contained on purpose. It borrows the patterns of forms.js (in-flight
   lock, inline validation, preserved input on failure, hard timeout) without
   sharing its code, so nothing here can change how tryout registration
   behaves. Posts to /api/clinic-rsvp, never /api/inquiry.

   Everything date-related comes from window.JW_CLINICS (assets/js/clinics.js).

   THE FUNNEL
     start  -> "already registered for tryouts?"
       yes  -> lookup (exact first + last + grade) -> confirm card -> RSVP
        no  -> register for tryouts (clinic carried through, auto-RSVP after)
                or just RSVP
     Every branch can reach the full form in one tap, and every failure of the
     lookup - no match, several matches, a server problem, a timeout - lands
     there automatically. Matching is never loosened to raise the hit rate:
     RSVPing the wrong child is worse than asking a family to type.
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
  /* Link attribution (?source=social_qr etc.), carried into the RSVP row. */
  var source = ((location.search.match(/[?&]source=([a-z0-9_-]{1,32})(?:&|$)/) || [])[1]) || "web";
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

  /* ====================================================================
     FUNNEL
     ==================================================================== */
  var steps = {};
  $$("[data-cr-step]").forEach(function (el) { steps[el.getAttribute("data-cr-step")] = el; });
  var startClinic = document.getElementById("cr-start-clinic");
  var haveFunnel = steps.start && steps.lookup && steps.notyet && steps.confirm && startClinic;

  function show(name) {
    Object.keys(steps).forEach(function (k) { steps[k].hidden = (k !== name); });
    form.hidden = (name !== "form");
    var el = name === "form" ? form : steps[name];
    var focusable = el && el.querySelector("input, select, button, a");
    if (focusable && name !== "start") { try { focusable.focus({ preventScroll: true }); } catch (e) { focusable.focus(); } }
  }

  /* One clinic choice, made once at the top, honoured by every branch. */
  function currentClinic() { return byId(haveFunnel ? startClinic.value : clinicSel.value) || selected; }

  function sessionLine(c, grade) {
    var sess = C.sessionFor ? C.sessionFor(c.id, grade) : null;
    return sess ? sess.label + " · " + sess.time : c.time;
  }

  function lookupStatus(type, html) {
    var box = $("[data-cr-lookup-status]", steps.lookup);
    if (box) box.innerHTML = html ? '<span class="' + type + '">' + html + "</span>" : "";
  }

  /* Anything that is not one confident match ends here: say so plainly, then
     put the family straight into the form with what they already typed. */
  function fallToForm(message) {
    var c = currentClinic();
    clinicSel.value = c.id;
    render(c);
    var f = document.getElementById("cl-first"), l = document.getElementById("cl-last"), g = document.getElementById("cl-grade");
    if (f && f.value) $("#cr-first", form).value = f.value.trim();
    if (l && l.value) $("#cr-last", form).value = l.value.trim();
    if (g && g.value) $("#cr-grade", form).value = g.value;
    show("form");
    if (message) status("ok", message);
  }

  function renderConfirm(data) {
    var c = byId(data.clinic && data.clinic.id) || currentClinic();
    var a = data.athlete;
    var needsAge = !!data.needsAge;

    if (data.alreadyRsvpd) {
      steps.confirm.innerHTML =
        '<p class="eyebrow jw-rsvp-group" style="margin-bottom:.25rem">Already on the list</p>' +
        '<h2 class="h4" style="margin:0">' + esc(a.first) + " is already RSVPed for this clinic.</h2>" +
        '<div class="cr-card"><p class="cr-name">' + esc(a.first + " " + a.last) + "</p>" +
          '<p class="cr-meta">' + esc(a.grade) + " grade</p>" +
          '<p class="cr-session">' + esc(c.weekday + ", " + c.date) + "<br>" + esc(sessionLine(c, a.grade)) + "</p></div>" +
        '<p class="small muted" style="margin:0">Nothing else to do &mdash; we\'ll see you there.</p>' +
        '<button class="btn btn--outline btn--block" type="button" data-cr-go="lookup">RSVP a different player</button>';
      show("confirm");
      wire(steps.confirm);
      return;
    }

    steps.confirm.innerHTML =
      '<p class="eyebrow jw-rsvp-group" style="margin-bottom:.25rem">Found them</p>' +
      '<h2 class="h4" style="margin:0">Is this your player?</h2>' +
      '<div class="cr-card"><p class="cr-name">' + esc(a.first + " " + a.last) + "</p>" +
        '<p class="cr-meta">' + esc(a.grade) + " grade</p>" +
        '<p class="cr-session">' + esc(c.weekday + ", " + c.date) + "<br>" + esc(sessionLine(c, a.grade)) +
        "<br>" + esc(C.location.name) + "</p></div>" +
      (needsAge
        ? '<div class="field"><label class="label" for="cc-age">Age</label>' +
          '<select class="select" id="cc-age" required><option value="">Select</option>' +
          C.ages.map(function (x) { return '<option value="' + x + '">' + x + "</option>"; }).join("") +
          '</select><p class="small muted" style="margin:.5rem 0 0">We ask once &mdash; it is the only thing we do not already have.</p></div>'
        : "") +
      '<button class="btn btn--primary btn--block" type="button" data-cr-confirm>Yes &mdash; RSVP ' + esc(a.first) + "</button>" +
      '<div class="form-status" data-cr-confirm-status aria-live="polite"></div>' +
      '<p class="small muted" style="margin:0"><button class="linkbtn" type="button" data-cr-go="form">That’s not my player</button></p>';

    steps.confirm.setAttribute("data-token", data.token);
    steps.confirm.setAttribute("data-clinic", c.id);
    steps.confirm.setAttribute("data-first", a.first);
    steps.confirm.setAttribute("data-last", a.last);
    steps.confirm.setAttribute("data-grade", a.grade);
    show("confirm");
    wire(steps.confirm);
  }

  function doLookup() {
    var first = (document.getElementById("cl-first").value || "").trim();
    var last = (document.getElementById("cl-last").value || "").trim();
    var grade = document.getElementById("cl-grade").value;
    if (!first || !last || !grade) {
      lookupStatus("err", "Please enter a first name, a last name and a grade.");
      return;
    }
    var btn = $("[data-cr-find]", steps.lookup), label = btn.textContent;
    btn.disabled = true; btn.textContent = "Looking…";
    lookupStatus("ok", "Checking our registration list…");

    var controller = typeof AbortController === "function" ? new AbortController() : null;
    var timer = setTimeout(function () { if (controller) controller.abort(); }, 12000);

    fetch("/api/clinic-lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ clinic: currentClinic().id, first: first, last: last, grade: grade }),
      signal: controller ? controller.signal : undefined
    })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (b) {
        clearTimeout(timer);
        btn.disabled = false; btn.textContent = label;
        if (b && b.ok && b.match === "one" && b.athlete && b.token) { lookupStatus("", ""); renderConfirm(b); return; }
        /* none / many / unavailable / anything unexpected -> the full form. */
        fallToForm(b && b.match === "many"
          ? "<strong>More than one player matches that name and grade.</strong><br>Please fill this in so we RSVP the right one."
          : "<strong>We couldn’t find that player on our registration list.</strong><br>No problem &mdash; fill this in and we’ll add the RSVP.");
      })
      .catch(function () {
        clearTimeout(timer);
        btn.disabled = false; btn.textContent = label;
        fallToForm("<strong>Our lookup didn’t answer just now.</strong><br>Fill this in instead &mdash; your RSVP will save the same way.");
      });
  }

  /* Confirming a matched athlete. The browser sends a token, never a row, and
     never school or parent details - the server reads those from the sheet. */
  function doConfirm() {
    var box = steps.confirm;
    var ageSel = document.getElementById("cc-age");
    if (ageSel && !ageSel.value) {
      $("[data-cr-confirm-status]", box).innerHTML = '<span class="err">Please choose an age.</span>';
      ageSel.focus();
      return;
    }
    var payload = {
      match_token: box.getAttribute("data-token"),
      clinic: box.getAttribute("data-clinic"),
      player_first: box.getAttribute("data-first"),
      player_last: box.getAttribute("data-last"),
      grade: box.getAttribute("data-grade"),
      age: ageSel ? ageSel.value : "",
      source: source
    };
    try {
      var rnd = new Uint8Array(4); (window.crypto || window.msCrypto).getRandomValues(rnd);
      payload.rsvp_id = "CR-2026-" + Array.prototype.map.call(rnd, function (x) { return ("0" + x.toString(16)).slice(-2); }).join("").toUpperCase();
    } catch (e) { /* the server assigns one */ }

    var btn = $("[data-cr-confirm]", box), label = btn.textContent;
    var st = $("[data-cr-confirm-status]", box);
    function say(type, html) { st.innerHTML = '<span class="' + type + '">' + html + "</span>"; }
    btn.disabled = true; btn.textContent = "Sending…";
    say("ok", "Saving your RSVP…");

    /* Same patient confirm protocol as the full form: a slow sheet must never
       be reported as a failure, and re-asking with the same id cannot write a
       second row. */
    var MAX = 6, attempt = 0, started = Date.now();
    function give(html) { btn.disabled = false; btn.textContent = label; say("err", html); }
    function again(pending) {
      if (attempt < MAX && Date.now() - started < 90000) {
        if (attempt >= 2) say("ok", "Still confirming with our sheet &mdash; please keep this page open.");
        setTimeout(go, 2500);
        return;
      }
      give(pending
        ? "<strong>We haven’t been able to confirm this yet.</strong><br>It may already be saved. Press the button again &mdash; it won’t create a duplicate."
        : "<strong>We couldn’t save that just now.</strong><br>Press the button again, or <button class=\"linkbtn\" type=\"button\" data-cr-go=\"form\">fill in the RSVP form</button>.");
      wire(box);
    }
    function go() {
      attempt++;
      var controller = typeof AbortController === "function" ? new AbortController() : null;
      var timer = setTimeout(function () { if (controller) controller.abort(); }, 25000);
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
          var b = r.body || {};
          if (b.rsvpId) payload.rsvp_id = b.rsvpId;
          if (r.ok && b.delivered === true) {
            success(b, { clinic: payload.clinic, player_first: payload.player_first });
            return;
          }
          if (r.status === 400 && b.error) { give("<strong>Check one more thing.</strong><br>" + esc(b.error)); return; }
          again(r.status === 202);
        })
        .catch(function () { clearTimeout(timer); again(true); });
    }
    go();
  }

  /* Delegated so freshly rendered cards work without rebinding by hand. */
  function wire(root) {
    $$("[data-cr-go]", root).forEach(function (btn) {
      if (btn.getAttribute("data-cr-wired")) return;
      btn.setAttribute("data-cr-wired", "1");
      btn.addEventListener("click", function () {
        var to = btn.getAttribute("data-cr-go");
        if (to === "form") { fallToForm(""); return; }
        if (to === "lookup") { lookupStatus("", ""); show("lookup"); return; }
        if (to === "notyet") { renderNotYet(); return; }
        show(to);
      });
    });
    $$("[data-cr-find]", root).forEach(function (btn) {
      if (btn.getAttribute("data-cr-wired")) return;
      btn.setAttribute("data-cr-wired", "1");
      btn.addEventListener("click", doLookup);
    });
    $$("[data-cr-confirm]", root).forEach(function (btn) {
      if (btn.getAttribute("data-cr-wired")) return;
      btn.setAttribute("data-cr-wired", "1");
      btn.addEventListener("click", doConfirm);
    });
  }

  function renderNotYet() {
    var c = currentClinic();
    $("[data-cr-notyet-copy]", steps.notyet).innerHTML =
      "Tryout registration takes a couple of minutes. Finish it and we’ll offer to add " +
      esc(c.weekday + ", " + c.date) + " to your RSVP right there &mdash; no second form.";
    var href = "junior-wolves.html?clinic=" + encodeURIComponent(c.id) +
               "&rsvp=1" + (source !== "web" ? "&source=" + encodeURIComponent(source) : "") + "#register";
    $("[data-cr-register]", steps.notyet).setAttribute("href", href);
    show("notyet");
  }

  if (haveFunnel) {
    startClinic.innerHTML = clinicSel.innerHTML;
    startClinic.value = selected.id;
    document.getElementById("cl-grade").innerHTML = '<option value="">Select</option>' +
      C.grades.map(function (g) { return '<option value="' + g + '">' + g + "</option>"; }).join("");
    startClinic.addEventListener("change", function () {
      var c = byId(startClinic.value) || selected;
      clinicSel.value = c.id;
      render(c);
    });
    wire(document);
    show("start");   /* only now is the fallback form hidden */
  }

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
    var c = byId(payload.clinic) || (typeof currentClinic === "function" ? currentClinic() : selected);
    if (typeof steps === "object" && steps) { Object.keys(steps).forEach(function (k) { steps[k].hidden = true; }); }
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
        '<div class="btn-row"><a class="btn btn--outline" href="clinic-rsvp?clinic=' + c.id + (source !== "web" ? "&source=" + source : "") + '">RSVP another player</a></div>' +
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
    payload.source = source;
    /* One id per submission, made here, so every retry and confirm (even after
       a dropped connection) refers to the same row. The server only accepts
       ids of exactly this shape. */
    try {
      var rnd = new Uint8Array(4); (window.crypto || window.msCrypto).getRandomValues(rnd);
      payload.rsvp_id = "CR-2026-" + Array.prototype.map.call(rnd, function (x) { return ("0" + x.toString(16)).slice(-2); }).join("").toUpperCase();
    } catch (e) { /* no crypto: the server assigns one */ }

    var button = $("button[type='submit']", form), label = button.textContent;
    function unlock() { form.removeAttribute("data-submitting"); button.disabled = false; button.textContent = label; }
    form.setAttribute("data-submitting", "true");
    button.disabled = true; button.textContent = "Sending…";
    status("ok", "Sending your RSVP…");

    /* The sheet sometimes takes a long time to hand back its answer even
       though the RSVP is already saved. So: ask, and if the server says
       "pending", ask again with the SAME rsvpId (safe — it can never create a
       second row) for up to ~90 s, telling the family what is happening.
       Success is only shown when the server has actually confirmed the row. */
    var MAX_ATTEMPTS = 6, attempt = 0, started = Date.now();
    var slow = setTimeout(function () {
      status("ok", "Still saving &mdash; this can take up to a minute. Please keep this page open.");
    }, 5000);

    function finishFail(html) {
      clearTimeout(slow); unlock(); status("err", html);
    }
    function send() {
      attempt++;
      var controller = typeof AbortController === "function" ? new AbortController() : null;
      var timer = setTimeout(function () { if (controller) controller.abort(); }, 25000);
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
          var b = r.body || {};
          if (b.rsvpId) payload.rsvp_id = b.rsvpId;          // keep asking about the same row
          if (r.ok && b.delivered === true) { clearTimeout(slow); success(b, payload); return; }
          if (r.status === 400 && b.error) {
            finishFail("<strong>Check one more thing.</strong><br>" + esc(b.error));
            return;
          }
          retryOrGiveUp(r.status === 202);
        })
        .catch(function () { clearTimeout(timer); retryOrGiveUp(true); });
    }
    function retryOrGiveUp(pending) {
      if (attempt < MAX_ATTEMPTS && Date.now() - started < 90000) {
        if (attempt >= 2) status("ok", "Still confirming your RSVP with our sheet &mdash; please keep this page open.");
        setTimeout(send, 2500);
        return;
      }
      finishFail(pending
        ? "<strong>We haven't been able to confirm your RSVP yet.</strong><br>" +
          "It may already be saved. You can press the button again &mdash; it won't create a duplicate &mdash; " +
          'or email <a href="mailto:' + EMAIL_TO + '">' + EMAIL_TO + "</a> and we'll check for you."
        : "<strong>We couldn't save your RSVP just now.</strong><br>" +
          "Your answers are still here &mdash; press the button again. Submitting twice won't create a duplicate.");
    }
    send();
  });
})();
