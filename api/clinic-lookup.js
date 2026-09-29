/* ==========================================================================
   JUNIOR WOLVES — CLINIC RSVP FUNNEL: ATHLETE LOOKUP
   --------------------------------------------------------------------------
   Read-only. Given an athlete's first name, last name and grade, asks the
   private Apps Script whether exactly one registered athlete matches, and
   whether that athlete already has an RSVP for the clinic.

   WHAT CROSSES THE WIRE
     Back to the browser: the athlete's display name, their grade, their
     session for this clinic, whether an age is already on file, whether they
     are already RSVPed, and an opaque token. Nothing else. School, parent
     name, parent email and the spreadsheet row never leave the server - the
     RSVP writer reads them again from MASTER REGISTRATIONS at confirm time.

   WHY IT CANNOT BE USED TO MINE THE DATABASE
     A caller must already know an athlete's exact first name, last name and
     grade to learn anything, and all they learn back is what they typed plus
     a session time. Wrong or partial guesses return 'none' with no hint.
   ========================================================================== */
"use strict";

const https = require("https");
const http = require("http");
const CLINICS = require("../assets/js/clinics.js");

const SHEETS_WEBHOOK_URL = process.env.SHEETS_WEBHOOK_URL || "";
const SHEETS_WEBHOOK_SECRET = process.env.SHEETS_WEBHOOK_SECRET || "";
const TIMEOUT_MS = 10000;

function clean(v, max) {
  return String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max || 80);
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

async function askScript(payload) {
  const posted = await postFresh(SHEETS_WEBHOOK_URL, JSON.stringify(payload), TIMEOUT_MS);
  let raw = posted.raw;
  if (posted.location) {
    const echo = await getEcho(posted.location, TIMEOUT_MS, 0);
    raw = echo.raw || raw;
  }
  try { return JSON.parse(raw); } catch (e) { return null; }
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  }
  if (!SHEETS_WEBHOOK_URL || !SHEETS_WEBHOOK_SECRET) {
    return res.status(500).json({ ok: false, error: "Lookup is not configured." });
  }

  let body;
  try { body = await readBody(req); }
  catch (e) { return res.status(400).json({ ok: false, error: "Could not read request." }); }

  const clinicId = clean(body.clinic, 12);
  const first = clean(body.first, 60);
  const last = clean(body.last, 60);
  const grade = clean(body.grade, 8);

  const clinic = CLINICS.clinicById(clinicId);
  if (!clinic) return res.status(400).json({ ok: false, error: "Unknown clinic." });
  if (CLINICS.grades.indexOf(grade) === -1) {
    return res.status(400).json({ ok: false, error: "Please choose a grade." });
  }
  if (!first || !last) {
    return res.status(400).json({ ok: false, error: "Please enter the athlete’s first and last name." });
  }

  let out;
  try {
    out = await askScript({ kind: "clinic_lookup", secret: SHEETS_WEBHOOK_SECRET,
                            clinicId: clinicId, first: first, last: last, grade: grade });
  } catch (e) {
    /* A lookup failure must never block a family: the caller falls back to
       the full RSVP form rather than showing an error. */
    return res.status(200).json({ ok: true, match: "unavailable" });
  }
  if (!out || out.ok !== true) return res.status(200).json({ ok: true, match: "unavailable" });

  const session = CLINICS.sessionFor(clinicId, grade);
  const payload = {
    ok: true,
    match: out.match,
    clinic: { id: clinic.id, weekday: clinic.weekday, date: clinic.date },
    session: session ? { id: session.id, label: session.label, time: session.time } : null
  };

  if (out.match === "one") {
    /* Deliberately narrow. Adding a field here puts it in the browser. */
    payload.athlete = { first: out.athlete.first, last: out.athlete.last, grade: out.athlete.grade };
    payload.token = out.token;
    payload.needsAge = !out.knownAge;
    payload.alreadyRsvpd = !!out.alreadyRsvpd;
  }
  return res.status(200).json(payload);
};
