/* ==========================================================================
   JUNIOR WOLVES — CLINIC SCHEDULE (single source of truth)
   --------------------------------------------------------------------------
   Read by BOTH:
     - the RSVP page  (clinic-rsvp.html loads this file with a <script> tag)
     - the server     (api/clinic-rsvp.js require()s this same file)

   so the page and the server can never disagree about which clinics exist.

   TO CHANGE THE ACTIVE CLINIC
     Set `activeClinic` to the id of the clinic you are promoting. That clinic
     becomes the default on /clinic-rsvp and the headline of the event block.
     Nothing else changes.

   TO ADD A CLINIC
     Add an entry to `clinics`. The id is the date, YYYY-MM-DD. Past clinics
     disappear from the form automatically the day after they happen, and the
     server refuses RSVPs for them, so an old entry left here is harmless.

   A LINK TO ONE SPECIFIC CLINIC
     /clinic-rsvp?clinic=2026-10-11 preselects that clinic (if it is still
     upcoming), regardless of `activeClinic`.
   ========================================================================== */
(function (root) {
  "use strict";

  var JW_CLINICS = {
    season: "Fall 2026",
    activeClinic: "2026-10-11",

    title: "Free Junior Wolves Skills Clinic",
    eligibility: "Boys · Grades 3rd–8th",
    cost: "Free to attend",

    location: {
      name: "Niles West High School",
      street: "5701 Oakton St",
      cityStateZip: "Skokie, IL 60077",
      mapsUrl: "https://www.google.com/maps/search/?api=1&query=Niles+West+High+School%2C+5701+Oakton+St%2C+Skokie%2C+IL+60077"
    },

    /* `end` is local Chicago time. A clinic stays open for RSVPs until it ends.

       SESSIONS
         From October onward a clinic runs two grade-split sessions so group
         sizes stay small enough to coach properly. `sessions` is the source of
         truth for who goes when; `time` is only the whole-clinic window shown
         where a single span is wanted. A clinic with no `sessions` key is a
         single undivided session (September 27 was).

         The split is always 3rd-6th first, 7th-8th second. 6th grade belongs
         to the YOUNGER session and 7th grade to the OLDER one - that boundary
         is the thing most easily got wrong, so it is asserted in the tests.

       ENTRANCE
         `entrance` is which door families should use, and it stays null until
         somebody has actually confirmed it for that specific date. The
         logistics and event-day emails print it only when it is set, and the
         renderers refuse to invent one. On 2026-09-27 an unverified "Door 44"
         nearly shipped to every attending family; a null here is the fix. */
    clinics: [
      { id: "2026-09-27", weekday: "Sunday", date: "September 27", ordinal: "September 27th", short: "Sun, Sept 27", time: "3:00–5:00 PM",   end: "17:00", year: 2026, entrance: null },
      { id: "2026-10-11", weekday: "Sunday", date: "October 11",   ordinal: "October 11th",   short: "Sun, Oct 11",  time: "11:00 AM–2:00 PM", end: "14:00", year: 2026, entrance: null,
        sessions: [
          { id: "younger", label: "3rd–6th Grade", grades: ["3rd", "4th", "5th", "6th"], time: "11:00 AM–12:30 PM", start: "11:00", end: "12:30" },
          { id: "older",   label: "7th–8th Grade", grades: ["7th", "8th"],               time: "12:30–2:00 PM",     start: "12:30", end: "14:00" }
        ] },
      { id: "2026-10-25", weekday: "Sunday", date: "October 25",   ordinal: "October 25th",   short: "Sun, Oct 25",  time: "3:00–6:00 PM",   end: "18:00", year: 2026, entrance: null,
        sessions: [
          { id: "younger", label: "3rd–6th Grade", grades: ["3rd", "4th", "5th", "6th"], time: "3:00–4:30 PM", start: "15:00", end: "16:30" },
          { id: "older",   label: "7th–8th Grade", grades: ["7th", "8th"],               time: "4:30–6:00 PM", start: "16:30", end: "18:00" }
        ] }
    ],

    grades: ["3rd", "4th", "5th", "6th", "7th", "8th"],
    ages: [7, 8, 9, 10, 11, 12, 13, 14, 15]
  };


  /* The one place that decides which session a grade belongs to. Every caller -
     the RSVP form, the confirmation email, the dashboards, the check-in sheets -
     must go through this rather than re-deriving the boundary. Returns null for
     a clinic that has no split. */
  JW_CLINICS.clinicById = function (id) {
    for (var i = 0; i < JW_CLINICS.clinics.length; i++) {
      if (JW_CLINICS.clinics[i].id === id) return JW_CLINICS.clinics[i];
    }
    return null;
  };

  JW_CLINICS.sessionFor = function (clinicId, grade) {
    var c = JW_CLINICS.clinicById(clinicId);
    if (!c || !c.sessions) return null;
    var g = String(grade == null ? "" : grade).trim().toLowerCase();
    for (var i = 0; i < c.sessions.length; i++) {
      var s = c.sessions[i];
      for (var j = 0; j < s.grades.length; j++) {
        if (s.grades[j].toLowerCase() === g) return s;
      }
    }
    return null;
  };

  /* Human string for one athlete, e.g.
     "Sunday, October 11 · 3rd–6th Grade · 11:00 AM–12:30 PM" */
  JW_CLINICS.sessionLine = function (clinicId, grade) {
    var c = JW_CLINICS.clinicById(clinicId);
    if (!c) return "";
    var s = JW_CLINICS.sessionFor(clinicId, grade);
    var head = c.weekday + ", " + c.date;
    return s ? head + " · " + s.label + " · " + s.time : head + " · " + c.time;
  };

  /* The next clinic that has not finished yet, in Chicago time - the one an
     RSVP CTA should point at. `asOf` is "YYYY-MM-DD HH:MM" and is supplied by
     the caller so the server and the page can agree; omit it and the local
     clock is used. Returns null when the season is over, and every caller must
     handle that rather than assuming a clinic exists. */
  JW_CLINICS.nextClinic = function (asOf) {
    var now = asOf || (function () {
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
    })();
    var upcoming = JW_CLINICS.clinics.filter(function (c) { return c.id + " " + c.end > now; });
    upcoming.sort(function (a, b) { return a.id < b.id ? -1 : 1; });
    return upcoming.length ? upcoming[0] : null;
  };

  /* "Sunday, October 11, 2026" - one spelling, everywhere. */
  JW_CLINICS.longDate = function (clinicId) {
    var c = JW_CLINICS.clinicById(clinicId);
    if (!c) return "";
    return c.weekday + ", " + c.date + (c.year ? ", " + c.year : "");
  };

  if (typeof module !== "undefined" && module.exports) module.exports = JW_CLINICS;
  else root.JW_CLINICS = JW_CLINICS;
})(this);
