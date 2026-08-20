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
      "junior_wolves_interest",
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
     NILES WEST JUNIOR WOLVES — 2026-27 FALL CAMPAIGN
     ---------------------------------------------------------------------
     THIS IS THE BLOCK TO EDIT WHEN A LINK GOES LIVE.

     The Fall dates themselves live in junior-wolves.html (they are page copy
     and search engines need to read them). What lives here is STATE: whether
     a link exists yet, and where it points. Every "COMING SOON" state on the
     page is produced by an empty string below — fill it in and the button
     turns into a real link with no other edit anywhere.
     --------------------------------------------------------------------- */
  juniorWolvesFall: {
    seasonLabel: "2026–27 Junior Wolves",

    /* --- OFFICIAL ASSETS ----------------------------------------------
       Drop the real files in /assets/img/ and point at them here. Both are
       intentionally empty: no AI-generated stand-in is used for the Junior
       Wolves logo, and the hero runs type-only until a real photo exists. */
    logo: "",            // e.g. "assets/img/junior-wolves-logo.png"
    heroImage: "",       // e.g. "assets/img/jw-hero.jpg"  (portrait, ~4:5)
    heroImageAlt: "Niles West Junior Wolves player driving to the basket",

    /* --- VIRTUAL TOWN HALL + MEET THE COACHES -------------------------- */
    townHall: {
      /* Paste the Zoom / Meet / Teams URL here when it exists.
         Empty string = the page shows a "Link coming soon" state. */
      url: "",
      /* Optional: a dial-in or passcode note shown under the button. */
      note: ""
    },

    /* --- TRYOUT REGISTRATION ------------------------------------------- */
    tryoutRegistration: {
      /* "scheduled" = not open yet; the page shows "Opens Monday, September 8"
                       and the form below collects the interest list.
         "open"      = registration is live; the page flips to
                       "Register for tryouts" and the form submits as a
                       tryout registration.
         Change this ONE word on September 8. */
      status: "scheduled",

      /* Optional external registration URL (e.g. a league or payment
         platform). Leave empty to keep using the form on this page. */
      url: ""
    },

    /* --- FALL OPEN SKILLS CLINICS -------------------------------------- */
    clinics: {
      /* Empty = clinics are walk-in / no separate signup, and the page points
         families at the Junior Wolves list instead. Add a URL to turn the
         clinic buttons into real registration links. */
      url: ""
    }
  },

  /* ---------------------------------------------------------------------
     NILES WEST JUNIOR WOLVES — season details.
     Anything left as "TBA" renders as a clean "To be announced" chip.
     --------------------------------------------------------------------- */
  juniorWolvesSeason: {
    league: "CFL",
    grades: "3rd–8th grade boys",
    tryoutDates: "Week of October 26 — exact grade-level dates TBA",
    tryoutLocation: "Niles West High School",
    seasonDates: "Practices begin approximately November 2; league games begin approximately December 5",
    practiceDays: "Approximately 2x per week — Monday/Wednesday or Tuesday/Thursday depending on the team",
    practiceTimes: "Approximately 6:00–8:00 PM",
    practiceLocations: "TBA",
    gameWindows: "Primarily Saturday and Sunday",
    scheduleNote:
      "Tryout, practice and game details are confirmed and posted here as they are locked in. Exact team schedules vary — not every team receives an identical schedule. The CFL schedule is released in phases: the first portion covers approximately December, and the second half is typically provided around winter break.",
    uniforms: "Included in the program fee. Distributed before the first game."
  },

  juniorWolvesFees: {
    status: "TBA", // change to "Published" once fees are final
    amount: "TBA",
    includes: "TBA",
    paymentDue: "TBA",
    note: "2026–27 program fees are finalized before tryouts and shared in writing with every family. Payment is only collected after a player has been placed."
  }
};
