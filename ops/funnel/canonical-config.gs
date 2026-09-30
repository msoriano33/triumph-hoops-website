/* ==========================================================================
   GENERATED FILE - DO NOT EDIT
   --------------------------------------------------------------------------
   Source:    assets/js/canonical.js
   Generator: tools/build-canonical-gs.js

   Edit the SOURCE and regenerate. An edit made here is lost on the next
   build, and worse, it makes Apps Script disagree with the forms and the
   API about what a valid grade or school is - which is the exact failure
   this file exists to prevent.

   Defines the global JW_CANON for every other .gs file in this project.
   ========================================================================== */


(function (root) {
  "use strict";

  var JW_CANON = {
    version: "2026-09-30",

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

      { code: "OTHER", label: "Other school",
        district: null, gradeLow: null, gradeHigh: null,
        nwSender: false, littleNine: false, feedsInto: null, isOther: true }
    ],

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

  JW_CANON.gradeAllowed = function (programName, v) {
    var p = JW_CANON.program(programName);
    if (!p) return false;
    return p.grades.indexOf(String(v == null ? "" : v).trim()) !== -1;
  };

  JW_CANON.ageAllowed = function (programName, v) {
    var p = JW_CANON.program(programName);
    if (!p) return false;
    var s = String(v == null ? "" : v).trim();
    if (!/^\d{1,2}$/.test(s)) return false;
    var n = Number(s);
    return n >= p.ageMin && n <= p.ageMax;
  };

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

  JW_CANON.normaliseSchool = function (raw) {
    var s = String(raw == null ? "" : raw).trim();
    if (!s) return { code: null, confidence: "NONE", raw: "" };
    var hit = ALIAS_INDEX[fold(s)];
    return hit
      ? { code: hit, confidence: "HIGH", raw: s }
      : { code: null, confidence: "NONE", raw: s };
  };

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

  JW_CANON.schoolOptionsHtml = function (placeholder) {
    var named = JW_CANON.schools.filter(function (s) { return !s.isOther; })
      .slice().sort(function (a, b) { return a.label < b.label ? -1 : 1; });
    var other = JW_CANON.schools.filter(function (s) { return !!s.isOther; });
    return JW_CANON.optionsHtml(named.concat(other).map(function (s) {
      return { value: s.code, label: s.label };
    }), placeholder);
  };

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

  JW_CANON.schoolForStorage = function (code, other) {
    var c = String(code == null ? "" : code).trim().toUpperCase();
    if (c === "OTHER") return { code: "OTHER", display: String(other || "").trim() };
    var s = JW_CANON.schoolByCode(c);
    return s ? { code: s.code, display: s.label } : { code: "", display: "" };
  };

  if (typeof module !== "undefined" && module.exports) module.exports = JW_CANON;
  else root.JW_CANON = JW_CANON;
})(this);
