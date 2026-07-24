/* ==========================================================================
   TRIUMPH HOOPS ACADEMY — SITE DATA
   --------------------------------------------------------------------------
   THIS IS THE FILE TO EDIT FOR MOST ROUTINE UPDATES.

   Everything in here is either (a) contact information, (b) something that
   changes season to season, or (c) something that is still TBD. Change a
   value once here and it updates everywhere it appears on the site.

   Anything wrapped in [SQUARE BRACKETS] is a placeholder waiting on real
   information. See PLACEHOLDERS.md for the full list.

   Longer prose (philosophy, program descriptions, FAQ answers) lives directly
   in the HTML so search engines can read it. Each editable block there is
   marked with a comment that starts with:  EDIT:
   ========================================================================== */

window.TRIUMPH_DATA = {
  /* ---------------------------------------------------------------------
     SITE
     --------------------------------------------------------------------- */
  siteConfig: {
    name: "Triumph Hoops Academy",
    domain: "https://triumphhoopsacademy.com",
    established: 2023,
    startedYear: 2022
  },

  /* ---------------------------------------------------------------------
     CONTACT — appears in the footer, contact CTAs and form fallbacks.
     --------------------------------------------------------------------- */
  contactInfo: {
    email: "triumphhoopsacademy@gmail.com",

    /* Coach Oli is the primary parent-facing contact.
       Replace both values below when the public number is confirmed.
       phoneDisplay = what parents see.  phoneHref = digits only, +1 prefix. */
    phoneDisplay: "(847) 830-9454",
    phoneHref: "+18478309454", // e.g. "+13125550123" — leave empty until confirmed
    phoneContactName: "Coach Oli",

    /* Social links. Leave a value empty ("") and the link is hidden. */
    instagram: "https://www.instagram.com/triumphhoopsacademy" // e.g. "https://www.instagram.com/yourhandle"
  },

  /* ---------------------------------------------------------------------
     FORM DELIVERY
     endpoint = the serverless function that emails submissions.
     Every form on the site posts here. See SETUP.md before launch.
     --------------------------------------------------------------------- */
  forms: {
    endpoint: "/api/inquiry",

    /* Source tags. These travel with every submission so you always know
       which page and which button produced the lead. */
    sources: [
      "homepage_get_started",
      "weekly_training",
      "sunday_training",
      "development_team_interest",
      "aau_travel_interest",
      "junior_wolves_tryout",
      "coaching_interest",
      "general_contact"
    ]
  },

  /* ---------------------------------------------------------------------
     TRAINING — current opportunities.
     The Training page's evergreen copy does not depend on any of this, so
     you can change times, coaches and levels freely without rewriting the
     page. Set a session's "status" to "Full" or "Paused" to flag it.
     --------------------------------------------------------------------- */
  trainingSchedule: {
    sundayNote: "Sunday sessions run on a rolling basis. Session times and levels are reviewed seasonally.",
    sunday: [
      {
        time: "11:00 AM",
        title: "Early Foundations",
        who: "Approx. age 5+",
        detail: "Lower rims. Built for brand-new players.",
        coach: "",
        status: ""
      },
      {
        time: "12:00 PM",
        title: "Fundamentals",
        who: "Approx. grades 2–5",
        detail: "10-foot hoops. Some prior training or rec league experience.",
        coach: "Coach Marc Acoba",
        status: ""
      },
      {
        time: "1:00 PM",
        title: "Fundamentals + Game Development",
        who: "Beginner / intermediate hybrid",
        detail: "Faster pace. Built for older beginners and players ready for more.",
        coach: "Coach Marc Acoba",
        status: ""
      }
    ],
    weeklyNote: "Weekly skills training runs throughout the year. Days, times and locations rotate by season and by group.",
    weeklyLead: "Coach Oli currently leads many weekly sessions."
  },

  /* ---------------------------------------------------------------------
     LOCATIONS — add addresses as they are confirmed.
     Leave "address" empty and the site shows the gym name only.
     --------------------------------------------------------------------- */
  locations: [
    { name: "St. Hilary", area: "Chicago — North Side", address: "5615 N California Ave, Chicago, IL 60659" },
    { name: "St. Paul", area: "Skokie", address: "5201 Galitz St, Skokie, IL 60077 (Entrance on Galitz)" },
    { name: "St. Matthias", area: "Chicago — North Side", address: "4918 N Claremont Ave, Chicago, IL 60625" }
  ],

  /* ---------------------------------------------------------------------
     STAFF — add a coach by copying a block. Photos go in /assets/img/.
     Leave "bio" empty until real bio copy is supplied; nothing is invented.
     --------------------------------------------------------------------- */
  staff: [
    { name: "Coach Marlowe Soriano", role: "Co-Founder / Coach", photo: "", bio: "" },
    { name: "Coach Oli Santos", role: "Co-Founder / Coach", photo: "", bio: "" },
    { name: "Coach Marc Acoba", role: "Coach", photo: "", bio: "" },
    { name: "Coach Gino Villanueva", role: "Coach", photo: "", bio: "" }
  ],

  /* ---------------------------------------------------------------------
     NILES WEST JUNIOR WOLVES — season details.
     Anything left as "TBA" renders as a clean "To be announced" chip.
     --------------------------------------------------------------------- */
  juniorWolvesSeason: {
    league: "CFL",
    grades: "3rd–8th grade boys",
    tryoutDates: "Week of October 12",
    tryoutLocation: "Niles West High School",
    seasonDates: "TBA",
    practiceDays: "TBA",
    practiceTimes: "TBA",
    practiceLocations: "TBA",
    gameWindows: "Weekends",
    scheduleNote:
      "The CFL schedule is released in phases. The first portion covers approximately December; the second half is typically provided around winter break.",
    uniforms: "Included in the program fee. Distributed before the first game."
  },

  juniorWolvesFees: {
    status: "TBA", // change to "Published" once fees are final
    amount: "TBA",
    includes: "TBA",
    paymentDue: "TBA",
    note: "Fees are finalized before tryouts and shared in writing with every family. Payment is only collected after a player has been placed."
  }
};
