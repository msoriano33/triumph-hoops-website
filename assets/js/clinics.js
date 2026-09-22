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
    activeClinic: "2026-09-27",

    title: "Free Junior Wolves Skills Clinic",
    eligibility: "Boys · Grades 3rd–8th",
    cost: "Free to attend",

    location: {
      name: "Niles West High School",
      street: "5701 Oakton St",
      cityStateZip: "Skokie, IL 60077",
      mapsUrl: "https://www.google.com/maps/search/?api=1&query=Niles+West+High+School%2C+5701+Oakton+St%2C+Skokie%2C+IL+60077"
    },

    /* `end` is local Chicago time. A clinic stays open for RSVPs until it ends. */
    clinics: [
      { id: "2026-09-27", weekday: "Sunday", date: "September 27", ordinal: "September 27th", short: "Sun, Sept 27", time: "3:00–5:00 PM",  end: "17:00" },
      { id: "2026-10-11", weekday: "Sunday", date: "October 11",   ordinal: "October 11th",   short: "Sun, Oct 11",  time: "12:00–2:00 PM", end: "14:00" },
      { id: "2026-10-25", weekday: "Sunday", date: "October 25",   ordinal: "October 25th",   short: "Sun, Oct 25",  time: "3:00–5:00 PM",  end: "17:00" }
    ],

    grades: ["3rd", "4th", "5th", "6th", "7th", "8th"],
    ages: [7, 8, 9, 10, 11, 12, 13, 14, 15]
  };

  if (typeof module !== "undefined" && module.exports) module.exports = JW_CLINICS;
  else root.JW_CLINICS = JW_CLINICS;
})(this);
