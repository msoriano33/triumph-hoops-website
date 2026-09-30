/* ==========================================================================
   JUNIOR WOLVES — EVENT COMMUNICATION LIFECYCLE SENDER
   --------------------------------------------------------------------------
   POST /api/event-campaign   { clinic, stage, mode, ... }

   One endpoint for every stage of every RSVP-based Junior Wolves event.
   Adding October 25 required no code here: `clinic` is a parameter.

   HOW THIS DIFFERS FROM api/campaign.js, DELIBERATELY
     The one-off campaigns take the audience as an argument and gate it on a
     hash compiled into the source. That is right for a single announcement a
     human has read end to end, and wrong for a lifecycle, because a family who
     RSVPs an hour before a reminder must drop out of it on their own.

     So here the CALLER CANNOT SUPPLY ADDRESSES AT ALL. The server asks the
     private Apps Script for the live audience for (clinic, stage) and sends to
     exactly that. There is nothing to redirect: no address in the request, no
     stored list, no hash to go stale.

     The human approval is still real, and still expires:
       - the confirmation phrase must name the clinic AND the stage, so an
         approval for one reminder cannot fire another
       - `expect` must equal the live count. If one family RSVPs between
         approval and send, the count moves, the send refuses, and a person
         looks again. Same spirit as the fingerprint gate, computed live.

   MODES
     plan     counts and exclusion reasons only. Sends nothing. No addresses.
     preview  renders one stage against a SYNTHETIC household. Sends nothing.
     test     one message, to an approved Triumph inbox only.
     live     phrase + matching count required. Slices, paced, idempotent.
   ========================================================================== */
"use strict";

const crypto = require("crypto");
const https = require("https");
const http = require("http");

const J = require("../lib/jw-email.js");
const EVENTS = require("../lib/event-emails.js");
const CLINICS = J.CLINICS;

const SHEETS_WEBHOOK_URL = process.env.SHEETS_WEBHOOK_URL || "";
const SHEETS_WEBHOOK_SECRET = process.env.SHEETS_WEBHOOK_SECRET || "";
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const MAIL_FROM = process.env.MAIL_FROM || "";
const RESEND_URL = "https://api.resend.com/emails";
const FROM_DISPLAY = "Niles West Junior Wolves";
const TIMEOUT_MS = 20000;

/* Resend caps at 10 requests/second. Eight per call with a pause between
   calls is the pacing that has held across three campaigns. */
const MAX_SLICE = 8;
const LIVE_CAP = 400;

/* A test may only ever reach Triumph's own inboxes. */
const ALLOWED_TEST = ["triumphhoopsacademy@gmail.com", "msoriano33@gmail.com"];

/* Invented households. A preview or a test must never carry real family
   data, and these names exist nowhere in the sheets. */
const SAMPLES = {
  younger: { athletes: [{ first: "Jordan", grade: "5th" }] },
  sixth:   { athletes: [{ first: "Riley",  grade: "6th" }] },
  seventh: { athletes: [{ first: "Casey",  grade: "7th" }] },
  older:   { athletes: [{ first: "Casey",  grade: "8th" }] },
  both:    { athletes: [{ first: "Jordan", grade: "6th" }, { first: "Casey", grade: "7th" }] },
  unknown: { athletes: [] }
};

function senderAddress() {
  const m = MAIL_FROM.match(/<([^>]+)>/);
  const addr = (m ? m[1] : MAIL_FROM).trim();
  return J.validEmail(addr) ? addr : "";
}

/* The phrase names both the event and the stage, so approving the 6-day
   reminder for Oct 11 cannot be replayed as the day-of email, or as Oct 25. */
function confirmPhrase(clinicId, stage) {
  return "SEND-JW-" + stage.toUpperCase() + "-" + clinicId;
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function getEcho(url, ms, hops) {
  return new Promise(function (resolve, reject) {
    const lib = url.indexOf("http://") === 0 ? http : https;
    const r = lib.get(url, { agent: false, timeout: ms }, function (res) {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && (hops || 0) < 3) {
        res.resume();
        return resolve(getEcho(new URL(res.headers.location, url).toString(), ms, (hops || 0) + 1));
      }
      let raw = "";
      res.setEncoding("utf8");
      res.on("data", function (c) { raw += c; });
      res.on("end", function () { resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, raw: raw }); });
      res.on("error", reject);
    });
    r.on("timeout", function () { r.destroy(new Error("echo timeout")); });
    r.on("error", reject);
  });
}

function postFresh(url, body, ms) {
  return new Promise(function (resolve, reject) {
    const lib = url.indexOf("http://") === 0 ? http : https;
    const r = lib.request(url, { method: "POST", agent: false, timeout: ms,
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } },
      function (res) {
        let raw = "";
        res.setEncoding("utf8");
        res.on("data", function (c) { raw += c; });
        res.on("end", function () {
          resolve({ status: res.statusCode, raw: raw,
                    location: res.headers.location ? new URL(res.headers.location, url).toString() : "" });
        });
        res.on("error", reject);
      });
    r.on("timeout", function () { r.destroy(new Error("post timeout")); });
    r.on("error", reject);
    r.end(body);
  });
}

/* The same fingerprint the Apps Script computes: the cell's addresses,
   sorted, newline-joined, SHA-256, first 32 hex characters. Sorting is what
   makes it independent of sheet order; hashing is what lets the two sides
   compare WHO is in a cell without an address crossing the wire in either
   direction. */
function fingerprint(emails) {
  return crypto.createHash("sha256")
    .update(emails.slice().sort().join("\n"), "utf8")
    .digest("hex").slice(0, 32);
}

/* All four cells at once, with the disjointness and union checks done in the
   sheet where all four sets exist simultaneously. Counts and fingerprints
   only - no addresses. */
async function liveMatrix(clinicId, attendedClinicId) {
  const posted = await postFresh(SHEETS_WEBHOOK_URL, JSON.stringify({
    kind: "event_audience_matrix", secret: SHEETS_WEBHOOK_SECRET,
    clinicId: clinicId, attendedClinicId: attendedClinicId
  }), TIMEOUT_MS);
  let raw = posted.raw;
  if (posted.location) {
    const echo = await getEcho(posted.location, TIMEOUT_MS, 0);
    raw = echo.raw || raw;
  }
  let out = null;
  try { out = JSON.parse(raw); } catch (e) { return null; }
  return (out && out.ok === true && out.cells) ? out : null;
}

/* THE GATE, AS A PURE FUNCTION.

   Kept separate from the handler and exported so tests/segmentation.test.js
   can drive every refusal path with synthetic data - an overlap, a dropped
   household, a drifted fingerprint, a disagreeing count. A gate whose failure
   branches have never executed is a gate nobody has tested; these have.

   Returns null when the send may proceed, or { status, payload } to refuse. */
function partitionVerdict(matrix, aud, stage) {
  if (!matrix) {
    return { status: 502, payload: { ok: false,
      error: "the four-way audience proof could not be computed; nothing was sent" } };
  }
  const cellKey = stage.attended
    ? (stage.segment === "rsvpd" ? "A1" : "A2")
    : (stage.segment === "rsvpd" ? "B1" : "B2");
  const cell = matrix.cells[cellKey];

  if (!matrix.partitionOk) {
    return { status: 409, payload: { ok: false,
      error: "the four audiences are not a clean partition; nothing was sent",
      overlaps: matrix.overlaps, missingFromCells: matrix.missingFromCells,
      notInMaster: matrix.notInMaster, total: matrix.total,
      unionSize: matrix.unionSize, masterAudience: matrix.masterAudience } };
  }
  if (!cell) {
    return { status: 500, payload: { ok: false, error: "stage does not map to a known cell" } };
  }
  if (Object.keys(aud.droppedBySender || {}).length) {
    return { status: 409, payload: { ok: false,
      error: "the sender excluded addresses the sheet did not; nothing was sent",
      droppedBySender: aud.droppedBySender } };
  }
  if (aud.fingerprintAsSheetSaw !== cell.fingerprint ||
      aud.fingerprintAsDelivered !== cell.fingerprint) {
    return { status: 409, payload: { ok: false,
      error: "this audience is no longer the one that was proved disjoint; nothing was sent",
      cell: cellKey, provedFingerprint: cell.fingerprint,
      liveFingerprint: aud.fingerprintAsDelivered } };
  }
  if (cell.count !== aud.count) {
    return { status: 409, payload: { ok: false,
      error: "the cell count and the fetched audience disagree; nothing was sent",
      cell: cellKey, proved: cell.count, fetched: aud.count } };
  }
  return null;
}

/* Live audience, straight from the sheet. Never cached, never stored. */
async function liveAudience(clinicId, segment, attended, attendedClinicId) {
  const ask = {
    kind: "event_audience", secret: SHEETS_WEBHOOK_SECRET,
    clinicId: clinicId, segment: segment
  };
  if (attended === true || attended === false) {
    ask.attended = attended;
    ask.attendedClinicId = attendedClinicId;
  }
  const posted = await postFresh(SHEETS_WEBHOOK_URL, JSON.stringify(ask), TIMEOUT_MS);
  let raw = posted.raw;
  if (posted.location) {
    const echo = await getEcho(posted.location, TIMEOUT_MS, 0);
    raw = echo.raw || raw;
  }
  let out = null;
  try { out = JSON.parse(raw); } catch (e) { return null; }
  if (!out || out.ok !== true || !Array.isArray(out.households)) return null;

  /* Belt and braces: the Apps Script already excludes these, but the rule
     lives in lib/jw-email.js and this is the last gate before a send. */
  const kept = [], dropped = {};
  out.households.forEach(function (h) {
    const check = J.sendable(h.email);
    if (!check.ok) { dropped[check.reason] = (dropped[check.reason] || 0) + 1; return; }
    kept.push({ email: check.email, athletes: Array.isArray(h.athletes) ? h.athletes : [] });
  });
  kept.sort(function (a, b) { return a.email < b.email ? -1 : 1; });
  /* Two fingerprints, deliberately. `asDelivered` is who would actually be
     emailed; `asSheetSaw` is the set the Apps Script fingerprinted and proved
     disjoint. They differ only if the two copies of the exclusion rules
     disagree, and a live send refuses when they do - a rule that has drifted
     apart is exactly the condition under which a partition proof stops
     describing what is about to happen. */
  out.fingerprintAsSheetSaw = fingerprint(out.households.map(function (h) { return h.email; }));
  out.households = kept;
  out.count = kept.length;
  out.fingerprintAsDelivered = fingerprint(kept.map(function (h) { return h.email; }));
  out.droppedBySender = dropped;
  return out;
}

async function sendOne(to, subject, html, text, key) {
  const from = senderAddress();
  const headers = {
    Authorization: "Bearer " + RESEND_API_KEY,
    "Content-Type": "application/json"
  };
  if (key) headers["Idempotency-Key"] = key;
  const response = await fetch(RESEND_URL, {
    method: "POST", headers,
    body: JSON.stringify({
      from: FROM_DISPLAY + " <" + from + ">",
      to: [to], reply_to: J.MAIL_TO, subject, text, html
    })
  });
  const raw = await response.text().catch(function () { return ""; });
  if (!response.ok) return { ok: false, status: response.status, detail: raw.slice(0, 200) };
  let data = {};
  try { data = JSON.parse(raw); } catch (e) { /* id is a nicety */ }
  return { ok: true, id: data.id || null };
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  }

  let body;
  try { body = await readBody(req); }
  catch (e) { return res.status(400).json({ ok: false, error: "Could not read request." }); }

  const clinicId = String(body.clinic || "").trim();
  const stageName = String(body.stage || "").trim();
  const mode = ["plan", "preview", "test", "live"].indexOf(String(body.mode)) !== -1
    ? String(body.mode) : "plan";

  const clinic = CLINICS.clinicById(clinicId);
  if (!clinic) return res.status(400).json({ ok: false, error: "unknown clinic" });
  const stage = EVENTS.stage(stageName);
  if (!stage) return res.status(400).json({ ok: false, error: "unknown stage" });

  /* The photo, when a campaign was briefed with one. Absolute https only.
     If it is supplied, the renderer refuses to produce a body without it. */
  let photo = null;
  if (body.photo && body.photo.url) {
    if (!/^https:\/\/[^\s"']+$/.test(String(body.photo.url))) {
      return res.status(400).json({ ok: false, error: "photo.url must be an absolute https URL" });
    }
    photo = { url: String(body.photo.url), alt: String(body.photo.alt || ""),
              caption: String(body.photo.caption || "") };
  }

  const identity = {
    clinic: clinicId,
    clinicLabel: CLINICS.longDate(clinicId),
    stage: stageName,
    stageLabel: stage.label,
    segment: stage.segment,
    attended: (stage.attended === true || stage.attended === false) ? stage.attended : null,
    attendedClinicId: stage.attendedClinicId || null,
    offsetDays: stage.offsetDays,
    from: senderAddress() ? FROM_DISPLAY + " <" + senderAddress() + ">" : null,
    reply_to: J.MAIL_TO,
    confirmPhrase: confirmPhrase(clinicId, stageName),
    entranceVerified: !!clinic.entrance,
    photoRequested: !!photo
  };

  /* ------------------------------------------------------------ PREVIEW -- */
  if (mode === "preview") {
    const key = Object.prototype.hasOwnProperty.call(SAMPLES, String(body.sample))
      ? String(body.sample) : "younger";
    let built;
    try { built = stage.render(clinicId, SAMPLES[key], photo); }
    catch (e) { return res.status(500).json({ ok: false, error: e.message }); }
    return res.status(200).json({
      ok: true, mode, identity, sample: key,
      subject: built.subject, bytes: built.html.length, images: built.images, sent: 0
    });
  }

  /* --------------------------------------------------------------- PLAN -- */
  if (mode === "plan") {
    if (!SHEETS_WEBHOOK_URL || !SHEETS_WEBHOOK_SECRET) {
      return res.status(503).json({ ok: false, error: "audience source not configured" });
    }
    let aud;
    try { aud = await liveAudience(clinicId, stage.segment, stage.attended, stage.attendedClinicId); }
    catch (e) { return res.status(502).json({ ok: false, error: "audience unavailable" }); }
    if (!aud) return res.status(502).json({ ok: false, error: "audience unavailable" });

    /* For a stage with an attendance dimension, planning also returns the
       whole 2x2 and its proof, so the partition is something a person can
       read and approve BEFORE the send rather than something the sender
       asserts at the moment it matters least. */
    let matrix = null;
    if (stage.attendedClinicId) {
      try { matrix = await liveMatrix(clinicId, stage.attendedClinicId); }
      catch (e) { matrix = null; }
    }

    /* Counts and reasons only. No address ever leaves this endpoint. */
    const withAthletes = aud.households.filter(function (h) { return h.athletes.length > 0; }).length;
    const renderable = aud.households.filter(function (h) {
      return J.groupBySession(clinicId, h.athletes).length > 0;
    }).length;
    return res.status(200).json({
      ok: true, mode, identity,
      count: aud.count,
      rsvpdHouseholds: aud.rsvpdCount,
      masterHouseholds: aud.masterCount,
      withKnownAthletes: withAthletes,
      withResolvableSession: renderable,
      excludedBySheet: aud.excluded,
      excludedBySender: aud.droppedBySender,
      fingerprint: aud.fingerprintAsDelivered,
      attendanceRows: aud.attendanceRows || null,
      attendedHouseholds: aud.attendedHouseholds != null ? aud.attendedHouseholds : null,
      matrix: matrix ? {
        cells: matrix.cells, total: matrix.total, unionSize: matrix.unionSize,
        masterAudience: matrix.masterAudience, overlaps: matrix.overlaps,
        missingFromCells: matrix.missingFromCells, notInMaster: matrix.notInMaster,
        partitionOk: matrix.partitionOk, computedAt: matrix.computedAt
      } : null,
      computedAt: aud.computedAt,
      confirmPhrase: identity.confirmPhrase
    });
  }

  if (!RESEND_API_KEY) return res.status(500).json({ ok: false, error: "RESEND_API_KEY is not set." });
  if (!senderAddress()) return res.status(500).json({ ok: false, error: "MAIL_FROM is not a usable verified sender." });

  /* --------------------------------------------------------------- TEST -- */
  if (mode === "test") {
    const to = J.normEmail(body.to);
    if (ALLOWED_TEST.indexOf(to) === -1) {
      return res.status(400).json({ ok: false, error: "test recipient not allowed" });
    }
    const key = Object.prototype.hasOwnProperty.call(SAMPLES, String(body.sample))
      ? String(body.sample) : "younger";
    let built;
    try { built = stage.render(clinicId, SAMPLES[key], photo); }
    catch (e) { return res.status(500).json({ ok: false, error: e.message }); }
    const text = stage.text(clinicId, SAMPLES[key]);
    const result = await sendOne(to, "TEST — " + built.subject, built.html, text, null);
    console.log("[event-campaign] TEST", clinicId, stageName, key, result.ok ? "ok" : result.status);
    return res.status(result.ok ? 200 : 502).json({
      ok: result.ok, mode, identity, sample: key,
      subject: "TEST — " + built.subject, images: built.images, result
    });
  }

  /* --------------------------------------------------------------- LIVE -- */
  if (!SHEETS_WEBHOOK_URL || !SHEETS_WEBHOOK_SECRET) {
    return res.status(503).json({ ok: false, error: "audience source not configured" });
  }
  if (body.confirm !== identity.confirmPhrase) {
    return res.status(400).json({ ok: false, error: "missing or wrong confirmation phrase" });
  }
  if (!Number.isInteger(body.expect)) {
    return res.status(400).json({ ok: false, error: "expect (approved audience size) is required" });
  }

  let aud;
  try { aud = await liveAudience(clinicId, stage.segment, stage.attended, stage.attendedClinicId); }
  catch (e) { return res.status(502).json({ ok: false, error: "audience unavailable; nothing sent" }); }
  if (!aud) return res.status(502).json({ ok: false, error: "audience unavailable; nothing sent" });

  /* ------------------------------------------------------- PARTITION GATE --
     For a four-way stage, the count gate below is necessary but nowhere near
     sufficient. It answers "is this cell the size I approved?" and says
     nothing about whether the four cells still tile the audience: a bug that
     put one household in both A1 and A2 would sail through four count checks
     and send that family two different emails.

     So before anything is sent, the whole 2x2 is recomputed in the sheet and
     must come back provably disjoint and complete, and THIS cell's addresses
     must hash to the fingerprint the sheet proved. Every failure below
     refuses; none of them degrade to a warning. */
  let matrix = null;
  if (stage.attendedClinicId) {
    try { matrix = await liveMatrix(clinicId, stage.attendedClinicId); }
    catch (e) { matrix = null; }

    const verdict = partitionVerdict(matrix, aud, stage);
    if (verdict) {
      console.error("[event-campaign] LIVE refused -", verdict.payload.error,
                    clinicId, stageName);
      return res.status(verdict.status).json(verdict.payload);
    }
  }

  /* The gate. Deliberately exact: a single new RSVP moves the count and stops
     the send until a person has looked again. */
  if (aud.count !== body.expect) {
    console.error("[event-campaign] LIVE refused - audience moved", clinicId, stageName,
                  aud.count, "vs approved", body.expect);
    return res.status(409).json({
      ok: false,
      error: "the live audience no longer matches the approved size; nothing was sent",
      approved: body.expect, live: aud.count, computedAt: aud.computedAt
    });
  }
  if (aud.count > LIVE_CAP) return res.status(400).json({ ok: false, error: "audience exceeds the cap" });

  const offset = Number.isInteger(body.offset) ? body.offset : 0;
  const limit = Math.min(Number.isInteger(body.limit) ? body.limit : MAX_SLICE, MAX_SLICE);
  if (offset < 0 || offset >= aud.count) {
    return res.status(400).json({ ok: false, error: "offset out of range" });
  }
  const slice = aud.households.slice(offset, offset + Math.max(1, limit));

  const results = [];
  for (let i = 0; i < slice.length; i++) {
    const h = slice[i];
    let built, text;
    try {
      built = stage.render(clinicId, h, photo);
      text = stage.text(clinicId, h);
    } catch (e) {
      results.push({ index: offset + i, ok: false, status: 500, detail: "render: " + e.message });
      continue;
    }
    /* Scoped to campaign + clinic + stage + address, so re-running a slice
       after a timeout cannot deliver a second copy, and the Oct 25 run of the
       same stage is a different message. */
    const key = "jw-" + stageName + "-" + clinicId + "-" +
                crypto.createHash("sha256").update(h.email, "utf8").digest("hex").slice(0, 32);
    const r = await sendOne(h.email, built.subject, built.html, text, key);
    /* By position, never by address. */
    results.push({ index: offset + i, ok: r.ok, id: r.id || null,
                   status: r.ok ? 200 : r.status, detail: r.ok ? undefined : r.detail });
  }

  const accepted = results.filter(function (r) { return r.ok; }).length;
  console.log("[event-campaign] LIVE", clinicId, stageName,
              "slice " + offset + "-" + (offset + slice.length - 1),
              "| accepted " + accepted + "/" + slice.length);

  return res.status(200).json({
    ok: true, mode, identity,
    audienceTotal: aud.count,
    audienceVerified: true,
    partitionVerified: matrix ? matrix.partitionOk : null,
    audienceFingerprint: aud.fingerprintAsDelivered,
    computedAt: aud.computedAt,
    offset, requested: slice.length, accepted,
    failures: results.filter(function (r) { return !r.ok; }),
    messageIds: results.filter(function (r) { return r.ok; }).map(function (r) { return r.id; })
  });
};

module.exports.confirmPhrase = confirmPhrase;
module.exports.partitionVerdict = partitionVerdict;
module.exports.fingerprint = fingerprint;
module.exports.SAMPLES = SAMPLES;
module.exports.MAX_SLICE = MAX_SLICE;
