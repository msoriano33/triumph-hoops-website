#!/usr/bin/env node
/* ==========================================================================
   PHASE 2C REGRESSION SUITE
   --------------------------------------------------------------------------
   Runs offline against the real config and the real endpoint validators.
   No network, no sheet, no family data - every identity here is synthetic.

   Run: node tests/canonical.test.js
   ========================================================================== */
"use strict";
const assert = require("assert");
const { execFileSync } = require("child_process");
const path = require("path");

const CANON = require("../assets/js/canonical.js");
const CLINICS = require("../assets/js/clinics.js");
const INQUIRY = require("../api/inquiry.js");
const RSVP = require("../api/clinic-rsvp.js");

let pass = 0, fail = 0;
const failures = [];
function t(name, fn) {
  try { fn(); pass++; console.log("  ok   " + name); }
  catch (e) { fail++; failures.push(name + "\n       " + e.message); console.log("  FAIL " + name + "\n       " + e.message); }
}
function section(s) { console.log("\n" + s); }

/* ---------------------------------------------------------------- config */
section("Canonical config integrity");

t("school codes are unique", () => {
  const codes = CANON.schools.map((s) => s.code);
  assert.strictEqual(new Set(codes).size, codes.length);
});
t("grade values are unique", () => {
  const v = CANON.grades.map((g) => g.value);
  assert.strictEqual(new Set(v).size, v.length);
});
t("OTHER exists and is last", () => {
  assert.strictEqual(CANON.schools[CANON.schools.length - 1].code, "OTHER");
  assert.ok(CANON.schools[CANON.schools.length - 1].isOther);
});
t("every program's grades exist in the master grade list", () => {
  const all = new Set(CANON.grades.map((g) => g.value));
  Object.keys(CANON.programs).forEach((p) => {
    CANON.programs[p].grades.forEach((g) => assert.ok(all.has(g), p + " has unknown grade " + g));
  });
});
t("every source maps to a real program", () => {
  Object.keys(CANON.sourceProgram).forEach((src) => {
    assert.ok(CANON.programs[CANON.sourceProgram[src]], src + " -> unknown program");
  });
});
t("every alias resolves to a real school code", () => {
  Object.keys(CANON.schoolAliases).forEach((code) => {
    assert.ok(CANON.schoolByCode(code), "alias group for unknown code " + code);
  });
});
t("no alias maps two different schools to the same spelling", () => {
  const seen = {};
  Object.keys(CANON.schoolAliases).forEach((code) => {
    CANON.schoolAliases[code].forEach((raw) => {
      const k = CANON.fold(raw);
      assert.ok(!seen[k] || seen[k] === code, "'" + raw + "' claimed by " + seen[k] + " and " + code);
      seen[k] = code;
    });
  });
});
t("nwSender, littleNine and feedsInto are distinct attributes", () => {
  const rut = CANON.schoolByCode("RUTLEDGE_HALL");
  assert.strictEqual(rut.nwSender, false);
  assert.strictEqual(rut.littleNine, false);
  assert.strictEqual(rut.feedsInto, "LINCOLN_HALL");
  const lh = CANON.schoolByCode("LINCOLN_HALL");
  assert.strictEqual(lh.nwSender, true);
  assert.strictEqual(lh.littleNine, true);
  assert.strictEqual(lh.feedsInto, null);
});
t("Lawler Park is not a school", () => {
  assert.strictEqual(CANON.normaliseSchool("Lawler Park").code, null);
});
t("the four Niles North feeders are absent", () => {
  ["Old Orchard Junior High School", "Oliver McCracken Middle School",
   "East Prairie School", "Golf Middle School"].forEach((n) => {
    assert.strictEqual(CANON.normaliseSchool(n).code, null, n + " should not resolve");
  });
});

/* ------------------------------------------------------- required cases */
section("Required regression cases — grade");

t("3rd grade accepted (Junior Wolves)", () => assert.ok(CANON.gradeAllowed("junior_wolves", "3")));
t("8th grade accepted (Junior Wolves)", () => assert.ok(CANON.gradeAllowed("junior_wolves", "8")));
t("2nd grade rejected (Junior Wolves)", () => assert.ok(!CANON.gradeAllowed("junior_wolves", "2")));
t("9th grade rejected (Junior Wolves)", () => assert.ok(!CANON.gradeAllowed("junior_wolves", "9")));
t("2nd grade accepted (Triumph teams)", () => assert.ok(CANON.gradeAllowed("triumph_teams", "2")));
t("Kindergarten accepted (Triumph)", () => assert.ok(CANON.gradeAllowed("triumph", "K")));
t("12th grade accepted (Triumph)", () => assert.ok(CANON.gradeAllowed("triumph", "12")));

section("Required regression cases — age");
t("age 7 accepted (Junior Wolves)", () => assert.ok(CANON.ageAllowed("junior_wolves", "7")));
t("age 15 accepted (Junior Wolves)", () => assert.ok(CANON.ageAllowed("junior_wolves", "15")));
t("age 6 rejected (Junior Wolves)", () => assert.ok(!CANON.ageAllowed("junior_wolves", "6")));
t("age 16 rejected (Junior Wolves)", () => assert.ok(!CANON.ageAllowed("junior_wolves", "16")));
t("age 4 accepted (Triumph)", () => assert.ok(CANON.ageAllowed("triumph", "4")));
t("age 19 accepted (Triumph)", () => assert.ok(CANON.ageAllowed("triumph", "19")));
t("Junior Wolves limits are NOT applied to Triumph", () => {
  assert.ok(CANON.ageAllowed("triumph", "4"), "Triumph must accept an age Junior Wolves does not");
  assert.ok(!CANON.ageAllowed("junior_wolves", "4"));
});

section("Required regression cases — forged and translated values");
const JW = { source: "junior_wolves_tryout", parent_name: "Qa Tester", parent_email: "triumphhoopsacademy@gmail.com",
             jersey_size: "YM", shorts_size: "YM", acknowledgement: "yes" };
const inq = (o) => INQUIRY.validate(Object.assign({}, JW, o));

t("browser-translated grade label is rejected", () => {
  assert.ok(inq({ player_grade: "7.º grado", school_code: "PARK_VIEW" }).length);
});
t("visible English label is rejected as a value", () => {
  assert.ok(inq({ player_grade: "7th grade", school_code: "PARK_VIEW" }).length);
  assert.ok(inq({ player_grade: "7th Grade", school_code: "PARK_VIEW" }).length);
});
t("forged grade outside the program is rejected", () => {
  assert.ok(inq({ player_grade: "11", school_code: "PARK_VIEW" }).length);
  assert.ok(inq({ player_grade: "99", school_code: "PARK_VIEW" }).length);
});
t("forged school code is rejected", () => {
  assert.ok(inq({ player_grade: "7", school_code: "HOGWARTS" }).length);
  assert.ok(inq({ player_grade: "7", school_code: "PARK_VIEW; DROP TABLE" }).length);
});
t("a canonical school LABEL is not accepted as a code", () => {
  assert.ok(inq({ player_grade: "7", school_code: "Park View School" }).length);
});
t("valid canonical submission passes", () => {
  assert.deepStrictEqual(inq({ player_grade: "7", school_code: "PARK_VIEW" }), []);
});

section("Required regression cases — Other School");
t("Other School with text passes", () => {
  assert.deepStrictEqual(inq({ player_grade: "7", school_code: "OTHER", school_other: "Roosevelt" }), []);
});
t("Other School with NO text is rejected", () => {
  assert.ok(inq({ player_grade: "7", school_code: "OTHER" }).length);
});
t("Other School with whitespace-only text is rejected", () => {
  assert.ok(inq({ player_grade: "7", school_code: "OTHER", school_other: "   " }).length);
});
t("an Other entry naming a canonical school stays OTHER", () => {
  const st = CANON.schoolForStorage("OTHER", "Park View School");
  assert.strictEqual(st.code, "OTHER");
  assert.strictEqual(st.display, "Park View School");
});
t("a canonical pick stores the official display name", () => {
  const st = CANON.schoolForStorage("PARK_VIEW", "");
  assert.strictEqual(st.code, "PARK_VIEW");
  assert.strictEqual(st.display, "Park View School");
});

section("Required regression cases — clinic RSVP endpoints");
const RB = { player_first: "Qatest", player_last: "Canon", parent_name: "Qa Tester",
             parent_email: "triumphhoopsacademy@gmail.com", clinic: "2026-10-11" };
const rsvp = (o) => RSVP.validate(Object.assign({}, RB, o));

t("new clinic RSVP with canonical values passes", () => {
  assert.strictEqual(rsvp({ grade: "3", age: "7", school_code: "CULVER" }), null);
});
t("new clinic RSVP rejects a forged grade", () => {
  assert.ok(rsvp({ grade: "9", age: "12", school_code: "CULVER" }));
});
t("new clinic RSVP rejects a forged age", () => {
  assert.ok(rsvp({ grade: "7", age: "40", school_code: "CULVER" }));
  assert.ok(rsvp({ grade: "7", age: "12 years old", school_code: "CULVER" }));
});
t("new clinic RSVP rejects a missing school", () => {
  assert.ok(rsvp({ grade: "7", age: "12" }));
});
t("matched clinic RSVP accepts grade without school", () => {
  assert.strictEqual(RSVP.validateMatched({ player_first: "Qatest", player_last: "Canon",
    grade: "7", age: "12", clinic: "2026-10-11" }), null);
});
t("matched clinic RSVP still rejects a forged grade", () => {
  assert.ok(RSVP.validateMatched({ player_first: "Qatest", player_last: "Canon",
    grade: "13", clinic: "2026-10-11" }));
});

/* --------------------------------------------- clinic session boundary */
section("Clinic session split survives the grade format change");
const S = (g) => { const s = CLINICS.sessionFor("2026-10-11", g); return s ? s.id : null; };
t("canonical grades land in the right session", () => {
  ["3", "4", "5", "6"].forEach((g) => assert.strictEqual(S(g), "younger", "grade " + g));
  ["7", "8"].forEach((g) => assert.strictEqual(S(g), "older", "grade " + g));
});
t("6th is YOUNGER and 7th is OLDER — the boundary most easily got wrong", () => {
  assert.strictEqual(S("6"), "younger");
  assert.strictEqual(S("7"), "older");
});
t("historical spellings still resolve to the same session", () => {
  ["6th", "6th grade", 6].forEach((g) => assert.strictEqual(S(g), "younger", String(g)));
  ["7th", "7th grade", 7].forEach((g) => assert.strictEqual(S(g), "older", String(g)));
});
t("a grade outside the clinic has no session", () => {
  assert.strictEqual(S("9"), null);
  assert.strictEqual(S(""), null);
});
t("clinic dates and weekdays still come from config", () => {
  assert.strictEqual(CLINICS.longDate("2026-10-11"), "Sunday, October 11, 2026");
  assert.strictEqual(CLINICS.longDate("2026-10-25"), "Sunday, October 25, 2026");
  assert.strictEqual(CLINICS.longDate("2026-09-27"), "Sunday, September 27, 2026");
});

/* ------------------------------------------------ historical normalising */
section("Reading historical values (never guessing)");
t("historical grade spellings normalise", () => {
  assert.strictEqual(CANON.normaliseGrade("7th grade"), "7");
  assert.strictEqual(CANON.normaliseGrade("7th"), "7");
  assert.strictEqual(CANON.normaliseGrade("7.º grado"), "7");
  assert.strictEqual(CANON.normaliseGrade(7), "7");
  assert.strictEqual(CANON.normaliseGrade("Kindergarten"), "K");
  assert.strictEqual(CANON.normaliseGrade("Not in school yet"), "PK");
});
t("an unreadable grade returns empty, never a guess", () => {
  assert.strictEqual(CANON.normaliseGrade("banana"), "");
  assert.strictEqual(CANON.normaliseGrade(""), "");
  assert.strictEqual(CANON.normaliseGrade("99th"), "");
});
t("reviewed school spellings resolve", () => {
  [["Parkview", "PARK_VIEW"], ["Park view", "PARK_VIEW"], ["Edison", "THOMAS_EDISON"],
   ["Lincoln", "LINCOLN_JH"], ["Lincoln Hall", "LINCOLN_HALL"], ["Culver", "CULVER"],
   ["Rutledge Hall", "RUTLEDGE_HALL"], ["Fairview", "FAIRVIEW_SOUTH"]]
    .forEach(([raw, code]) => assert.strictEqual(CANON.normaliseSchool(raw).code, code, raw));
});
t("Lincoln and Lincoln Hall stay different schools", () => {
  assert.strictEqual(CANON.normaliseSchool("Lincoln").code, "LINCOLN_JH");
  assert.strictEqual(CANON.normaliseSchool("Lincoln Hall").code, "LINCOLN_HALL");
  assert.notStrictEqual(CANON.normaliseSchool("Lincoln").code, CANON.normaliseSchool("Lincoln Hall").code);
});
t("unknown schools are NOT fuzzy-matched", () => {
  ["Clever", "Clover school", "Iccd", "APMA", "2026", "Dirksen", "Roosevelt",
   "Lincolnwood", "Thonas edison", "Lincoln joiner high school",
   "Clarence E Clarence", "Rutledge Hall (Lincoln Hall)", "PopeJohn"]
    .forEach((raw) => assert.strictEqual(CANON.normaliseSchool(raw).code, null,
      raw + " must stay unresolved rather than be guessed"));
});
t("the closest-looking school is still not chosen", () => {
  /* "Lincolnwood" shares a prefix with Lincoln JH and names the district of
     both Rutledge Hall and Lincoln Hall. Any fuzzy matcher would pick one. */
  assert.strictEqual(CANON.normaliseSchool("Lincolnwood").code, null);
});

/* ------------------------------------------------------ built page check */
section("Built pages match the config");
t("rendered <option> markup is current on every form page", () => {
  execFileSync(process.execPath,
    [path.join(__dirname, "..", "tools", "render-canonical-options.js"), "--check"],
    { stdio: "pipe" });
});
t("every rendered option carries an explicit value attribute", () => {
  const fs = require("fs");
  ["index.html", "junior-wolves.html", "teams.html", "training.html", "clinic-rsvp.html"].forEach((f) => {
    const html = fs.readFileSync(path.join(__dirname, "..", f), "utf8");
    (html.match(/<!--CANON:[\s\S]*?<!--\/CANON-->/g) || []).forEach((block) => {
      (block.match(/<option[^>]*>/g) || []).forEach((o) => {
        assert.ok(/value="/.test(o), f + " has a valueless option: " + o);
      });
    });
  });
});
t("no form page still submits a visible label as its value", () => {
  const fs = require("fs");
  ["index.html", "junior-wolves.html", "teams.html", "training.html", "clinic-rsvp.html"].forEach((f) => {
    const html = fs.readFileSync(path.join(__dirname, "..", f), "utf8");
    assert.ok(!/<option>\s*\d+(st|nd|rd|th) grade/i.test(html), f + " still has a bare grade option");
  });
});

/* ------------------------------------------------ generated Apps Script */
section("The generated Apps Script copy behaves identically");
const vm = require("vm");
const fs2 = require("fs");
const gsPath = path.join(__dirname, "..", "ops", "funnel", "canonical-config.gs");
const sb = {};
vm.createContext(sb);
vm.runInContext(fs2.readFileSync(gsPath, "utf8"), sb);
const GS = sb.JW_CANON;

t("the generated .gs is not stale", () => {
  execFileSync(process.execPath,
    [path.join(__dirname, "..", "tools", "build-canonical-gs.js"), "--check"], { stdio: "pipe" });
});
t("it defines JW_CANON at the same version", () => {
  assert.ok(GS, "JW_CANON not defined by the generated file");
  assert.strictEqual(GS.version, CANON.version);
});
t("it holds the identical school and grade lists", () => {
  /* Arrays come out of the vm realm, so compare contents rather than identity. */
  assert.strictEqual(GS.schools.map((s) => s.code).join("|"), CANON.schools.map((s) => s.code).join("|"));
  assert.strictEqual(GS.grades.map((g) => g.value).join("|"), CANON.grades.map((g) => g.value).join("|"));
  assert.strictEqual(Object.keys(GS.programs).sort().join("|"), Object.keys(CANON.programs).sort().join("|"));
});
t("grade, age and school decisions agree for every case in this suite", () => {
  const programs = Object.keys(CANON.programs);
  const gradeProbes = CANON.grades.map((g) => g.value)
    .concat(["7th grade", "7th Grade", "7.\u00ba grado", "99", "", "K", "PK", "banana"]);
  programs.forEach((p) => {
    gradeProbes.forEach((g) => assert.strictEqual(GS.gradeAllowed(p, g), CANON.gradeAllowed(p, g), p + "/" + g));
    for (let a = 0; a <= 25; a++) {
      assert.strictEqual(GS.ageAllowed(p, String(a)), CANON.ageAllowed(p, String(a)), p + "/age " + a);
    }
  });
  Object.keys(CANON.aliasIndex).concat(
    ["Clever", "Clover school", "Iccd", "APMA", "2026", "Dirksen", "Roosevelt",
     "Lincolnwood", "PopeJohn", "Lawler Park", ""]
  ).forEach((raw) => {
    assert.strictEqual(GS.normaliseSchool(raw).code, CANON.normaliseSchool(raw).code, raw);
  });
});
t("it renders identical option markup", () => {
  assert.strictEqual(GS.schoolOptionsHtml(), CANON.schoolOptionsHtml());
  Object.keys(CANON.programs).forEach((p) => {
    assert.strictEqual(GS.gradeOptionsHtml(p), CANON.gradeOptionsHtml(p), p);
    assert.strictEqual(GS.ageOptionsHtml(p), CANON.ageOptionsHtml(p), p);
  });
});
t("it validates submissions identically", () => {
  const cases = [
    ["junior_wolves", { grade: "7", school_code: "PARK_VIEW" }],
    ["junior_wolves", { grade: "7th grade", school_code: "PARK_VIEW" }],
    ["junior_wolves", { grade: "7", school_code: "OTHER" }],
    ["junior_wolves", { grade: "7", school_code: "OTHER", school_other: "X" }],
    ["junior_wolves", { grade: "2", age: "6", school_code: "NOPE" }],
    ["triumph", { grade: "K", age: "5" }],
    ["triumph_teams", { grade: "12", age: "19" }]
  ];
  cases.forEach(([p, f]) => {
    assert.strictEqual(Array.from(GS.validateSubmission(p, f, { requireSchool: p === "junior_wolves" })).join(" | "),
                       CANON.validateSubmission(p, f, { requireSchool: p === "junior_wolves" }).join(" | "),
                       p + " " + JSON.stringify(f));
  });
});

console.log("\n" + "=".repeat(60));
console.log(pass + " passed, " + fail + " failed");
if (fail) { console.log("\nFAILURES:\n" + failures.join("\n")); process.exit(1); }
