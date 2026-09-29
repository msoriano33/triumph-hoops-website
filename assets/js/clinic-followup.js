/* ==========================================================================
   JUNIOR WOLVES — RSVP AFTER TRYOUT REGISTRATION
   --------------------------------------------------------------------------
   The back half of the RSVP funnel. A family that answered "not registered
   yet" arrives here from clinic-rsvp with ?clinic=<id>&rsvp=1. When their
   tryout registration is confirmed, this adds ONE more step: the clinic they
   came for, one age field, one button.

   It is strictly additive. Without the query string, or if this file fails to
   load, tryout registration behaves exactly as it always has - the success
   state is already on screen before any of this runs.

   No family data is stored anywhere by this file. The registration payload is
   reused in memory for the RSVP and then goes out of scope with the page.
   ========================================================================== */
(function () {
  "use strict";

  var C = window.JW_CLINICS;
  if (!C) return;

  var q = location.search;
  var wanted = (q.match(/[?&]clinic=(\d{4}-\d{2}-\d{2})/) || [])[1];
  var asked = /[?&]rsvp=1(?:&|$)/.test(q);
  if (!wanted || !asked) return;

  var source = ((q.match(/[?&]source=([a-z0-9_-]{1,32})(?:&|$)/) || [])[1]) || "funnel_register";
  var EMAIL_TO = "triumphhoopsacademy@gmail.com";

  function esc(v) {
    return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  /* Chicago-time clock, same rule the server uses: a clinic is offerable
     until it ends, not until midnight. */
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

  var clinic = C.clinicById ? C.clinicById(wanted) : null;
  if (!clinic) return;
  if (clinic.id + " " + clinic.end <= chicagoNow()) return;   /* already over */

  /* Grade is what the registration form collects; split the full name the
     same way the rest of the pipeline does. */
  function splitName(full) {
    var parts = String(full || "").replace(/\([^)]*\)/g, " ").trim().split(/\s+/).filter(Boolean);
    if (parts.length < 2) return null;
    return { first: parts[0], last: parts[parts.length - 1] };
  }

  window.JW_AFTER_SUBMIT = function (form, wrap, payload) {
    if (form.id !== "form-junior-wolves") return;

    var name = splitName(payload.player_name);
    var grade = String(payload.player_grade || "").trim();
    var email = String(payload.parent_email || "").trim();
    if (!name || C.grades.indexOf(grade) === -1 || !email) return;

    var sess = C.sessionFor ? C.sessionFor(clinic.id, grade) : null;
    var when = sess ? sess.label + " · " + sess.time : clinic.time;

    var box = document.createElement("div");
    box.className = "stack";
    box.style.marginTop = "2rem";
    box.innerHTML =
      '<p class="eyebrow">One more thing</p>' +
      '<h3 class="h4" style="margin:0">Add ' + esc(name.first) + " to the " + esc(clinic.short || clinic.date) + " clinic?</h3>" +
      '<div class="cr-card">' +
        '<p class="cr-name">' + esc(clinic.weekday + ", " + clinic.date) + "</p>" +
        '<p class="cr-meta">' + esc(when) + "</p>" +
        '<p class="cr-session">' + esc(C.location.name) + "<br>" + esc(C.location.street) + "<br>" + esc(C.location.cityStateZip) + "</p>" +
      "</div>" +
      '<div class="field"><label class="label" for="cf-age">' + esc(name.first) + "&rsquo;s age</label>" +
        '<select class="select" id="cf-age"><option value="">Select</option>' +
        C.ages.map(function (a) { return '<option value="' + a + '">' + a + "</option>"; }).join("") +
        "</select></div>" +
      '<button class="btn btn--primary btn--block" type="button" id="cf-go">RSVP for the clinic</button>' +
      '<div class="form-status" id="cf-status" aria-live="polite"></div>' +
      '<p class="small muted" style="margin:0">The clinic is free and separate from tryouts. Skipping this changes nothing about the registration you just submitted.</p>';
    wrap.appendChild(box);

    var btn = document.getElementById("cf-go");
    var st = document.getElementById("cf-status");
    var ageSel = document.getElementById("cf-age");
    function say(type, html) { st.innerHTML = '<span class="' + type + '">' + html + "</span>"; }

    btn.addEventListener("click", function () {
      if (!ageSel.value) { say("err", "Please choose an age."); ageSel.focus(); return; }
      var body = {
        clinic: clinic.id,
        player_first: name.first,
        player_last: name.last,
        grade: grade,
        age: ageSel.value,
        school: String(payload.school || "").trim(),
        parent_name: String(payload.parent_name || "").trim(),
        parent_email: email,
        source: source
      };
      try {
        var rnd = new Uint8Array(4); (window.crypto || window.msCrypto).getRandomValues(rnd);
        body.rsvp_id = "CR-2026-" + Array.prototype.map.call(rnd, function (x) { return ("0" + x.toString(16)).slice(-2); }).join("").toUpperCase();
      } catch (e) { /* the server assigns one */ }

      var label = btn.textContent;
      btn.disabled = true; btn.textContent = "Sending…";
      say("ok", "Saving the RSVP…");

      var MAX = 6, attempt = 0, started = Date.now();
      function give(html) { btn.disabled = false; btn.textContent = label; say("err", html); }
      function again(pending) {
        if (attempt < MAX && Date.now() - started < 90000) {
          if (attempt >= 2) say("ok", "Still confirming with our sheet — please keep this page open.");
          setTimeout(go, 2500);
          return;
        }
        give(pending
          ? "<strong>We haven’t been able to confirm the RSVP yet.</strong><br>It may already be saved. Press the button again — it won’t create a duplicate."
          : "<strong>We couldn’t save the RSVP just now.</strong><br>Press the button again, or email <a href=\"mailto:" + EMAIL_TO + "\">" + EMAIL_TO + "</a>.");
      }
      function go() {
        attempt++;
        var controller = typeof AbortController === "function" ? new AbortController() : null;
        var timer = setTimeout(function () { if (controller) controller.abort(); }, 25000);
        fetch("/api/clinic-rsvp", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(body),
          signal: controller ? controller.signal : undefined
        })
          .then(function (res) {
            return res.json().catch(function () { return {}; }).then(function (b) { return { ok: res.ok, status: res.status, body: b }; });
          })
          .then(function (r) {
            clearTimeout(timer);
            var b = r.body || {};
            if (b.rsvpId) body.rsvp_id = b.rsvpId;
            if (r.ok && b.delivered === true) {
              box.innerHTML =
                '<p class="eyebrow">RSVP confirmed</p>' +
                '<h3 class="h4" style="margin:0">' + esc(name.first) + " is on the list for " + esc(clinic.weekday + ", " + clinic.date) + ".</h3>" +
                '<p class="lead" style="margin:0">' + esc(when) + "<br>" + esc(C.location.name) + "</p>" +
                '<p class="small muted" style="margin:0">A confirmation email is on its way to you.</p>';
              return;
            }
            if (r.status === 400 && b.error) { give("<strong>Check one more thing.</strong><br>" + esc(b.error)); return; }
            again(r.status === 202);
          })
          .catch(function () { clearTimeout(timer); again(true); });
      }
      go();
    });
  };
})();
