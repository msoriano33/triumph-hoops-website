/* ==========================================================================
   JUNIOR WOLVES — CLINIC RSVP
   --------------------------------------------------------------------------
   POST /api/clinic-rsvp  ->  Google Sheet tab "CLINIC RSVP"

   A clinic RSVP is NOT tryout registration. This endpoint is deliberately
   separate from api/inquiry.js: it never writes MASTER REGISTRATIONS, never
   touches tryout registration code, and sends no email. A family may RSVP
   for a clinic, register for tryouts, do both, or do neither.

   Same Apps Script web app and the same server-side credentials the
   registration form already uses (SHEETS_WEBHOOK_URL / SHEETS_WEBHOOK_SECRET).
   Neither is ever sent to the browser. The script routes on `kind`.

   Clinic schedule comes from assets/js/clinics.js — the same file the RSVP
   page reads — so the page and the server cannot disagree.
   ========================================================================== */

"use strict";

const crypto = require("crypto");
const https = require("https");
const http = require("http");
const CLINICS = require("../assets/js/clinics.js");

const SHEETS_WEBHOOK_URL = process.env.SHEETS_WEBHOOK_URL || "";
const SHEETS_WEBHOOK_SECRET = process.env.SHEETS_WEBHOOK_SECRET || "";

/* Measured live 2026-09-22 (per-leg timing is returned in `timing`): the
   Apps Script POST answers its 302 in ~2-3 s, and the echo GET normally takes
   <1 s, but a GET on a reused keep-alive socket sometimes never answers. The
   GET now runs on a fresh socket with a 3.5 s per-try limit and retries inside
   this budget (see getEcho). If the whole budget still runs out, ask again with
   the SAME rsvpId: the script is idempotent on it and serialised by its lock,
   so the second call can never add a second row. 12 s + 8 s stays inside the
   page's 30 s client timeout. */
const SHEET_TIMEOUT_MS = 12000;
const SHEET_CONFIRM_MS = 8000;

function clean(value, max) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim().slice(0, max || 200);
}

function validEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e); }

/* "YYYY-MM-DD HH:MM" in Chicago, so "has this clinic ended?" is a plain
   string comparison that does not depend on the server's time zone. */
function chicagoNow() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false
  }).formatToParts(new Date()).reduce((m, p) => { m[p.type] = p.value; return m; }, {});
  const hour = parts.hour === "24" ? "00" : parts.hour;
  return parts.year + "-" + parts.month + "-" + parts.day + " " + hour + ":" + parts.minute;
}

function openClinic(id) {
  const clinic = CLINICS.clinics.find((c) => c.id === id);
  if (!clinic) return null;
  if (clinic.id + " " + clinic.end <= chicagoNow()) return null;
  return clinic;
}

function validate(f) {
  if (!f.player_first) return "Player first name is required.";
  if (!f.player_last) return "Player last name is required.";
  if (CLINICS.grades.indexOf(f.grade) === -1) return "Please choose your player's grade.";
  if (CLINICS.ages.indexOf(Number(f.age)) === -1) return "Please choose your player's age.";
  if (!f.school) return "School is required.";
  if (!f.parent_name) return "Parent / guardian name is required.";
  if (!validEmail(f.parent_email)) return "A valid parent email is required.";
  if (!openClinic(f.clinic)) return "Please choose an upcoming clinic date.";
  return null;
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

/* GET the Apps Script echo URL on a FRESH connection (agent:false). Measured
   2026-09-22: the POST leg answers its 302 in ~2-3 s, but a pooled keep-alive
   GET to the echo host sometimes never gets headers back. A new socket per
   attempt, a short per-attempt timeout and a retry fix that. */
function getEcho(url, ms, hops) {
  return new Promise(function (resolve, reject) {
    const lib = url.indexOf("http://") === 0 ? http : https;
    const req = lib.get(url, { agent: false, timeout: ms }, function (res) {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && (hops || 0) < 3) {
        res.resume();
        return resolve(getEcho(new URL(res.headers.location, url).toString(), ms, (hops || 0) + 1));
      }
      let raw = "";
      res.setEncoding("utf8");
      res.on("data", function (c) { raw += c; });
      res.on("end", function () { resolve({ status: res.statusCode, ok: res.statusCode >= 200 && res.statusCode < 300, raw: raw }); });
      res.on("error", reject);
    });
    req.on("timeout", function () { req.destroy(Object.assign(new Error("echo timeout"), { name: "AbortError" })); });
    req.on("error", reject);
  });
}

/* POST on a fresh socket too, for the same reason as getEcho. Returns the
   302's Location without following it. */
function postFresh(url, body, ms) {
  return new Promise(function (resolve, reject) {
    const lib = url.indexOf("http://") === 0 ? http : https;
    const req = lib.request(url, { method: "POST", agent: false, timeout: ms,
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } }, function (res) {
      let raw = "";
      res.setEncoding("utf8");
      res.on("data", function (c) { raw += c; });
      res.on("end", function () {
        resolve({ status: res.statusCode, ok: res.statusCode >= 200 && res.statusCode < 300,
                  location: res.headers.location ? new URL(res.headers.location, url).toString() : "", raw: raw });
      });
      res.on("error", reject);
    });
    req.on("timeout", function () { req.destroy(Object.assign(new Error("post timeout"), { name: "AbortError" })); });
    req.on("error", reject);
    req.end(body);
  });
}

async function postOnce(payload, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  const t0 = Date.now();
  const trace = { postMs: 0, postStatus: 0, getMs: 0, getStatus: 0, getTries: 0 };
  try {
    /* Apps Script answers a POST with a 302 to a one-time echo URL. Follow it
       by hand so each leg is timed and the GET can be retried. */
    const response = await postFresh(SHEETS_WEBHOOK_URL, JSON.stringify(payload), Math.min(7000, timeoutMs));
    trace.postMs = Date.now() - t0; trace.postStatus = response.status;
    const location = response.location;
    if (!(response.status >= 300 && response.status < 400 && location)) {
      return parse(response.raw, response, payload, trace);
    }
    const t1 = Date.now();
    let lastErr = null;
    while (Date.now() < deadline - 300) {
      trace.getTries++;
      try {
        const echo = await getEcho(location, Math.min(3500, deadline - Date.now()));
        trace.getStatus = echo.status; trace.getMs = Date.now() - t1;
        return parse(echo.raw, echo, payload, trace);
      } catch (e) { lastErr = e; }
    }
    trace.getMs = Date.now() - t1;
    return { logged: false, timedOut: true, error: (lastErr && lastErr.name) || "AbortError", trace: trace };
  } catch (err) {
    return { logged: false, timedOut: err.name === "AbortError", error: err.name, trace: trace };
  }
}

function parse(raw, response, payload, trace) {
  let data = {};
  try { data = JSON.parse(raw); } catch (e) { /* non-JSON = failure */ }
  if (!response.ok || !data.ok) return { logged: false, timedOut: false, error: "sheet " + response.status, trace: trace };
  return { logged: true, row: data.row, duplicate: !!data.duplicate, trace: trace,
           reactivated: !!data.reactivated, rsvpId: data.rsvpId || payload.rsvpId };
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ delivered: false, error: "Method not allowed." });
  }

  let body;
  try { body = await readBody(req); }
  catch (err) { return res.status(400).json({ delivered: false, error: "Could not read the form." }); }

  /* Honeypot: a real family never fills this. Answer like a success so a bot
     learns nothing, and write nothing. */
  if (clean(body.hp_company)) return res.status(200).json({ delivered: true });

  const f = {
    player_first: clean(body.player_first, 60),
    player_last: clean(body.player_last, 60),
    grade: clean(body.grade, 8),
    age: clean(body.age, 3),
    school: clean(body.school, 120),
    parent_name: clean(body.parent_name, 120),
    parent_email: clean(body.parent_email, 200).toLowerCase(),
    clinic: clean(body.clinic, 10)
  };

  const problem = validate(f);
  if (problem) return res.status(400).json({ delivered: false, error: problem });

  if (!SHEETS_WEBHOOK_URL || !SHEETS_WEBHOOK_SECRET) {
    console.error("[clinic-rsvp] sheet webhook not configured");
    return res.status(503).json({ delivered: false, error: "RSVP is temporarily unavailable." });
  }

  const rsvpId = "CR-2026-" + crypto.randomBytes(4).toString("hex").toUpperCase();
  const payload = {
    secret: SHEETS_WEBHOOK_SECRET,
    kind: "clinic_rsvp",
    rsvpId,
    submittedAt: new Date().toISOString(),
    clinicId: f.clinic,
    clinicIds: CLINICS.clinics.map((c) => c.id),
    playerFirst: f.player_first,
    playerLast: f.player_last,
    playerFull: f.player_first + " " + f.player_last,
    grade: f.grade,
    age: Number(f.age),
    school: f.school,
    parentName: f.parent_name,
    parentEmail: f.parent_email
  };

  const t0 = Date.now();
  let result = await postOnce(payload, SHEET_TIMEOUT_MS);
  const firstMs = Date.now() - t0, firstErr = result.logged ? "" : result.error, firstTrace = result.trace;
  if (!result.logged && result.timedOut) result = await postOnce(payload, SHEET_CONFIRM_MS);
  const timing = { firstMs: firstMs, firstErr: firstErr, totalMs: Date.now() - t0, firstTrace: firstTrace, trace: result.trace };

  /* Log by id only — never a family's name or address. */
  console.log("[clinic-rsvp]", rsvpId, f.clinic,
              result.logged ? (result.duplicate && result.rsvpId !== rsvpId ? "duplicate" : "logged") : ("FAILED " + result.error), JSON.stringify(timing));

  if (!result.logged) {
    /* Safe to ask the family to retry: a second submission for the same
       player, clinic and parent email is recognised as a duplicate. */
    return res.status(502).json({ delivered: false,
      error: "We couldn't save your RSVP just now. Please try again in a moment.",
      reason: String(result.error || "").slice(0, 40), timing: timing });
  }

  /* A confirm call that finds OUR OWN rsvpId is this request's write, not an
     earlier RSVP — report it as new. Only a different rsvpId means the family
     had already RSVP'd. */
  const alreadyListed = !!result.duplicate && result.rsvpId !== rsvpId;
  return res.status(200).json({ delivered: true, rsvpId: result.rsvpId,
    duplicate: alreadyListed, reactivated: result.reactivated, clinic: f.clinic, timing: timing });
};

module.exports.chicagoNow = chicagoNow;
module.exports.openClinic = openClinic;
module.exports.validate = validate;
