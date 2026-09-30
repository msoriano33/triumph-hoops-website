#!/usr/bin/env node
/* ==========================================================================
   OCT 11 FOUR-WAY SEGMENTATION — regression suite
   --------------------------------------------------------------------------
   Three things get proved here, none of them by inspection:

   1. THE AUDIENCE SPLIT. ops/funnel/event-audience.gs is loaded into a
      sandbox with the handful of Google globals it touches stubbed, and
      driven against synthetic sheet rows. Attended x RSVPed must land in
      exactly one of A1/A2/B1/B2, the four must be disjoint, and their union
      must be the whole master audience.

   2. THE CTA MATRIX. Each rendered variant must carry exactly the calls to
      action its segment is allowed, and no others.

   3. THE GUARDS THEMSELVES. Every refusal path is driven with data that
      SHOULD trip it, because a guard that has never fired is a guard nobody
      has tested. This suite exists because three earlier guards in this
      project passed while checking nothing.

   Every address, name and clinic below is invented. Nothing here reads or
   writes a live sheet.
   ========================================================================== */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const crypto = require("crypto");
const assert = require("assert");

let pass = 0, fail = 0;
const failures = [];
function t(name, fn) {
  try { fn(); pass++; console.log("  ok   " + name); }
  catch (e) { fail++; failures.push(name); console.log("  FAIL " + name + "\n       " + e.message); }
}
function section(s) { console.log("\n" + s); }

/* ---------------------------------------------------------------- fixtures */
const PAST = "2026-09-27";      /* the clinic attendance is read from */
const NEXT = "2026-10-11";      /* the clinic being sent about       */

/* MASTER REGISTRATIONS. Columns only as wide as the code reads. */
const M_HEAD = ["Submission ID", "Player Full Name", "Grade", "Parent Email"];
const M_ROWS = [
  ["ZZ-1", "Ada Quintero",  "5th", "a1@qa-fixture-not-real.org"],   /* attended + rsvpd     -> A1 */
  ["ZZ-2", "Bo Nakamura",   "7th", "a2@qa-fixture-not-real.org"],   /* attended + not rsvpd -> A2 */
  ["ZZ-3", "Cy Oyelaran",   "3rd", "b1@qa-fixture-not-real.org"],   /* absent   + rsvpd     -> B1 */
  ["ZZ-4", "Dee Vasquez",   "8th", "b2@qa-fixture-not-real.org"],   /* never there, no rsvp -> B2 */
  ["ZZ-5", "Eli Thornquist","6th", "unres@qa-fixture-not-real.org"],/* attendance UNRESOLVED-> B2 */
  ["ZZ-6", "Fin Marchetti", "4th", "probe@example.com"],       /* placeholder  -> out */
  ["ZZ-7", "Gus QA Test",   "5th", "qa@qa-fixture-not-real.org"],           /* QA marker    -> out */
  ["ZZ-8", "Hal Bergstrom", "7th", "triumphhoopsacademy@gmail.com"] /* org      -> out */
];

/* CLINIC RSVP. Sept 27 rows carry attendance; Oct 11 rows carry intent. */
const R_HEAD = ["Clinic Date", "Player First Name", "Grade", "Parent Email",
                "Attendance Status"];
const R_ROWS = [
  /* --- Sept 27: who was actually in the gym --- */
  [PAST, "Ada",  "5th", "a1@qa-fixture-not-real.org",    "Present"],
  [PAST, "Bo",   "7th", "a2@qa-fixture-not-real.org",    "Present"],
  [PAST, "Cy",   "3rd", "b1@qa-fixture-not-real.org",    "Absent"],    /* RSVPed, did not come */
  [PAST, "Eli",  "6th", "unres@qa-fixture-not-real.org", ""],          /* the Gray/Hassan case */
  [PAST, "Gus",  "5th", "qa@qa-fixture-not-real.org",    "Present"],   /* QA marker on the row */
  /* --- Oct 11: who has said they are coming --- */
  [NEXT, "Ada",  "5th", "a1@qa-fixture-not-real.org",    ""],
  [NEXT, "Cy",   "3rd", "b1@qa-fixture-not-real.org",    ""],
  [NEXT, "Ivo",  "8th", "cancel@qa-fixture-not-real.org","Cancelled"]  /* cancelled: not an RSVP */
];
R_ROWS[4][1] = "Gus QA Test";   /* make the QA marker visible to EA_QA */

/* ---- a sandbox holding just enough of Apps Script to run the real file --- */
function sheetStub(head, rows) {
  return {
    getLastRow: () => rows.length + 1,
    getLastColumn: () => head.length,
    getRange: (r, c, nr, nc) => ({
      getValues: () => {
        if (r === 1) return [head.slice(c - 1, c - 1 + nc)];
        return rows.slice(r - 2, r - 2 + nr).map((row) => row.slice(c - 1, c - 1 + nc));
      }
    })
  };
}
function makeSandbox(mRows, rRows) {
  const sandbox = {
    SPREADSHEET_ID: "TEST",
    Logger: { log: () => {} },
    console,
    SpreadsheetApp: {
      openById: () => ({
        getSheetByName: (n) => n === "MASTER REGISTRATIONS"
          ? sheetStub(M_HEAD, mRows) : sheetStub(R_HEAD, rRows)
      })
    },
    Session: { getScriptTimeZone: () => "America/Chicago" },
    Utilities: {
      DigestAlgorithm: { SHA_256: "SHA_256" },
      Charset: { UTF_8: "UTF_8" },
      /* Apps Script hands back SIGNED bytes; eaFingerprint_ un-signs them.
         Mimicking the sign is what makes the two fingerprints comparable. */
      computeDigest: (_alg, str) => Array.from(crypto.createHash("sha256")
        .update(str, "utf8").digest()).map((b) => (b > 127 ? b - 256 : b)),
      formatDate: (d) => d.toISOString().slice(0, 10)
    },
    /* globals the audience module borrows from the main sheet script */
    splitFull_: (full) => {
      const parts = String(full || "").trim().split(/\s+/);
      return { first: parts[0] || "", last: parts.slice(1).join(" ") };
    },
    mrNorm_: (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "")
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(
    path.join(__dirname, "..", "ops", "funnel", "event-audience.gs"), "utf8"), sandbox);
  return sandbox;
}
const SB = makeSandbox(M_ROWS, R_ROWS);
const cell = (segment, attended) => SB.eventAudience_({
  clinicId: NEXT, segment, attended, attendedClinicId: PAST });
/* Arrays created inside the vm sandbox do not share this realm's
   Array.prototype, so assert.deepStrictEqual would fail on prototype
   identity alone. Copying into a plain array keeps the comparisons about
   membership, which is the thing under test. */
const emails = (r) => Array.from(r.households.map((h) => h.email)).sort();

/* ====================================================================== */
section("1. Each family lands in exactly one cell");

t("attended + RSVPed  ->  A1 only", () => {
  assert.deepStrictEqual(emails(cell("rsvpd", true)), ["a1@qa-fixture-not-real.org"]);
  ["a1@qa-fixture-not-real.org"].forEach((e) => {
    assert.ok(!emails(cell("not_rsvpd", true)).includes(e), "leaked into A2");
    assert.ok(!emails(cell("rsvpd", false)).includes(e), "leaked into B1");
    assert.ok(!emails(cell("not_rsvpd", false)).includes(e), "leaked into B2");
  });
});
t("attended + NOT RSVPed  ->  A2 only", () => {
  assert.deepStrictEqual(emails(cell("not_rsvpd", true)), ["a2@qa-fixture-not-real.org"]);
});
t("did NOT attend + RSVPed  ->  B1 only", () => {
  assert.deepStrictEqual(emails(cell("rsvpd", false)), ["b1@qa-fixture-not-real.org"]);
});
t("did NOT attend + NOT RSVPed  ->  B2 only", () => {
  /* cancel@ is here on purpose: a family that RSVPed and then cancelled has
     freed its spot and is once again a family worth inviting, so it belongs
     in the invitation cell rather than in no cell at all. */
  assert.deepStrictEqual(emails(cell("not_rsvpd", false)),
    ["b2@qa-fixture-not-real.org", "cancel@qa-fixture-not-real.org",
     "unres@qa-fixture-not-real.org"]);
});

section("2. Attendance comes from the reconciled source, and nothing else");

t("an Absent Sept 27 row is NOT an attendee", () => {
  /* Cy RSVPed for Sept 27 and did not come. Treating an RSVP as attendance
     would put him in A1 and ask him to review a clinic he missed. */
  assert.ok(emails(cell("rsvpd", true)).indexOf("b1@qa-fixture-not-real.org") === -1);
  assert.ok(emails(cell("rsvpd", false)).indexOf("b1@qa-fixture-not-real.org") !== -1);
});
t("a BLANK attendance value is not Present (the Gray/Hassan pair)", () => {
  /* Exactly one of that pair attended and the paper does not say which, so
     both stay on the non-attendee side and neither is asked for feedback. */
  assert.ok(emails(cell("not_rsvpd", false)).includes("unres@qa-fixture-not-real.org"));
  assert.ok(!emails(cell("not_rsvpd", true)).includes("unres@qa-fixture-not-real.org"));
});
t("a cancelled Oct 11 RSVP does not count as an RSVP", () => {
  /* The property that matters: a cancelled row must never put a household in
     a `rsvpd` cell, because those cells are the ones told "you're in" and
     sent no RSVP link. It stays in the audience, on the not_rsvpd side. */
  const rsvpdSide = emails(cell("rsvpd", true)).concat(emails(cell("rsvpd", false)));
  assert.ok(!rsvpdSide.includes("cancel@qa-fixture-not-real.org"),
    "a cancelled RSVP was treated as confirmed");
  assert.ok(emails(cell("not_rsvpd", false)).includes("cancel@qa-fixture-not-real.org"),
    "a cancelled family fell out of the audience entirely");
});
t("attendance for the PAST clinic is not read off the NEXT one", () => {
  const bad = SB.eventAudience_({ clinicId: NEXT, segment: "rsvpd",
    attended: true, attendedClinicId: NEXT });
  assert.strictEqual(bad.ok, false);
  assert.ok(/PAST clinic/.test(bad.error));
});
t("attended without an attendedClinicId is refused, not guessed", () => {
  const bad = SB.eventAudience_({ clinicId: NEXT, segment: "rsvpd", attended: true });
  assert.strictEqual(bad.ok, false);
});

section("3. The partition holds against the whole fixture");

const MX = SB.eventAudienceMatrix_({ clinicId: NEXT, attendedClinicId: PAST });
t("the matrix computes", () => assert.strictEqual(MX.ok, true));
t("no household appears in two cells", () =>
  assert.strictEqual(JSON.stringify(MX.overlaps), "[]", JSON.stringify(MX.overlaps)));
t("no household in the master audience is dropped", () =>
  assert.strictEqual(MX.missingFromCells, 0));
t("no cell invents a household the master audience does not have", () =>
  assert.strictEqual(MX.notInMaster, 0));
t("the four counts sum to the union", () =>
  assert.strictEqual(MX.total, MX.unionSize));
t("the union IS the master audience", () => {
  assert.strictEqual(MX.unionSize, MX.masterAudience);
  assert.strictEqual(MX.unionFingerprint, MX.masterFingerprint);
});
t("partitionOk is true overall", () => assert.strictEqual(MX.partitionOk, true));
t("excluded rows reach no cell at all", () => {
  const all = [];
  ["A1", "A2", "B1", "B2"].forEach((k) =>
    emails(SB.eventAudience_({ clinicId: NEXT,
      segment: MX.cells[k].segment, attended: MX.cells[k].attended,
      attendedClinicId: PAST })).forEach((e) => all.push(e)));
  ["probe@example.com", "qa@qa-fixture-not-real.org", "triumphhoopsacademy@gmail.com"]
    .forEach((e) => assert.ok(!all.includes(e), e + " reached an audience"));
});

section("4. The partition proof FAILS when the partition is broken");

t("the matrix REPORTS an overlap when the cells actually overlap", () => {
  /* The first version of this test built a fake matrix object and asserted
     on its own fake - which proves nothing about the checker. This one
     replaces eventAudience_ inside the sandbox so the real
     eventAudienceMatrix_ is handed genuinely overlapping cells, and then
     asks whether it notices. If the overlap detector is ever reduced to a
     no-op, this test fails and the hand-built one would not have. */
  const SB3 = makeSandbox(M_ROWS, R_ROWS);
  const real = SB3.eventAudience_;
  SB3.eventAudience_ = function (body) {
    const out = real(body);
    /* put one household into BOTH attended cells */
    if (out.ok && body.attended === true) {
      out.households = [{ email: "dupe@qa-fixture-not-real.org", athletes: [] }];
      out.count = 1;
    }
    return out;
  };
  const mx = SB3.eventAudienceMatrix_({ clinicId: NEXT, attendedClinicId: PAST });
  assert.strictEqual(mx.ok, true);
  assert.ok(mx.overlaps.length > 0, "an overlap was present and went unreported");
  assert.strictEqual(mx.overlaps[0].pair, "A1/A2");
  assert.strictEqual(mx.overlaps[0].shared, 1);
  assert.strictEqual(mx.partitionOk, false, "partitionOk stayed true through an overlap");
});
t("the matrix REPORTS a dropped household", () => {
  /* A cell quietly losing a family is the other half of the failure: the
     counts still look plausible, and one household silently gets nothing. */
  const SB4 = makeSandbox(M_ROWS, R_ROWS);
  const real = SB4.eventAudience_;
  SB4.eventAudience_ = function (body) {
    const out = real(body);
    if (out.ok && body.segment === "not_rsvpd" && body.attended === false) {
      out.households = Array.from(out.households).slice(1);
      out.count = out.households.length;
    }
    return out;
  };
  const mx = SB4.eventAudienceMatrix_({ clinicId: NEXT, attendedClinicId: PAST });
  assert.ok(mx.missingFromCells > 0, "a dropped household went unreported");
  assert.strictEqual(mx.partitionOk, false);
});
t("removing a family from the sheet's cells makes the union short", () => {
  const thinner = M_ROWS.filter((r) => r[3] !== "b2@qa-fixture-not-real.org");
  const SB2 = makeSandbox(thinner, R_ROWS);
  const mx = SB2.eventAudienceMatrix_({ clinicId: NEXT, attendedClinicId: PAST });
  assert.strictEqual(mx.partitionOk, true, "still a partition, just smaller");
  assert.ok(mx.masterAudience < MX.masterAudience, "and the master audience shrank");
});

/* ====================================================================== */
section("5. The CTA matrix, per variant");

const E = require("../lib/event-emails.js");
const HH = { athletes: [{ first: "Test", grade: "5th" }] };
const RENDER = {
  A1: E.sixdayAttendeeGoing, A2: E.sixdayAttendee,
  B1: E.sixdayGoing,         B2: E.sixdayCommunity
};
const WANT = {
  A1: { feedback: true,  rsvp: false },
  A2: { feedback: true,  rsvp: true  },
  B1: { feedback: false, rsvp: false },
  B2: { feedback: false, rsvp: true  }
};
Object.keys(WANT).forEach((k) => {
  t(k + ": feedback " + (WANT[k].feedback ? "YES" : "NO") +
       ", RSVP " + (WANT[k].rsvp ? "YES" : "NO"), () => {
    const html = RENDER[k](NEXT, HH).html;
    assert.strictEqual(html.indexOf("/clinic-feedback") !== -1, WANT[k].feedback, "feedback");
    assert.strictEqual(html.indexOf("/clinic-rsvp") !== -1, WANT[k].rsvp, "rsvp");
  });
});
t("where feedback appears it is a BUTTON, not a sentence with a link", () => {
  const RE = /<a href="[^"]*\/clinic-feedback[^"]*"[^>]*style="[^"]*padding:(?:15px 30px|14px 28px);/;
  ["A1", "A2"].forEach((k) => assert.ok(RE.test(RENDER[k](NEXT, HH).html), k));
});
t("the plain-text alternatives carry the same CTAs as the HTML", () => {
  const stages = { A1: "sixdayAttendeeGoing", A2: "sixdayAttendee",
                   B1: "sixdayGoing", B2: "sixdayCommunity" };
  Object.keys(WANT).forEach((k) => {
    const txt = E.STAGES[stages[k]].text(NEXT, HH);
    assert.strictEqual(/clinic-feedback/.test(txt), WANT[k].feedback, k + " text feedback");
    assert.strictEqual(/clinic-rsvp/.test(txt), WANT[k].rsvp, k + " text rsvp");
  });
});

section("6. The photograph, and who is told they were there");

t("the Sept 27 photo is in the attendee experience", () => {
  ["A1", "A2"].forEach((k) => {
    const r = RENDER[k](NEXT, HH);
    assert.ok(r.images.photos >= 1, k + " carries no photo");
    assert.ok(r.html.indexOf(E.PHOTO.url) !== -1, k + " carries a different image");
  });
});
t("no variant tells a non-attendee that they attended", () => {
  const CLAIMS = [/\byou(?:r athlete)?\s+(?:were|was|came|attended|brought)\b/i,
                  /\bthank you for (?:bringing|coming|attending)/i];
  ["B1", "B2"].forEach((k) => {
    const html = RENDER[k](NEXT, HH).html;
    CLAIMS.forEach((re) => assert.ok(!re.test(html), k + " matched " + re.source));
  });
});
t("the attendance-claim guard FIRES on copy that would slip through", () => {
  const J = require("../lib/jw-email.js");
  const offending = ["You were in the gym with us.", "Thank you for bringing your athlete.",
                     "When you came on the 27th.", "Your athlete attended the last clinic."];
  offending.forEach((text) => {
    assert.throws(() => E.finish({
      stage: "probe", clinicId: NEXT, subject: "s", title: "t", preheader: "p",
      kicker: "k", headline: "h", body: [J.prose("<p>" + text + "</p>")],
      footnote: "f", noAttendanceClaim: true }, HH, null),
      /implies this family attended/, "not caught: " + text);
  });
});
t("B1 is the shortest of the four, by a clear margin", () => {
  const len = (k) => RENDER[k](NEXT, HH).html.length;
  ["A1", "A2", "B2"].forEach((k) =>
    assert.ok(len("B1") < len(k), "B1 is not shorter than " + k));
  assert.ok(len("B1") < 0.8 * len("B2"),
    "B1 (" + len("B1") + ") is not substantially shorter than B2 (" + len("B2") + ")");
});
t("B1 still carries date, session times and venue", () => {
  const html = RENDER.B1(NEXT, HH).html;
  ["October 11", "Niles West", "Oakton"].forEach((s) =>
    assert.ok(html.indexOf(s) !== -1, "B1 is missing " + s));
  assert.ok(/final logistics/i.test(html), "B1 does not promise final logistics");
});

section("7. Feedback attribution");

t("the feedback link is tagged for this send, distinctly from Sept 29", () => {
  const url = RENDER.A2(NEXT, HH).html.match(/https:[^"]*clinic-feedback[^"]*/)[0];
  assert.ok(/source=sixday_oct5/.test(url), url);
  assert.ok(!/source=email\b/.test(url), "still carrying the Sept 29 tag");
});
t("the tag survives the feedback page's own parser and the API's validator", () => {
  const url = RENDER.A2(NEXT, HH).html.match(/https:[^"]*clinic-feedback[^"]*/)[0];
  const search = "?" + url.split("?")[1];
  const parsed = ((search.match(/[?&]source=([a-z0-9_-]{1,32})(?:&|$)/) || [])[1]) || "web";
  assert.strictEqual(parsed, "sixday_oct5");
  assert.ok(/^[a-z0-9_-]{1,32}$/.test(parsed), "the API would fall back to 'web'");
});

/* ====================================================================== */
section("8. The send gate refuses");

const GATE = require("../api/event-campaign.js");
const stageOf = (seg, att) => ({ segment: seg, attended: att, attendedClinicId: PAST });
function goodMatrix(cellKey, fp, count) {
  const cells = {
    A1: { segment: "rsvpd", attended: true, count: 1, fingerprint: "aaaa" },
    A2: { segment: "not_rsvpd", attended: true, count: 1, fingerprint: "bbbb" },
    B1: { segment: "rsvpd", attended: false, count: 1, fingerprint: "cccc" },
    B2: { segment: "not_rsvpd", attended: false, count: 2, fingerprint: "dddd" }
  };
  if (cellKey) { cells[cellKey].fingerprint = fp; cells[cellKey].count = count; }
  return { ok: true, cells, overlaps: [], missingFromCells: 0, notInMaster: 0,
           total: 5, unionSize: 5, masterAudience: 5, partitionOk: true };
}
const aud = (fp, count, dropped) => ({
  count, droppedBySender: dropped || {},
  fingerprintAsSheetSaw: fp, fingerprintAsDelivered: fp });

t("a clean partition with a matching fingerprint is allowed through", () => {
  const v = GATE.partitionVerdict(goodMatrix("A1", "f00d", 1), aud("f00d", 1),
    stageOf("rsvpd", true));
  assert.strictEqual(v, null);
});
t("a missing proof refuses", () => {
  const v = GATE.partitionVerdict(null, aud("f00d", 1), stageOf("rsvpd", true));
  assert.strictEqual(v.status, 502);
});
t("an OVERLAP refuses", () => {
  const m = goodMatrix("A1", "f00d", 1);
  m.overlaps = [{ pair: "A1/A2", shared: 1 }]; m.partitionOk = false;
  const v = GATE.partitionVerdict(m, aud("f00d", 1), stageOf("rsvpd", true));
  assert.strictEqual(v.status, 409);
  assert.ok(/not a clean partition/.test(v.payload.error));
});
t("a MISSING audience member refuses", () => {
  const m = goodMatrix("A1", "f00d", 1);
  m.missingFromCells = 1; m.partitionOk = false;
  assert.strictEqual(GATE.partitionVerdict(m, aud("f00d", 1), stageOf("rsvpd", true)).status, 409);
});
t("AUDIENCE DRIFT - same size, different people - refuses", () => {
  /* The case a count check cannot see: one household leaves, another joins. */
  const v = GATE.partitionVerdict(goodMatrix("A1", "f00d", 1), aud("beef", 1),
    stageOf("rsvpd", true));
  assert.strictEqual(v.status, 409);
  assert.ok(/no longer the one that was proved/.test(v.payload.error));
});
t("a count disagreement refuses", () => {
  const v = GATE.partitionVerdict(goodMatrix("A1", "f00d", 7), aud("f00d", 1),
    stageOf("rsvpd", true));
  assert.strictEqual(v.status, 409);
  assert.ok(/disagree/.test(v.payload.error));
});
t("the sender dropping an address the sheet kept refuses", () => {
  const v = GATE.partitionVerdict(goodMatrix("A1", "f00d", 1),
    aud("f00d", 1, { "placeholder-domain": 1 }), stageOf("rsvpd", true));
  assert.strictEqual(v.status, 409);
  assert.ok(/excluded addresses the sheet did not/.test(v.payload.error));
});
t("each stage maps to its own cell, so no two share a fingerprint check", () => {
  const seen = {};
  [["rsvpd", true, "A1"], ["not_rsvpd", true, "A2"],
   ["rsvpd", false, "B1"], ["not_rsvpd", false, "B2"]].forEach(([seg, att, key]) => {
    const m = goodMatrix(key, "same", 1);
    assert.strictEqual(GATE.partitionVerdict(m, aud("same", 1), stageOf(seg, att)), null,
      seg + "/" + att + " did not match " + key);
    assert.ok(!seen[key], "two stages mapped to " + key);
    seen[key] = true;
  });
  assert.strictEqual(Object.keys(seen).length, 4);
});
t("the confirmation phrase is different for every variant", () => {
  const phrases = ["sixdayAttendee", "sixdayAttendeeGoing", "sixdayCommunity", "sixdayGoing"]
    .map((s) => GATE.confirmPhrase(NEXT, s));
  assert.strictEqual(new Set(phrases).size, 4, phrases.join(" "));
});
t("the two fingerprint implementations agree", () => {
  /* Node's and Apps Script's, over the same input. If these ever diverge,
     every live send refuses - so it is worth knowing here instead. */
  const list = ["b@qa-fixture-not-real.org", "a@qa-fixture-not-real.org", "c@qa-fixture-not-real.org"];
  assert.strictEqual(GATE.fingerprint(list), SB.eaFingerprint_(list));
});

console.log("\n" + "=".repeat(60));
console.log(pass + " passed, " + fail + " failed");
if (fail) { console.log("\nFAILURES:\n" + failures.join("\n")); process.exit(1); }
