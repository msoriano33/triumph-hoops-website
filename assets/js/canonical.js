/* ==========================================================================
   TRIUMPH / JUNIOR WOLVES — CANONICAL REGISTRATION DATA  (Phase 2C)
   --------------------------------------------------------------------------
   ONE source of truth for grade, age and school. Read by:

     - every form page        (<script src="/assets/js/canonical.js">)
     - every API endpoint     (require("../assets/js/canonical.js"))
     - Apps Script            (ops/funnel/canonical-config.gs, GENERATED from
                               this file by tools/build-canonical-gs.js -
                               never hand-edited, so it cannot drift)
     - Google Sheets data validation (driven by the same generated file)

   THE BUG THIS EXISTS TO KILL
   ---------------------------
   Options were written as <option>7th grade</option> with no value attribute,
   so the SUBMITTED value was the VISIBLE label. A family reading the page
   through browser translation submitted a translated label. This is not
   theoretical: MASTER REGISTRATIONS holds two real rows reading "7.º grado".

   The rule that prevents it recurring:

       RENDER a label. SUBMIT a code. VALIDATE the code on the server.

   Every option this file produces carries an explicit, ASCII, stable `value`.
   A translation engine rewrites the text node; it does not rewrite the value
   attribute. And even if something did, the server rejects anything that is
   not in this list.

   WHAT IS STORED
   --------------
     grade   "3".."12", "K", "PK"      stable code, never a label
     age     integer                   never a label
     school  code + the family's raw entry, both kept

   Display labels ("7th Grade", "Park View School") are RENDERED from these
   codes at the edges - forms, emails, dashboards. They are never the thing
   that travels or the thing that is stored.

   OTHER SCHOOL IS NEVER GUESSED
   -----------------------------
   When a family picks "Other school" the exact text they type is preserved
   and the code is OTHER. Nothing in this file will silently promote an Other
   entry into a canonical school, and normaliseSchool() does EXACT matching
   against a human-reviewed alias list only - there is no fuzzy matching, no
   edit distance, no "closest" anything. An unrecognised school comes back
   unresolved so a person can decide, which is the entire point.
   ========================================================================== */
(function (root) {
  "use strict";

  var JW_CANON = {
    version: "2026-09-30",

    /* ----------------------------------------------------------------------
       GRADES
       `value` is what is submitted and stored. `label` is what a family sees.
       `sort` orders them; it is not the stored value, because "Kindergarten"
       has no sensible integer and inventing 0 as DATA invites arithmetic on
       it. Numeric grades store the bare integer as a string so that every
       existing reader - including the Apps Script helpers that pull the first
       integer out of the cell - keeps working unchanged.
       ---------------------------------------------------------------------- */
    grades: [
      { value: "PK", label: "Not in school yet", sort: -2 },
      { value: "K",  label: "Kindergarten",      sort: -1 },
      { value: "1",  label: "1st Grade",  sort: 1 },
      { value: "2",  label: "2nd Grade",  sort: 2 },
      { value: "3",  label: "3rd Grade",  sort: 3 },
      { value: "4",  label: "4th Grade",  sort: 4 },
      { value: "5",  label: "5th Grade",  sort: 5 },
      { value: "6",  label: "6th Grade",  sort: 6 },
      { value: "7",  label: "7th Grade",  sort: 7 },
      { value: "8",  label: "8th Grade",  sort: 8 },
      { value: "9",  label: "9th Grade",  sort: 9 },
      { value: "10", label: "10th Grade", sort: 10 },
      { value: "11", label: "11th Grade", sort: 11 },
      { value: "12", label: "12th Grade", sort: 12 }
    ],

    /* ----------------------------------------------------------------------
       SCHOOLS
       `nwSender`, `littleNine` and `feedsInto` are THREE DIFFERENT THINGS and
       are stored separately on purpose:

         nwSender    this school sends its graduates to Niles West High School
         littleNine  this school plays in the Little Nine conference
         feedsInto   the middle school this elementary school feeds

       They overlap and are routinely confused. Old Orchard, McCracken, East
       Prairie and Golf are Little Nine but feed Niles NORTH, so they are not
       Niles West senders and are deliberately absent from this list - see the
       note at the bottom. Rutledge Hall and Thomas Edison are neither: they
       are the 3-5 elementary partners that feed Lincoln Hall and Lincoln JH.

       Lawler Park is NOT here. It is a Skokie Park District park (now Mike
       Reid Park) that appears on Little Nine schedules as a venue.
       ---------------------------------------------------------------------- */
    schools: [
      { code: "LINCOLN_JH", label: "Lincoln Junior High School",
        district: "Skokie/Morton Grove SD69", gradeLow: "6", gradeHigh: "8",
        nwSender: true, littleNine: true, feedsInto: null },

      { code: "FAIRVIEW_SOUTH", label: "Fairview South School",
        district: "Fairview SD72", gradeLow: "PK", gradeHigh: "8",
        nwSender: true, littleNine: true, feedsInto: null },

      { code: "RUTLEDGE_HALL", label: "Rutledge Hall",
        district: "Lincolnwood SD74", gradeLow: "3", gradeHigh: "5",
        nwSender: false, littleNine: false, feedsInto: "LINCOLN_HALL" },

      { code: "THOMAS_EDISON", label: "Thomas Edison Elementary School",
        district: "Skokie/Morton Grove SD69", gradeLow: "3", gradeHigh: "5",
        nwSender: false, littleNine: false, feedsInto: "LINCOLN_JH" },

      { code: "PARK_VIEW", label: "Park View School",
        district: "Morton Grove SD70", gradeLow: "K", gradeHigh: "8",
        nwSender: true, littleNine: true, feedsInto: null },

      { code: "LINCOLN_HALL", label: "Lincoln Hall",
        district: "Lincolnwood SD74", gradeLow: "6", gradeHigh: "8",
        nwSender: true, littleNine: true, feedsInto: null },

      { code: "CULVER", label: "Clarence E. Culver School",
        district: "Niles ESD 71", gradeLow: "PK", gradeHigh: "8",
        nwSender: true, littleNine: true, feedsInto: null },

      { code: "MCC_ACADEMY", label: "MCC Academy",
        district: "Private, Morton Grove", gradeLow: null, gradeHigh: null,
        nwSender: false, littleNine: false, feedsInto: null },

      { code: "ST_JOHN_BREBEUF", label: "St. John Brebeuf School",
        district: "Parochial, Niles", gradeLow: null, gradeHigh: null,
        nwSender: false, littleNine: false, feedsInto: null },

      { code: "POPE_JOHN_XXIII", label: "Pope John XXIII School",
        district: "Parochial", gradeLow: null, gradeHigh: null,
        nwSender: false, littleNine: false, feedsInto: null },

      { code: "HILLEL_TORAH", label: "Hillel Torah North Suburban Day School",
        district: "Private, Skokie", gradeLow: null, gradeHigh: null,
        nwSender: false, littleNine: false, feedsInto: null },

      { code: "SABIN_MAGNET", label: "Sabin Magnet School",
        district: "CPS", gradeLow: null, gradeHigh: null,
        nwSender: false, littleNine: false, feedsInto: null },

      { code: "DECATUR_CLASSICAL", label: "Decatur Classical School",
        district: "CPS", gradeLow: null, gradeHigh: null,
        nwSender: false, littleNine: false, feedsInto: null },

      /* Always last, always present. Selecting it reveals a REQUIRED text
         field, and whatever the family types is preserved verbatim. */
      { code: "OTHER", label: "Other school",
        district: null, gradeLow: null, gradeHigh: null,
        nwSender: false, littleNine: false, feedsInto: null, isOther: true }
    ],

    /* ----------------------------------------------------------------------
       HISTORICAL SPELLINGS -> CODE
       Every entry here was read and approved during the school audit. This is
       a lookup table of decisions a human already made, NOT a matching
       algorithm. Matching is exact after case/punctuation/whitespace folding.
       A spelling that is not in this table stays unresolved.
       ---------------------------------------------------------------------- */
    schoolAliases: {
      LINCOLN_JH: [
        "Lincoln Junior High", "Lincoln Jr High", "Lincoln Jr", "Lincoln Jr. High",
        "Lincoln", "Lincoln jr high school", "Lincoln jr. high", "Lincoln Jr High School",
        "Lincoln Junior High School", "LINCOLN Jr", "Lincoln junior high school",
        "Lincoln junior high"
      ],
      FAIRVIEW_SOUTH: [
        "Fairview South", "Fairview", "Fairview south",
        "Fairview South Elementary School", "fairview south"
      ],
      RUTLEDGE_HALL: [
        "Rutledge Hall", "Lincolnwood Rutledge Hall", "Rutledge hall",
        "Rutledge Hall / Lincolnwood", "Rutledge school", "Rutledge"
      ],
      THOMAS_EDISON: [
        "Edison", "Edison elementary", "Thomas edison", "Thomas Edison",
        "Thomas Edison Elementary", "Edison Elementary School",
        "Edision elementary school", "Edison Elementary",
        "Thomas edison elementary", "Edison elementary School", "Thomas Edison school"
      ],
      PARK_VIEW: [
        "Park view", "Parkview", "Park View", "Park View Morton Grove",
        "Park View School", "Park View Elementary School", "Park View Elementary", "Parkview School",
        "Parkview elementary"
      ],
      LINCOLN_HALL: [
        "Lincoln Hall", "Lincoln Hall middle school", "Lincolnhall Middle School",
        "Lincoln Hall Middle School"
      ],
      CULVER: ["Culver", "Culver school", "Clarence E Culver", "Clarence E. Culver School"],
      MCC_ACADEMY: ["MCC Academy", "MCC ACADEMY"],
      ST_JOHN_BREBEUF: ["St. John Brebeuf School", "St John Brebeuf"],
      POPE_JOHN_XXIII: ["Pope John XXIII School", "Pope John 23"],
      HILLEL_TORAH: ["Hillel Torah North Suburban Day School", "Hillel Torah"],
      SABIN_MAGNET: ["Sabin Magnet School", "Sabin Magnet", "Sabin"],
      DECATUR_CLASSICAL: ["Decatur Classical School", "Decatur Classical"]
    },

    /* ----------------------------------------------------------------------
       PROGRAMS
       A program declares which subset of the canonical lists it accepts and
       which fields it collects at all. Triumph runs athletes far outside the
       Junior Wolves band; applying the Junior Wolves 3-8 / 7-15 limits to a
       Triumph training enquiry would reject real families. Different subsets,
       ONE list.
       ---------------------------------------------------------------------- */
    /* ----------------------------------------------------------------------
       CHOICE FIELDS: EXPERIENCE AND INTEREST
       ----------------------------------------------------------------------
       The same defect as grade, in the last two fields that still had it.
       Both were rendered as <option>Park district / rec league</option> with
       no value attribute, so the submitted value WAS the visible label, and a
       family reading the page through browser translation submitted the
       translated label.

       This is not hypothetical here either. MASTER REGISTRATIONS holds two
       rows reading "Principiante en el baloncesto organizado" - the same
       family whose grade arrived as "7.º grado". One interest submission, one
       tryout registration. The earlier audit checked the sizing fields, found
       them clean, and did not check this one.

       WHAT IS STORED, AND WHY IT IS THE LABEL RATHER THAN THE CODE.
       Grade and school store codes because the audience builder, the session
       split and the canonical athlete layer all key on them. Nothing keys on
       experience or interest - they are read by a human in a sheet or an
       email. So the wire carries the CODE, the server validates the CODE, and
       the server then writes the canonical LABEL it looked up itself.

       That closes the translation hole just as completely, because the server
       never stores browser text either way, and it keeps the column readable
       and identical in shape to the 233 rows already there. Storing codes
       would have meant a mixed column and a migration for no operational
       gain.
       ---------------------------------------------------------------------- */
    experienceOptions: [
      { value: "NEW_TO_BASKETBALL", label: "New to basketball" },
      { value: "NEW_TO_ORGANIZED",  label: "New to organized basketball" },
      { value: "REC_LEAGUE",        label: "Park district / rec league" },
      { value: "SOME_TRAINING",     label: "Some skills training" },
      { value: "SCHOOL_TEAM",       label: "School team" },
      { value: "SCHOOL_TEAM_EXP",   label: "School team experience" },
      { value: "FEEDER_OR_TRAVEL",  label: "Previous feeder or travel team" },
      { value: "TRAVEL_AAU",        label: "Travel or AAU experience" }
    ],

    interestOptions: [
      { value: "WEEKLY_TRAINING",  label: "Weekly skills training" },
      { value: "SUNDAY_TRAINING",  label: "Sunday development training" },
      { value: "DEVELOPMENT_TEAM", label: "Development team" },
      { value: "AAU_TRAVEL",       label: "AAU / travel team" },
      { value: "NOT_SURE",         label: "Not sure — help me find the right fit" }
    ],

    /* Which options each PAGE offers. Two Triumph pages sit in the same
       program and offer different interest lists - training.html does not
       offer a team, teams.html does not offer weekly training - so the
       rendered subset belongs to the form, not to the program.

       The program's ALLOWED set is then computed as the union of its forms'
       subsets rather than written out again, because a second hand-kept list
       is exactly the thing this phase exists to remove. */
    formOptions: {
      junior_wolves_tryout: {
        experience: ["NEW_TO_ORGANIZED", "REC_LEAGUE", "SCHOOL_TEAM", "FEEDER_OR_TRAVEL", "TRAVEL_AAU"]
      },
      junior_wolves_interest: {
        experience: ["NEW_TO_ORGANIZED", "REC_LEAGUE", "SCHOOL_TEAM", "FEEDER_OR_TRAVEL", "TRAVEL_AAU"]
      },
      homepage_get_started: {
        experience: ["NEW_TO_BASKETBALL", "REC_LEAGUE", "SOME_TRAINING", "SCHOOL_TEAM_EXP", "TRAVEL_AAU"],
        interest: ["WEEKLY_TRAINING", "SUNDAY_TRAINING", "DEVELOPMENT_TEAM", "AAU_TRAVEL", "NOT_SURE"]
      },
      weekly_training: {
        experience: ["NEW_TO_BASKETBALL", "REC_LEAGUE", "SOME_TRAINING", "SCHOOL_TEAM_EXP", "TRAVEL_AAU"],
        interest: ["WEEKLY_TRAINING", "SUNDAY_TRAINING", "NOT_SURE"]
      },
      development_team_interest: {
        experience: ["NEW_TO_BASKETBALL", "REC_LEAGUE", "SOME_TRAINING", "SCHOOL_TEAM_EXP", "TRAVEL_AAU"],
        interest: ["DEVELOPMENT_TEAM", "AAU_TRAVEL", "NOT_SURE"]
      }
    },

    programs: {
      junior_wolves: {
        label: "Junior Wolves",
        grades: ["3", "4", "5", "6", "7", "8"],
        ageMin: 7, ageMax: 15,
        collectsSchool: true, schoolRequired: true
      },
      triumph: {
        label: "Triumph Hoops Academy",
        grades: ["PK", "K", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"],
        ageMin: 4, ageMax: 19,
        collectsSchool: false, schoolRequired: false
      },
      triumph_teams: {
        label: "Triumph Teams",
        grades: ["2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"],
        ageMin: 6, ageMax: 19,
        collectsSchool: false, schoolRequired: false
      }
    },

    /* Which program each live form source belongs to. An endpoint looks the
       source up here rather than hard-coding limits, so a new form inherits
       the rules instead of inventing its own. */
    sourceProgram: {
      junior_wolves_tryout: "junior_wolves",
      junior_wolves_interest: "junior_wolves",
      clinic_rsvp: "junior_wolves",
      homepage_get_started: "triumph",
      weekly_training: "triumph",
      sunday_training: "triumph",
      development_team_interest: "triumph_teams",
      aau_travel_interest: "triumph_teams",
      general_contact: "triumph",
      coaching_interest: "triumph"
    }
  };

  /* ======================================================================
     HELPERS
     ====================================================================== */

  function fold(s) {
    return String(s == null ? "" : s)
      .toLowerCase()
      .replace(/[.,/#!$%^&*;:{}=\-_`~()'"]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  JW_CANON.fold = fold;

  JW_CANON.program = function (name) {
    return JW_CANON.programs[name] || null;
  };

  JW_CANON.programForSource = function (source) {
    var p = JW_CANON.sourceProgram[source];
    return p ? JW_CANON.programs[p] : null;
  };

  /* ---------------------- GRADE ---------------------- */

  JW_CANON.gradeByValue = function (v) {
    var s = String(v == null ? "" : v).trim();
    for (var i = 0; i < JW_CANON.grades.length; i++) {
      if (JW_CANON.grades[i].value === s) return JW_CANON.grades[i];
    }
    return null;
  };

  JW_CANON.gradeLabel = function (v) {
    var g = JW_CANON.gradeByValue(v);
    return g ? g.label : "";
  };

  /* Grades a program allows, in display order. */
  JW_CANON.gradesFor = function (programName) {
    var p = JW_CANON.program(programName);
    var allow = p ? p.grades : null;
    return JW_CANON.grades.filter(function (g) {
      return !allow || allow.indexOf(g.value) !== -1;
    });
  };

  JW_CANON.agesFor = function (programName) {
    var p = JW_CANON.program(programName);
    if (!p) return [];
    var out = [];
    for (var a = p.ageMin; a <= p.ageMax; a++) out.push(a);
    return out;
  };

  /* Is this a grade this program accepts? The ONLY question the server asks.
     A label ("7th Grade", "7.º grado") is not a value and fails here, which
     is exactly the behaviour that makes the translation bug unrepeatable. */
  JW_CANON.gradeAllowed = function (programName, v) {
    var p = JW_CANON.program(programName);
    if (!p) return false;
    return p.grades.indexOf(String(v == null ? "" : v).trim()) !== -1;
  };

  JW_CANON.ageAllowed = function (programName, v) {
    var p = JW_CANON.program(programName);
    if (!p) return false;
    var s = String(v == null ? "" : v).trim();
    if (!/^\d{1,2}$/.test(s)) return false;     /* "12 years old" is not an age */
    var n = Number(s);
    return n >= p.ageMin && n <= p.ageMax;
  };

  /* Read a grade out of a HISTORICAL cell that predates this system, e.g.
     "7th grade", "7th", "7.º grado", 7. Used ONLY for reading old data, never
     to rescue a bad submission - a live submission must already be canonical.
     Returns "" when nothing can be read, and never guesses. */
  JW_CANON.normaliseGrade = function (raw) {
    var s = String(raw == null ? "" : raw).trim();
    if (!s) return "";
    if (JW_CANON.gradeByValue(s)) return s;
    var f = fold(s);
    if (/^(pk|pre k|prek|preschool|not in school yet|not in school)$/.test(f)) return "PK";
    if (/^(k|kg|kinder|kindergarten)$/.test(f)) return "K";
    var m = s.match(/(\d{1,2})/);
    if (!m) return "";
    var n = String(parseInt(m[1], 10));
    return JW_CANON.gradeByValue(n) ? n : "";
  };

  /* ---------------------- SCHOOL ---------------------- */

  JW_CANON.schoolByCode = function (code) {
    var s = String(code == null ? "" : code).trim().toUpperCase();
    for (var i = 0; i < JW_CANON.schools.length; i++) {
      if (JW_CANON.schools[i].code === s) return JW_CANON.schools[i];
    }
    return null;
  };

  JW_CANON.schoolLabel = function (code) {
    var s = JW_CANON.schoolByCode(code);
    return s ? s.label : "";
  };

  JW_CANON.schoolCodeValid = function (code) {
    return !!JW_CANON.schoolByCode(code);
  };

  /* Built once: folded spelling -> code. Canonical labels are included so a
     label is always resolvable, which is what makes the dropdown and the
     historical data agree. */
  var ALIAS_INDEX = (function () {
    var idx = {};
    JW_CANON.schools.forEach(function (s) {
      if (s.code !== "OTHER") idx[fold(s.label)] = s.code;
    });
    Object.keys(JW_CANON.schoolAliases).forEach(function (code) {
      JW_CANON.schoolAliases[code].forEach(function (raw) { idx[fold(raw)] = code; });
    });
    return idx;
  })();
  JW_CANON.aliasIndex = ALIAS_INDEX;

  /* EXACT match against the reviewed alias table, after folding case and
     punctuation. Nothing else. No fuzzy matching, by design:

       { code: "PARK_VIEW", confidence: "HIGH", raw: "Parkview" }
       { code: null,        confidence: "NONE", raw: "Clover school" }

     An unresolved value is a decision for a person, not a guess for a
     computer. That is the whole reason this returns null instead of a
     best-effort answer. */
  JW_CANON.normaliseSchool = function (raw) {
    var s = String(raw == null ? "" : raw).trim();
    if (!s) return { code: null, confidence: "NONE", raw: "" };
    var hit = ALIAS_INDEX[fold(s)];
    return hit
      ? { code: hit, confidence: "HIGH", raw: s }
      : { code: null, confidence: "NONE", raw: s };
  };

  /* ---------------------- OPTION RENDERING ----------------------
     The single place that turns config into markup. Every option gets an
     explicit value attribute; that is the fix, and keeping it in one function
     is what stops it being forgotten on the next form somebody adds. */

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  JW_CANON.esc = esc;

  JW_CANON.optionsHtml = function (items, placeholder) {
    var out = placeholder === false ? "" : '<option value="">' + esc(placeholder || "Select") + "</option>";
    for (var i = 0; i < items.length; i++) {
      out += '<option value="' + esc(items[i].value) + '">' + esc(items[i].label) + "</option>";
    }
    return out;
  };

  JW_CANON.gradeOptionsHtml = function (programName, placeholder) {
    return JW_CANON.optionsHtml(JW_CANON.gradesFor(programName), placeholder);
  };

  JW_CANON.ageOptionsHtml = function (programName, placeholder) {
    return JW_CANON.optionsHtml(
      JW_CANON.agesFor(programName).map(function (a) {
        return { value: String(a), label: String(a) };
      }), placeholder);
  };

  /* Canonical schools A-Z, with "Other school" pinned last so it reads as the
     escape hatch rather than one more option in the alphabet. */
  JW_CANON.schoolOptionsHtml = function (placeholder) {
    var named = JW_CANON.schools.filter(function (s) { return !s.isOther; })
      .slice().sort(function (a, b) { return a.label < b.label ? -1 : 1; });
    var other = JW_CANON.schools.filter(function (s) { return !!s.isOther; });
    return JW_CANON.optionsHtml(named.concat(other).map(function (s) {
      return { value: s.code, label: s.label };
    }), placeholder);
  };

  /* ---------------------- SUBMISSION VALIDATION ----------------------
     Server-side authority. Returns [] when the submission is acceptable.
     `fields` uses canonical names; callers map their own form names onto
     these so there is one validator rather than one per endpoint. */
  JW_CANON.validateSubmission = function (programName, fields, opts) {
    var errors = [];
    var p = JW_CANON.program(programName);
    var o = opts || {};
    if (!p) { errors.push("Unknown program."); return errors; }

    if (o.requireGrade || (fields.grade !== undefined && fields.grade !== "")) {
      if (!JW_CANON.gradeAllowed(programName, fields.grade)) {
        errors.push("Please choose a grade from the list.");
      }
    }

    if (o.requireAge || (fields.age !== undefined && fields.age !== "")) {
      if (!JW_CANON.ageAllowed(programName, fields.age)) {
        errors.push("Please choose an age from the list.");
      }
    }

    ["experience", "interest"].forEach(function (kind) {
      var v = fields[kind];
      if (v === undefined || v === null || String(v).trim() === "") return;
      if (!JW_CANON.choiceAllowed(kind, programName, v)) {
        errors.push(kind === "interest"
          ? "Please choose an option from the list."
          : "Please choose a basketball experience level from the list.");
      }
    });

    if (p.collectsSchool) {
      var code = String(fields.school_code == null ? "" : fields.school_code).trim().toUpperCase();
      if (!code) {
        if (p.schoolRequired || o.requireSchool) errors.push("Please choose a school from the list.");
      } else if (!JW_CANON.schoolCodeValid(code)) {
        errors.push("Please choose a school from the list.");
      } else if (code === "OTHER" && !String(fields.school_other || "").trim()) {
        errors.push("Please type the school name.");
      }
    }

    return errors;
  };

  /* ---------------------- CHOICE FIELDS ---------------------- */

  function choiceList(kind) {
    return kind === "interest" ? JW_CANON.interestOptions : JW_CANON.experienceOptions;
  }

  JW_CANON.choiceByValue = function (kind, v) {
    var code = String(v == null ? "" : v).trim();
    var list = choiceList(kind);
    for (var i = 0; i < list.length; i++) if (list[i].value === code) return list[i];
    return null;
  };

  /* A page cached before this change still posts the visible English label.
     Accepting the EXACT canonical label - and nothing else - keeps that
     family's submission working without reopening the hole, because a
     translated label is not one of these strings. This is the adapter, and
     it is deliberately this narrow. */
  JW_CANON.choiceByLabel = function (kind, v) {
    var want = fold(v);
    if (!want) return null;
    var list = choiceList(kind);
    for (var i = 0; i < list.length; i++) if (fold(list[i].label) === want) return list[i];
    return null;
  };

  /* Codes a given form renders. */
  JW_CANON.choicesForSource = function (kind, source) {
    var f = JW_CANON.formOptions[source];
    var codes = f && f[kind] ? f[kind] : null;
    if (!codes) return [];
    return codes.map(function (c) { return JW_CANON.choiceByValue(kind, c); })
                .filter(function (x) { return !!x; });
  };

  /* Codes a PROGRAM accepts: the union of every form that belongs to it.
     Computed, never written down twice. */
  JW_CANON.choicesForProgram = function (kind, programName) {
    var seen = {}, out = [];
    Object.keys(JW_CANON.formOptions).forEach(function (source) {
      if (JW_CANON.sourceProgram[source] !== programName) return;
      (JW_CANON.formOptions[source][kind] || []).forEach(function (code) {
        if (seen[code]) return;
        seen[code] = true;
        var item = JW_CANON.choiceByValue(kind, code);
        if (item) out.push(item);
      });
    });
    return out;
  };

  JW_CANON.choiceAllowed = function (kind, programName, v) {
    var item = JW_CANON.choiceByValue(kind, v) || JW_CANON.choiceByLabel(kind, v);
    if (!item) return false;
    var allowed = JW_CANON.choicesForProgram(kind, programName);
    for (var i = 0; i < allowed.length; i++) if (allowed[i].value === item.value) return true;
    return false;
  };

  /* What gets written: the canonical label, resolved here from the code the
     browser sent. Never the browser's own text. */
  JW_CANON.choiceForStorage = function (kind, v) {
    var item = JW_CANON.choiceByValue(kind, v) || JW_CANON.choiceByLabel(kind, v);
    return item ? { code: item.value, display: item.label } : { code: "", display: "" };
  };

  JW_CANON.choiceOptionsHtml = function (kind, source, placeholder) {
    return JW_CANON.optionsHtml(JW_CANON.choicesForSource(kind, source), placeholder);
  };

  /* What actually gets written for the School column, given a validated
     submission. A canonical pick stores its display label; an Other pick
     stores the family's exact words. Both keep school_code alongside, so an
     Other entry that happens to spell a canonical school is still an Other
     entry until a person says otherwise. */
  JW_CANON.schoolForStorage = function (code, other) {
    var c = String(code == null ? "" : code).trim().toUpperCase();
    if (c === "OTHER") return { code: "OTHER", display: String(other || "").trim() };
    var s = JW_CANON.schoolByCode(c);
    return s ? { code: s.code, display: s.label } : { code: "", display: "" };
  };

  /* ----------------------------------------------------------------------
     DELIBERATELY ABSENT: Old Orchard Junior High, Oliver McCracken Middle,
     East Prairie School, Golf Middle School. All four are Little Nine, and
     all four feed Niles NORTH. Junior Wolves is the Niles West pipeline;
     listing them would imply an eligibility we do not mean. "Other school"
     already catches any family they belong to, and an Other entry gets
     looked at by a person - which is the outcome we want for an edge case
     like that anyway.
     ---------------------------------------------------------------------- */

  if (typeof module !== "undefined" && module.exports) module.exports = JW_CANON;
  else root.JW_CANON = JW_CANON;
})(this);
