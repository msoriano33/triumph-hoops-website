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
const CLINICS = require("../assets/js/clinics.js");

const SHEETS_WEBHOOK_URL = process.env.SHEETS_WEBHOOK_URL || "";
const SHEETS_WEBHOOK_SECRET = process.env.SHEETS_WEBHOOK_SECRET || "";

/* Same shape as the registration path, which measured the real Vercel ->
   Apps Script round trip at ~4-9 s. If the first wait expires, ask again with
   the SAME rsvpId: the script is idempotent on it, so the second call reports
   the truth without any risk of a second row. */
const SHEET_TIMEOUT_MS = 6500;
const SHEET_CONFIRM_MS = 2500;

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

async function postOnce(payload, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(SHEETS_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      redirect: "follow",
      signal: controller.signal
    });
    const raw = await response.text();
    let data = {};
    try { data = JSON.parse(raw); } catch (e) { /* non-JSON = failure */ }
    if (!response.ok || !data.ok) return { logged: false, timedOut: false, error: "sheet " + response.status };
    return { logged: true, row: data.row, duplicate: !!data.duplicate,
             reactivated: !!data.reactivated, rsvpId: data.rsvpId || payload.rsvpId };
  } catch (err) {
    return { logged: false, timedOut: err.name === "AbortError", error: err.name };
  } finally {
    clearTimeout(timer);
  }
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

  let result = await postOnce(payload, SHEET_TIMEOUT_MS);
  if (!result.logged && result.timedOut) result = await postOnce(payload, SHEET_CONFIRM_MS);

  /* Log by id only — never a family's name or address. */
  console.log("[clinic-rsvp]", rsvpId, f.clinic,
              result.logged ? (result.duplicate ? "duplicate" : "logged") : ("FAILED " + result.error));

  if (!result.logged) {
    /* Safe to ask the family to retry: a second submission for the same
       player, clinic and parent email is recognised as a duplicate. */
    return res.status(502).json({ delivered: false,
      error: "We couldn't save your RSVP just now. Please try again in a moment." });
  }

  return res.status(200).json({ delivered: true, rsvpId: result.rsvpId,
    duplicate: result.duplicate, reactivated: result.reactivated, clinic: f.clinic });
};

module.exports.chicagoNow = chicagoNow;
module.exports.openClinic = openClinic;
module.exports.validate = validate;
