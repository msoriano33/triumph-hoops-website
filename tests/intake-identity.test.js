#!/usr/bin/env node
/* ==========================================================================
   IDENTITY RESOLUTION — offline tests for ops/funnel/canonical-intake.gs
   --------------------------------------------------------------------------
   Loads the Apps Script file into a sandbox with the few Google globals it
   touches stubbed out, then drives ciResolveIdentity_ directly. Every name
   here is invented. This is where the sibling / duplicate / same-name cases
   get proven BEFORE anything runs against the real sheet.
   ========================================================================== */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const sandbox = {
  SPREADSHEET_ID: "TEST",
  SpreadsheetApp: { openById: () => { throw new Error("no sheet access in this test"); },
                    flush: () => {}, newDataValidation: () => { throw new Error("n/a"); } },
  Logger: { log: () => {} },
  console
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "ops", "funnel", "canonical-config.gs"), "utf8"), sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "ops", "funnel", "canonical-intake.gs"), "utf8"), sandbox);

let pass = 0, fail = 0;
const failures = [];
function t(name, fn) {
  try { fn(); pass++; console.log("  ok   " + name); }
  catch (e) { fail++; failures.push(name); console.log("  FAIL " + name + "\n       " + e.message); }
}
function section(s) { console.log("\n" + s); }

/* ---- synthetic fixtures ------------------------------------------------ */
const A_IDX = { "Athlete ID": 0, "First Name": 1, "Last Name": 2, "Household ID": 3 };
const H_IDX = { "Household ID": 0, "Primary Email": 1, "Primary Phone": 2,
                "Secondary Email": 3, "Secondary Phone": 4, "Other Contacts": 5 };

const HOUSEHOLDS = [
  ["ZZ-H-0001", "one@qa.invalid",   "(847) 555-0101", "",                 "",              ""],
  ["ZZ-H-0002", "two@qa.invalid",   "8475550102",     "twob@qa.invalid",  "",              ""],
  ["ZZ-H-0003", "three@qa.invalid", "",               "",                 "847-555-0103",  "third@qa.invalid"]
];
const ATHLETES = [
  ["ZZ-A-0001", "Ada",   "Quintero", "ZZ-H-0001"],
  ["ZZ-A-0002", "Bo",    "Quintero", "ZZ-H-0001"],   /* sibling */
  ["ZZ-A-0003", "Ada",   "Quintero", "ZZ-H-0002"],   /* SAME NAME, other family */
  ["ZZ-A-0004", "Cy",    "Nakamura", "ZZ-H-0003"]
];
const resolve = (m) => sandbox.ciResolveIdentity_(m, ATHLETES, A_IDX, HOUSEHOLDS, H_IDX);

section("Returning athlete");
t("exact name + household links to the existing athlete", () => {
  const d = resolve({ first: "Ada", last: "Quintero", email: "one@qa.invalid", phone: "" });
  assert.strictEqual(d.action, "LINK");
  assert.strictEqual(d.athleteId, "ZZ-A-0001");
});
t("case and punctuation in the name do not matter", () => {
  const d = resolve({ first: " ADA ", last: "Quintero", email: "ONE@QA.INVALID", phone: "" });
  assert.strictEqual(d.action, "LINK");
  assert.strictEqual(d.athleteId, "ZZ-A-0001");
});
t("a phone alone identifies the household", () => {
  const d = resolve({ first: "Ada", last: "Quintero", email: "", phone: "847 555 0101" });
  assert.strictEqual(d.action, "LINK");
  assert.strictEqual(d.athleteId, "ZZ-A-0001");
});
t("a phone written differently still matches", () => {
  const d = resolve({ first: "Bo", last: "Quintero", email: "", phone: "+1 (847) 555-0101" });
  assert.strictEqual(d.action, "LINK");
  assert.strictEqual(d.athleteId, "ZZ-A-0002");
});
t("a secondary email identifies the household", () => {
  const d = resolve({ first: "Ada", last: "Quintero", email: "twob@qa.invalid", phone: "" });
  assert.strictEqual(d.action, "LINK");
  assert.strictEqual(d.athleteId, "ZZ-A-0003");
});
t("an address in Other Contacts identifies the household", () => {
  const d = resolve({ first: "Cy", last: "Nakamura", email: "third@qa.invalid", phone: "" });
  assert.strictEqual(d.action, "LINK");
  assert.strictEqual(d.athleteId, "ZZ-A-0004");
});

section("Sibling registration");
t("a NEW sibling in a KNOWN household creates a new athlete, never a merge", () => {
  const d = resolve({ first: "Dee", last: "Quintero", email: "one@qa.invalid", phone: "" });
  assert.strictEqual(d.action, "CREATE");
  assert.strictEqual(d.householdId, "ZZ-H-0001");
});
t("an existing sibling is not confused with the other sibling", () => {
  const d = resolve({ first: "Bo", last: "Quintero", email: "one@qa.invalid", phone: "" });
  assert.strictEqual(d.athleteId, "ZZ-A-0002");
});

section("The dangerous cases — must go to review, never to a guess");
t("same name in a DIFFERENT household is not merged", () => {
  /* Ada Quintero exists in two unrelated households. Matching on name alone
     would join two families' records together, which cannot be undone. */
  const d = resolve({ first: "Ada", last: "Quintero", email: "two@qa.invalid", phone: "" });
  assert.strictEqual(d.action, "LINK");
  assert.strictEqual(d.athleteId, "ZZ-A-0003", "must link within its OWN household");
});
t("an unknown family opens a NEW household rather than joining a near one", () => {
  /* This is the COMMON case for a new registration. Refusing it would mean
     the sync did nothing for the situation it exists to handle. Creating two
     new records cannot destroy anything; attaching them to the nearest
     existing household silently and permanently could. */
  const d = resolve({ first: "Ada", last: "Quintero", email: "stranger@qa.example", phone: "" });
  assert.strictEqual(d.action, "CREATE_HOUSEHOLD");
  assert.strictEqual(d.email, "stranger@qa.example");
});
t("a placeholder email never opens a household", () => {
  ["probe@example.com", "x@test.com", "y@invalid"].forEach((e) => {
    const d = resolve({ first: "Ada", last: "Quintero", email: e, phone: "" });
    assert.strictEqual(d.action, "REVIEW", e);
  });
});
t("a malformed email never opens a household", () => {
  ["not-an-email", "@nowhere", "a@b"].forEach((e) => {
    assert.strictEqual(resolve({ first: "Ada", last: "Quintero", email: e, phone: "" }).action,
      "REVIEW", e);
  });
});
t("contact details spanning two households go to review", () => {
  const H2 = HOUSEHOLDS.concat([["ZZ-H-0004", "one@qa.invalid", "", "", "", ""]]);
  const d = sandbox.ciResolveIdentity_(
    { first: "Ada", last: "Quintero", email: "one@qa.invalid", phone: "" },
    ATHLETES, A_IDX, H2, H_IDX);
  assert.strictEqual(d.action, "REVIEW");
  assert.ok(/2 households/.test(d.reason));
});
t("two athletes sharing a name inside ONE household go to review", () => {
  const A2 = ATHLETES.concat([["ZZ-A-0005", "Ada", "Quintero", "ZZ-H-0001"]]);
  const d = sandbox.ciResolveIdentity_(
    { first: "Ada", last: "Quintero", email: "one@qa.invalid", phone: "" },
    A2, A_IDX, HOUSEHOLDS, H_IDX);
  assert.strictEqual(d.action, "REVIEW");
});
t("a blank name goes to review", () => {
  assert.strictEqual(resolve({ first: "", last: "", email: "one@qa.invalid", phone: "" }).action, "REVIEW");
});
t("no contact details at all goes to review", () => {
  assert.strictEqual(resolve({ first: "Ada", last: "Quintero", email: "", phone: "" }).action, "REVIEW");
});
t("a phone with no email never opens a household on its own", () => {
  /* A phone alone can MATCH an existing household, but it is not enough to
     open one - the confirmation channel is email, so a household with no
     address is a record nobody can act on. */
  ["555", "0000000000", "n/a", "3125550104"].forEach((p) => {
    assert.strictEqual(resolve({ first: "Ada", last: "Quintero", email: "", phone: p }).action,
      "REVIEW", "phone " + p);
  });
});
t("every outcome is one of the four known actions", () => {
  const KNOWN = ["LINK", "CREATE", "CREATE_HOUSEHOLD", "REVIEW"];
  const outcomes = new Set();
  [["Ada", "one@qa.invalid"], ["Zed", "one@qa.invalid"], ["Ada", "nobody@qa.example"],
   ["", "one@qa.invalid"], ["Ada", "probe@example.com"], ["Ada", ""]]
    .forEach(([f, e]) => outcomes.add(resolve({ first: f, last: "Quintero", email: e, phone: "" }).action));
  outcomes.forEach((o) => assert.ok(KNOWN.indexOf(o) !== -1, "unexpected action: " + o));
  assert.ok(outcomes.size >= 3, "expected several distinct outcomes, got " + outcomes.size);
});

section("Id minting");
t("the next athlete id continues the sequence", () => {
  assert.strictEqual(sandbox.ciNextId_(ATHLETES, 0, "JW-A-"), "JW-A-0005");
});
t("minting is driven by the maximum, not the row count", () => {
  const sparse = [["ZZ-A-0007", "", "", ""], ["ZZ-A-0002", "", "", ""]];
  assert.strictEqual(sandbox.ciNextId_(sparse, 0, "JW-A-"), "JW-A-0008");
});
t("an empty table starts at 0001", () => {
  assert.strictEqual(sandbox.ciNextId_([], 0, "JW-A-"), "JW-A-0001");
});

section("School resolution on ATHLETES");
const rs = (raws, codes) => sandbox.ciResolveSchoolForAthlete_(raws, codes || []);
t("consistent spellings resolve to one canonical code", () => {
  const r = rs(["Parkview", "Park View School", "Park view"]);
  assert.strictEqual(r.code, "PARK_VIEW");
  assert.strictEqual(r.status, "OK");
  assert.strictEqual(r.display, "Park View School");
});
t("spelling variants that used to read as a CONFLICT now agree", () => {
  const r = rs(["Edison", "Thomas Edison Elementary"]);
  assert.strictEqual(r.status, "OK");
  assert.strictEqual(r.code, "THOMAS_EDISON");
});
t("a genuine disagreement stays a CONFLICT with a blank code", () => {
  const r = rs(["Lincoln Hall", "Park View School"]);
  assert.strictEqual(r.status, "CONFLICT");
  assert.strictEqual(r.code, "");
});
t("an unrecognised spelling is NEEDS_REVIEW, never a guess", () => {
  const r = rs(["Clover school"]);
  assert.strictEqual(r.status, "NEEDS_REVIEW");
  assert.strictEqual(r.code, "");
  assert.deepStrictEqual(Array.from(r.unresolved), ["Clover school"]);
});
t("a resolved value does not override an unrecognised one", () => {
  const r = rs(["Park View School", "Clover school"]);
  assert.strictEqual(r.status, "NEEDS_REVIEW");
  assert.strictEqual(r.code, "");
});
t("an explicit OTHER from the form wins over everything", () => {
  const r = rs(["Park View School"], ["OTHER"]);
  assert.strictEqual(r.code, "OTHER");
  assert.strictEqual(r.status, "OK");
});
t("an explicit canonical code is used directly", () => {
  const r = rs(["anything at all"], ["LINCOLN_HALL"]);
  assert.strictEqual(r.code, "LINCOLN_HALL");
  assert.strictEqual(r.display, "Lincoln Hall");
});
t("two different explicit codes are a CONFLICT", () => {
  const r = rs([], ["LINCOLN_HALL", "PARK_VIEW"]);
  assert.strictEqual(r.status, "CONFLICT");
});

console.log("\n" + "=".repeat(60));
console.log(pass + " passed, " + fail + " failed");
if (fail) { console.log("\nFAILURES:\n" + failures.join("\n")); process.exit(1); }
