/* ==========================================================================
   JUNIOR WOLVES — CLINIC FEEDBACK
   --------------------------------------------------------------------------
   POST /api/clinic-feedback  ->  Google Sheet tab "CLINIC FEEDBACK"

   Six questions. No athlete name, no grade, no school, no parent name. The
   only identifier that can be stored is an email address the parent chose to
   give so we can reply, and it is optional.

   Separate from every other endpoint on purpose: this one cannot write
   MASTER REGISTRATIONS or CLINIC RSVP, and nothing it does can fail an RSVP.

   GET /api/clinic-feedback?clinic=YYYY-MM-DD returns nothing. Summary reads
   require the shared secret and are POSTed, so the responses are never
   readable from a browser.
   ========================================================================== */
"use strict";

const crypto = require("crypto");
const https = require("https");
const http = require("http");
const CLINICS = require("../assets/js/clinics.js");

const SHEETS_WEBHOOK_URL = process.env.SHEETS_WEBHOOK_URL || "";
const SHEETS_WEBHOOK_SECRET = process.env.SHEETS_WEBHOOK_SECRET || "";
const TIMEOUT_MS = 12000;

const FEEDBACK_ID_RE = /^CF-2026-[0-9A-F]{8}$/;
const LEVELS = ["Too easy", "About right", "Too advanced"];
const SESSIONS = ["3rd–6th Grade", "7th–8th Grade", "Not sure"];

function clean(v, max) {
  return String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max || 200);
}
function longText(v, max) {
  return String(v == null ? "" : v).trim().slice(0, max || 1200);
}
function score(v) {
  const n = parseInt(v, 10);
  return n >= 1 && n <= 5 ? n : 0;
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

function validate(f) {
  if (!CLINICS.clinicById(f.clinicId)) return "Please choose which clinic you are writing about.";
  if (SESSIONS.indexOf(f.session) === -1) return "Please choose which session your athlete attended.";
  if (!f.overall) return "Please give an overall rating.";
  if (LEVELS.indexOf(f.level) === -1) return "Please tell us how the instruction level felt.";
  if (!f.recommend) return "Please answer the recommendation question.";
  if (f.replyEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.replyEmail)) {
    return "That email address does not look right — or leave it blank.";
  }
  return null;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ delivered: false, error: "Method not allowed." });
  }
  if (!SHEETS_WEBHOOK_URL || !SHEETS_WEBHOOK_SECRET) {
    return res.status(503).json({ delivered: false, error: "Feedback is temporarily unavailable." });
  }

  let body;
  try { body = await readBody(req); }
  catch (e) { return res.status(400).json({ delivered: false, error: "Could not read the form." }); }

  /* Honeypot. Answer like a success and write nothing. */
  if (clean(body.hp_company)) return res.status(200).json({ delivered: true });

  /* Summary read. Secret-gated and POSTed, so it is not reachable from a page. */
  if (body.mode === "summary") {
    if (String(body.secret || "") !== SHEETS_WEBHOOK_SECRET) {
      return res.status(403).json({ ok: false, error: "Not allowed." });
    }
    const out = await askScript({ kind: "clinic_feedback_summary", secret: SHEETS_WEBHOOK_SECRET,
                                  clinicId: clean(body.clinic, 12) });
    if (!out || out.ok !== true) return res.status(502).json({ ok: false, error: "Summary unavailable." });
    return res.status(200).json(out);
  }

  const f = {
    clinicId: clean(body.clinic, 12),
    session: clean(body.session, 24),
    overall: score(body.overall),
    level: clean(body.level, 24),
    recommend: score(body.recommend),
    worked: longText(body.worked, 1200),
    change: longText(body.change, 1200),
    replyEmail: clean(body.reply_email, 200).toLowerCase(),
    source: /^[a-z0-9_-]{1,32}$/.test(String(body.source || "")) ? String(body.source) : "web"
  };

  const problem = validate(f);
  if (problem) return res.status(400).json({ delivered: false, error: problem });

  const feedbackId = FEEDBACK_ID_RE.test(String(body.feedback_id || ""))
    ? String(body.feedback_id)
    : "CF-2026-" + crypto.randomBytes(4).toString("hex").toUpperCase();

  let out = null;
  try {
    out = await askScript({ kind: "clinic_feedback", secret: SHEETS_WEBHOOK_SECRET,
                            feedbackId: feedbackId, clinicId: f.clinicId, session: f.session,
                            overall: f.overall, level: f.level, recommend: f.recommend,
                            worked: f.worked, change: f.change, replyEmail: f.replyEmail,
                            source: f.source });
  } catch (e) {
    /* Outcome unknown. The page re-asks with the SAME id, which cannot
       double-write, so say pending rather than failed. */
    console.log("[clinic-feedback]", feedbackId, "PENDING", e && e.name);
    return res.status(202).json({ delivered: false, pending: true, feedbackId: feedbackId });
  }

  /* Never log the answers themselves - only that one arrived. */
  console.log("[clinic-feedback]", feedbackId, f.clinicId, out && out.ok ? "logged" : "FAILED");

  if (!out) return res.status(202).json({ delivered: false, pending: true, feedbackId: feedbackId });
  if (out.ok !== true) {
    return res.status(502).json({ delivered: false, feedbackId: feedbackId,
      error: "We couldn't save that just now. Please try again in a moment." });
  }
  return res.status(200).json({ delivered: true, feedbackId: feedbackId, duplicate: !!out.duplicate });
};

module.exports.validate = validate;
module.exports.LEVELS = LEVELS;
module.exports.SESSIONS = SESSIONS;
