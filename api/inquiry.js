/* ==========================================================================
   TRIUMPH HOOPS ACADEMY — INQUIRY ENDPOINT
   --------------------------------------------------------------------------
   Receives every form on the site and emails it to the Triumph inbox.

   RUNTIME:  Node 18+ serverless function (Vercel / Netlify / Cloudflare with
             a small wrapper — see SETUP.md).
   SECRETS:  Read from environment variables only. Nothing in this file is
             sent to the browser. Never paste a key in here.

   REQUIRED ENVIRONMENT VARIABLES
     RESEND_API_KEY   API key from your transactional email provider
     MAIL_FROM        Verified sender, e.g. "Triumph Website <noreply@triumphhoopsacademy.com>"
     MAIL_TO          triumphhoopsacademy@gmail.com

   UNTIL THOSE ARE SET, THIS ENDPOINT RETURNS AN ERROR ON PURPOSE.
   The site will tell families the message did not send and offer an email
   link instead. It will never show a fake "success" screen.
   ========================================================================== */

"use strict";

const MAIL_TO = process.env.MAIL_TO || "triumphhoopsacademy@gmail.com";
const MAIL_FROM = process.env.MAIL_FROM || "";
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";

/* Resend's shared testing sender. It is always "verified", but the provider
   only delivers from it to the email address the Resend account was created
   with. We never use it first — it is a safety net so that a family's
   submission still lands in the Triumph inbox if the custom sending domain
   stops verifying (expired DNS, moved registrar, etc.) instead of the lead
   being lost. Delivery is attempted from MAIL_FROM first, every time. */
const FALLBACK_FROM = "Triumph Website <onboarding@resend.dev>";
const RESEND_URL = "https://api.resend.com/emails";

const crypto = require("crypto");
const CANON = require("../assets/js/canonical.js");
const TRYOUT_CONFIRMATION = require("../lib/tryout-confirmation.js");
const INTEREST_ACK = require("../lib/interest-acknowledgement.js");
const CLOG = require("../lib/confirmation-log.js");
const JW = require("../lib/jw-email.js");

/* --------------------------------------------------------------------------
   GOOGLE SHEET LOGGING (Junior Wolves registration master database)
   --------------------------------------------------------------------------
   A Google Apps Script Web App bound to the master spreadsheet. Chosen over
   the Sheets API because it needs no dependencies, no service-account private
   key and no token refresh — it fits this zero-dependency serverless function.

     SHEETS_WEBHOOK_URL      the Apps Script /exec deployment URL
     SHEETS_WEBHOOK_SECRET   shared secret; the script rejects anything else

   Both are server-side only. Neither is ever sent to the browser.
   If SHEETS_WEBHOOK_URL is unset, sheet logging is skipped and email-only
   behaviour is unchanged — no other form on the site is affected.
   -------------------------------------------------------------------------- */
const SHEETS_WEBHOOK_URL = process.env.SHEETS_WEBHOOK_URL || "";
const SHEETS_WEBHOOK_SECRET = process.env.SHEETS_WEBHOOK_SECRET || "";
/* 4.5s: leaves room for a second, shorter confirmation attempt below while
   staying well inside the platform request limit. A slow Apps Script run is no
   longer reported as a failure, so a tight first timeout is now safe. */
const SHEET_TIMEOUT_MS = 6500;
/* Second, shorter attempt used ONLY to confirm a write we already timed out on.
   doPost is idempotent on submissionId (it returns duplicate:true instead of
   appending), so this can never create a second row. */
const SHEET_CONFIRM_MS = 2000;

/* Only Junior Wolves submissions go to the registration database. Every other
   Triumph form keeps its existing email-only behaviour. */
/* Sources that are ABOUT an athlete, and therefore must carry a player name.

   player_name was marked required in the browser and never checked here, so
   a submission that skipped the browser - JS off, a stale cached page, curl -
   was accepted with no athlete name at all. Two things then go wrong, and the
   second is the dangerous one:

     1. ciResolveIdentity_ correctly refuses to guess, so the Athlete ID stays
        blank and somebody has to chase it by hand.
     2. doPost's duplicate window keys on the player's full name. Two NAMELESS
        submissions from the same parent email therefore look like the same
        person, and the second is silently discarded as a duplicate. Two
        siblings registered that way become one row and one child disappears.

   Found by a QA registration during Phase 2C that landed with a blank name
   and was then deduplicated against a second one. This is the same principle
   as the grade and school work: the browser dropdown is a convenience, the
   server is the authority.

   coaching_interest and general_contact are deliberately absent - a coach
   applying to help does not have an athlete, and requiring one would reject
   a real person. */
var PLAYER_NAME_SOURCES = new Set([
  "homepage_get_started", "weekly_training", "sunday_training",
  "development_team_interest", "aau_travel_interest",
  "junior_wolves_tryout", "junior_wolves_interest"
]);

const SHEET_SOURCES = new Set(["junior_wolves_tryout", "junior_wolves_interest"]);

/* --------------------------------------------------------------------------
   Field map — label shown in the email, keyed by form field name.
   Add a field to a form, add it here, and it appears in the email.
   -------------------------------------------------------------------------- */
const FIELD_LABELS = {
  parent_name: "Parent / Guardian",
  player_name: "Player",
  player_age: "Age",
  player_grade: "Grade",
  school_code: "School",
  school_other: "School (as the family typed it)",
  district_confirm: "Niles West district",
  interest: "Interest",
  experience: "Basketball experience",
  current_team: "Current / previous team",
  jersey_size: "Jersey / top size",
  shorts_size: "Shorts / bottom size",
  coaching_experience: "Coaching experience",
  age_groups: "Age groups coached",
  parent_phone: "Phone",
  parent_email: "Email",
  message: "Additional information",
  acknowledgement: "Acknowledged tryout terms"
};

const FIELD_ORDER = Object.keys(FIELD_LABELS);

/* Internal plumbing that should never be printed as a field in the email. */
const INTERNAL_FIELDS = new Set(["source", "page", "hp_company", "form_started"]);

/* Human-readable label for the email body, keyed by lead source. */
const SUBMISSION_TYPES = {
  homepage_get_started: "Get Started (home page)",
  weekly_training: "Weekly Training Inquiry",
  sunday_training: "Sunday Development Inquiry",
  development_team_interest: "Development Team Interest",
  aau_travel_interest: "AAU / Travel Interest",
  junior_wolves_tryout: "Junior Wolves Tryout Registration",
  junior_wolves_interest: "Junior Wolves Interest",
  coaching_interest: "Coaching Interest",
  general_contact: "General Contact"
};

const VALID_SOURCES = [
  "homepage_get_started",
  "weekly_training",
  "sunday_training",
  "development_team_interest",
  "aau_travel_interest",
  "junior_wolves_tryout",
  "junior_wolves_interest",
  "coaching_interest",
  "general_contact"
];

/* Very small in-memory throttle. Serverless instances are short-lived, so
   treat this as a speed bump, not a security control. */
const recent = new Map();
const RATE_WINDOW_MS = 60 * 1000;
/* Raised from 5. A family whose first attempt fails will retry, and several
   families can share one network (a school, a gym's wifi, a phone carrier's
   NAT). Five per minute was tight enough to lock out real people mid-retry. */
const RATE_MAX = 12;

function rateLimited(ip) {
  const now = Date.now();
  const hits = (recent.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  hits.push(now);
  recent.set(ip, hits);
  if (recent.size > 500) recent.clear();
  return hits.length > RATE_MAX;
}

function clean(value, max = 1200) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim().slice(0, max);
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* Codes travel and are stored; LABELS are what a person reads. The email is
   for a person, so it renders the label - but it prints the family's own words
   for an "Other" school rather than the word "Other", because "Other school"
   in an inbox tells a coach nothing. */
function displayValue(key, fields) {
  const raw = clean(fields[key]);
  if (key === "player_grade") return CANON.gradeLabel(raw) || raw;
  /* Same reason as grade: the wire carries a code, a person reads a label. */
  if (key === "experience" || key === "interest") {
    return CANON.choiceForStorage(key, raw).display || raw;
  }
  if (key === "school_code") {
    if (raw.toUpperCase() === "OTHER") {
      const typed = clean(fields.school_other, 120);
      return typed ? typed + " (not on our list \u2014 needs review)" : "Other school (name missing)";
    }
    return CANON.schoolLabel(raw) || raw;
  }
  return raw;
}

function gradeOrAge(fields) {
  if (fields.player_grade) {
    return (CANON.gradeLabel(clean(fields.player_grade)) || clean(fields.player_grade)).toUpperCase();
  }
  if (fields.player_age) return "AGE " + clean(fields.player_age).toUpperCase();
  return "";
}

/* --------------------------------------------------------------------------
   Subject line — scannable from a phone lock screen.
   -------------------------------------------------------------------------- */
function buildSubject(fields) {
  const source = fields.source;
  const who = gradeOrAge(fields);
  const player = clean(fields.player_name).toUpperCase();
  const parts = [];

  switch (source) {
    case "weekly_training":
      parts.push("NEW WEEKLY TRAINING INQUIRY", who);
      break;
    case "sunday_training":
      parts.push("NEW TRAINING INQUIRY", who, "SUNDAY DEVELOPMENT");
      break;
    case "development_team_interest":
      parts.push("NEW DEVELOPMENT TEAM INTEREST", who);
      break;
    case "aau_travel_interest":
      parts.push("NEW AAU / TRAVEL INTEREST", who);
      break;
    case "junior_wolves_tryout":
      return ["JUNIOR WOLVES — TRYOUT REGISTRATION", player || who]
        .filter(Boolean).join(" — ").slice(0, 180);
    case "junior_wolves_interest":
      return ["JUNIOR WOLVES — NEW PLAYER INTEREST", player || who]
        .filter(Boolean).join(" — ").slice(0, 180);
    case "coaching_interest":
      parts.push("NEW COACHING INTEREST", clean(fields.parent_name).toUpperCase());
      break;
    case "general_contact":
      parts.push("NEW GENERAL CONTACT", clean(fields.parent_name).toUpperCase());
      break;
    case "homepage_get_started":
      parts.push("NEW INQUIRY — GET STARTED", who, player);
      break;
    default:
      parts.push("NEW TRIUMPH INQUIRY", who,
        (CANON.choiceForStorage("interest", fields.interest).display ||
         clean(fields.interest)).toUpperCase());
  }

  return parts.filter(Boolean).join(" — ").slice(0, 180);
}

/* --------------------------------------------------------------------------
   Body — same information as plain text and HTML, formatted for a phone.
   -------------------------------------------------------------------------- */
function buildBody(fields, notes, meta) {
  meta = meta || {};
  const rows = [];
  if (meta.submissionId) rows.push(["Submission ID", meta.submissionId]);
  FIELD_ORDER
    .filter((key) => fields[key])
    .forEach((key) => rows.push([FIELD_LABELS[key], displayValue(key, fields)]));

  /* Anything the family submitted that is not in FIELD_LABELS still gets
     printed. A parent's answer is never silently discarded because a field
     was added to a form and not to the label map. */
  Object.keys(fields).forEach((key) => {
    if (INTERNAL_FIELDS.has(key)) return;
    if (FIELD_LABELS[key]) return;
    const value = clean(fields[key]);
    if (!value) return;
    rows.push([key.replace(/_/g, " "), value]);
  });

  rows.push(["Submission type", SUBMISSION_TYPES[fields.source] || "Website inquiry"]);
  rows.push(["Submitted", new Date().toLocaleString("en-US", { timeZone: "America/Chicago" }) + " CT"]);
  if (fields.page) rows.push(["Page", clean(fields.page, 300)]);
  rows.push(["Source", clean(fields.source)]);

  /* Capture status: which durable destinations actually hold this
     registration. If the Sheet did not get it, this line is how Triumph
     finds out in time to add the row by hand. */
  if (meta.captureStatus) rows.push(["Capture status", meta.captureStatus]);
  (notes || []).forEach((note) => rows.push(["Note", note]));

  const text = rows.map(([label, value]) => label.toUpperCase() + "\n" + value).join("\n\n");

  const html =
    '<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:16px;line-height:1.5;color:#111">' +
    rows
      .map(
        ([label, value]) =>
          '<p style="margin:0 0 14px"><span style="display:block;font-size:11px;letter-spacing:.12em;' +
          'text-transform:uppercase;color:#6b6b70">' +
          escapeHtml(label) +
          '</span><span style="font-size:17px">' +
          escapeHtml(value) +
          "</span></p>"
      )
      .join("") +
    "</div>";

  return { text, html };
}

/* --------------------------------------------------------------------------
   Canonical sizes (2026-09-22). The stored value is always one of SIZES,
   whatever the browser showed. The form's <option>s carry explicit English
   values, so translation changes only the label; this maps anything that still
   arrives translated (e.g. "Juventud L", "Juvenil XL", "Adulto M") back to the
   canonical English value, and rejects anything else on the tryout form.
   -------------------------------------------------------------------------- */
const SIZES = ["Youth S", "Youth M", "Youth L", "Youth XL", "Adult S", "Adult M", "Adult L", "Adult XL", "Adult 2XL"];
function canonicalSize(value) {
  const v = String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  if (!v) return "";
  const m = v.match(/^(youth|juventud|juvenil|jeunesse|jugend|adult|adulto|adulte|erwachsene?)\s*(xs|s|m|l|xl|2xl|xxl)$/i);
  if (!m) return null;
  const group = /^(youth|juventud|juvenil|jeunesse|jugend)$/i.test(m[1]) ? "Youth" : "Adult";
  const size = m[2].toUpperCase() === "XXL" ? "2XL" : m[2].toUpperCase();
  const out = group + " " + size;
  return SIZES.includes(out) ? out : null;
}
function canonicalizeSizes(fields) {
  ["jersey_size", "shorts_size"].forEach(function (k) {
    if (fields[k] == null || fields[k] === "") return;
    const c = canonicalSize(fields[k]);
    fields[k] = c === null ? "__invalid__" : c;
  });
}

/* --------------------------------------------------------------------------
   Validation — server side, independent of the browser.
   -------------------------------------------------------------------------- */
function validate(fields) {
  const errors = [];

  /* A filled honeypot is a definite bot: no human sees that field. */
  if (fields.hp_company) errors.push("spam");

  if (!fields.source || !VALID_SOURCES.includes(fields.source)) errors.push("Unknown form source.");
  if (!fields.parent_name) errors.push("Parent / guardian name is required.");
  if (PLAYER_NAME_SOURCES.has(fields.source) && !String(fields.player_name || "").trim()) {
    errors.push("Player name is required.");
  }
  if (!fields.parent_email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(fields.parent_email)) {
    errors.push("A valid email address is required.");
  }
  /* Sizing exists so uniform orders can go out without chasing 60 families in
     October. If it is optional it will be blank for half the roster, so the
     official registration requires it. The interest list never asks. */
  if (fields.source === "junior_wolves_tryout") {
    if (!fields.jersey_size) errors.push("Jersey / top size is required.");
    else if (fields.jersey_size === "__invalid__") errors.push("Choose a jersey / top size from the list.");
    if (!fields.shorts_size) errors.push("Shorts / bottom size is required.");
    else if (fields.shorts_size === "__invalid__") errors.push("Choose a shorts / bottom size from the list.");
  }

  if (
    (fields.source === "junior_wolves_tryout" || fields.source === "junior_wolves_interest") &&
    !fields.acknowledgement
  ) {
    errors.push("Tryout acknowledgement is required.");
  }

  /* ------------------------------------------------------------------
     CANONICAL FIELDS (Phase 2C)
     The dropdown the family used was generated from canonical.js. So is
     this check. A value that is not in the list is refused here whether it
     came from a stale cached page, a translated label, or curl.

     Which subset applies is looked up per form source rather than hard-coded,
     because Triumph runs athletes well outside the Junior Wolves 3-8 band and
     applying the Junior Wolves limits site-wide would reject real families.
     A source with no program mapping gets no canonical check rather than a
     wrong one.
     ------------------------------------------------------------------ */
  const programName = CANON.sourceProgram[fields.source];
  if (programName) {
    const program = CANON.program(programName);
    /* Junior Wolves registration and interest both name a school; the Triumph
       enquiry forms do not ask, and must not be made to. */
    const wantsSchool = program.collectsSchool &&
      (fields.source === "junior_wolves_tryout" || fields.source === "junior_wolves_interest");

    CANON.validateSubmission(programName, {
      grade: fields.player_grade,
      age: fields.player_age,
      school_code: wantsSchool ? fields.school_code : undefined,
      school_other: fields.school_other,
      /* The last two fields that still submitted their own visible label.
         Validated per program for the same reason as grade: the Junior
         Wolves experience list and the Triumph one are different lists. */
      experience: fields.experience,
      interest: fields.interest
    }, { requireSchool: wantsSchool }).forEach((e) => errors.push(e));
  }

  return errors;
}

/* A suspiciously fast submission used to be dropped with a fake "delivered"
   response — which silently lost the lead and showed the family a success
   screen. It is now only a note printed in the email. Losing a real family is
   far more expensive than reading one spam message. */
function submissionNotes(fields) {
  const notes = [];
  const started = Number(fields.form_started || 0);
  if (started && Date.now() - started < 2500) {
    notes.push("Submitted unusually quickly — may be automated. Verify before replying.");
  }
  return notes;
}

/* --------------------------------------------------------------------------
   Submission ID — printed in the email AND written to the Sheet so a row can
   always be matched back to its notification. Not derived from the player's
   name, which is neither unique nor stable.
   -------------------------------------------------------------------------- */
function newSubmissionId(source) {
  const prefix = SHEET_SOURCES.has(source) ? "JW" : "THA";
  const year = new Date().getFullYear();
  return prefix + "-" + year + "-" + crypto.randomBytes(4).toString("hex").toUpperCase();
}

/* Coaches sort and build check-in lists by last name, so the Sheet gets the
   name split out as well as whole. Everything after the first token is the
   last name, which handles "Yusuf Hassan" and "Juan de la Cruz" alike. */
function splitName(full) {
  const value = clean(full, 200);
  if (!value) return { first: "", last: "" };
  const parts = value.split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

async function logToSheet(fields, submissionId) {
  if (!SHEET_SOURCES.has(fields.source)) return { logged: false, skipped: "not_a_registration_source" };
  if (!SHEETS_WEBHOOK_URL) return { logged: false, skipped: "not_configured" };

  const name = splitName(fields.player_name);
  const schoolStore = CANON.schoolForStorage(fields.school_code, fields.school_other);
  const payload = {
    secret: SHEETS_WEBHOOK_SECRET,
    submissionId: submissionId,
    submittedAt: new Date().toISOString(),
    source: fields.source,
    submissionType: SUBMISSION_TYPES[fields.source] || "Junior Wolves",
    playerFirstName: name.first,
    playerLastName: name.last,
    playerFullName: clean(fields.player_name, 200),
    grade: clean(fields.player_grade, 60),
    /* School stores the family's reality: the official name when they picked
       one from the list, their exact words when they picked "Other school".
       schoolCode carries which of those it is, so an Other entry is never
       mistaken later for a canonical school. */
    school: schoolStore.display,
    schoolCode: schoolStore.code,
    parentName: clean(fields.parent_name, 200),
    parentEmail: clean(fields.parent_email, 200),
    parentPhone: clean(fields.parent_phone, 60),
    /* The canonical LABEL, looked up by this server from the code the browser
       sent - never the browser's own text. That is what makes a translated
       page unable to change what lands here, and it keeps the column reading
       the same as the 233 rows already in it. */
    experience: CANON.choiceForStorage("experience", fields.experience).display,
    currentTeam: clean(fields.current_team, 200),
    notes: clean(fields.message, 2000),
    eligibilityAcknowledged: fields.district_confirm ? "Yes" : "No",
    page: clean(fields.page, 300),
    /* Official tryout registration only. The interest list does not ask for
       sizes, so these arrive empty and the sheet stores empty. */
    jerseySize: clean(fields.jersey_size, 40),
    shortsSize: clean(fields.shorts_size, 40)
  };

  const first = await postToSheetOnce(payload, SHEET_TIMEOUT_MS);
  if (first.logged || !first.timedOut) return first;

  /* We timed out. IMPORTANT: aborting cancels OUR wait, not the Apps Script run.
     doPost takes a script lock with waitLock(20000), so under concurrent
     submissions it can legitimately take longer than our client timeout and
     still append the row. Reporting "not logged" here produced false negatives
     that told staff to re-enter registrations by hand, which would have created
     duplicates. Ask again with the same submissionId: doPost is idempotent on
     it, so this confirms the truth without any risk of a second row. */
  const confirm = await postToSheetOnce(payload, SHEET_CONFIRM_MS);
  if (confirm.logged) return { logged: true, row: confirm.row, duplicate: confirm.duplicate, slow: true };

  return { logged: false, unconfirmed: true,
           error: "sheet timed out twice; the write may still have completed" };
}

/* Does this athlete ALREADY have a live RSVP for the clinic we are about to
   offer? The confirmation email must never invite a family to do something
   they have done, and must never claim an RSVP they do not have - so this is
   read from live data, and a failure returns null (unknown) rather than a
   guess. The lookup is the same read-only one the RSVP funnel uses. */
async function clinicRsvpState(fields, clinicId) {
  if (!clinicId || !SHEETS_WEBHOOK_URL || !SHEETS_WEBHOOK_SECRET) return null;
  const name = splitName(fields.player_name);
  if (!name.first || !name.last) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(SHEETS_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        kind: "clinic_lookup", secret: SHEETS_WEBHOOK_SECRET,
        clinicId: clinicId, first: name.first, last: name.last,
        grade: CANON.normaliseGrade(clean(fields.player_grade, 60))
      })
    });
    if (!response.ok) return null;
    const data = await response.json().catch(() => null);
    if (!data || data.ok !== true) return null;
    /* Only a confident single match can tell us anything. Anything else
       leaves the state unknown, and the email simply invites. */
    if (data.match !== "one") return false;
    return !!data.alreadyRsvpd;
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function postToSheetOnce(payload, timeoutMs) {
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
    if (!response.ok || !data.ok) {
      return { logged: false, timedOut: false,
               error: "sheet responded " + response.status + " " + raw.slice(0, 200) };
    }
    return { logged: true, timedOut: false, row: data.row, duplicate: !!data.duplicate };
  } catch (err) {
    return { logged: false, timedOut: err.name === "AbortError",
             error: err.name === "AbortError" ? "sheet timed out" : err.message };
  } finally {
    clearTimeout(timer);
  }
}

/* --------------------------------------------------------------------------
   Send
   -------------------------------------------------------------------------- */
async function postToResend(from, fields, notes, meta) {
  const { text, html } = buildBody(fields, notes, meta);

  const response = await fetch(RESEND_URL, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + RESEND_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: [MAIL_TO],
      reply_to: fields.parent_email,
      subject: buildSubject(fields),
      text,
      html
    })
  });

  if (response.ok) {
    const data = await response.json().catch(() => ({}));
    return { ok: true, from, id: data && data.id };
  }

  const detail = await response.text().catch(() => "");
  return { ok: false, from, status: response.status, detail: detail.slice(0, 400) };
}

/* A provider rejection caused by the sending DOMAIN, not by the message.
   This is exactly the failure that took the Triumph forms down: the custom
   domain was added to Resend but its DNS records were never verified. */
function isSenderDomainProblem(result) {
  if (!result || result.ok) return false;
  if (result.status !== 403 && result.status !== 422) return false;
  return /not verified|verify (your )?domain|domain is not|resend\.com\/domains/i.test(result.detail || "");
}

async function sendEmail(fields, notes, meta) {
  if (!RESEND_API_KEY) {
    const err = new Error("RESEND_API_KEY is not set in the hosting environment.");
    err.code = "not_configured";
    throw err;
  }

  const primaryFrom = MAIL_FROM || FALLBACK_FROM;
  let result = await postToResend(primaryFrom, fields, notes, meta);

  /* Sending domain broken -> retry once from the provider's shared sender so
     the submission still reaches the Triumph inbox. */
  if (isSenderDomainProblem(result) && primaryFrom !== FALLBACK_FROM) {
    console.error(
      "[inquiry] sending domain rejected by provider; retrying from fallback sender.",
      "| from:", primaryFrom,
      "| status:", result.status,
      "| detail:", result.detail
    );
    const retry = await postToResend(FALLBACK_FROM, fields, notes, meta);
    if (retry.ok) {
      console.warn("[inquiry] delivered via FALLBACK sender. Verify the sending domain at resend.com/domains.");
      return { ...retry, usedFallbackSender: true };
    }
    result = retry;
  }

  if (!result.ok) {
    const err = new Error(
      "Email provider rejected the message (" + result.status + "): " + result.detail
    );
    err.code = "provider_rejected";
    throw err;
  }

  return result;
}

/* --------------------------------------------------------------------------
   Request parsing — accepts JSON (normal path) and form-encoded bodies
   (the no-JavaScript fallback).
   -------------------------------------------------------------------------- */
async function readBody(req) {
  if (req.body && typeof req.body === "object") return { fields: req.body, encoded: false };

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  const type = String(req.headers["content-type"] || "");

  if (type.includes("application/json")) {
    return { fields: JSON.parse(raw || "{}"), encoded: false };
  }
  return { fields: Object.fromEntries(new URLSearchParams(raw)), encoded: true };
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ delivered: false, error: "Method not allowed." });
  }

  let fields;
  let encoded = false;

  try {
    const parsed = await readBody(req);
    fields = parsed.fields || {};
    encoded = parsed.encoded;
  } catch (err) {
    return res.status(400).json({ delivered: false, error: "Could not read submission." });
  }

  const ip =
    (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    (req.socket && req.socket.remoteAddress) ||
    "unknown";

  if (rateLimited(ip)) {
    return res.status(429).json({ delivered: false, error: "Too many submissions. Try again shortly." });
  }

  canonicalizeSizes(fields);
  const errors = validate(fields);

  /* Silently accept honeypot traffic so scripts do not learn the rules.
     Only the honeypot gets this treatment — a real person is never dropped. */
  if (errors[0] === "spam") {
    if (encoded) { res.writeHead(303, { Location: "/thank-you" }); return res.end(); }
    return res.status(200).json({ delivered: true });
  }

  if (errors.length) {
    if (encoded) { res.writeHead(303, { Location: "/thank-you?status=error" }); return res.end(); }
    return res.status(400).json({ delivered: false, error: errors[0] });
  }

  /* ------------------------------------------------------------------
     TWO DURABLE DESTINATIONS: the Google Sheet and the Triumph inbox.
     They are attempted independently — neither failing stops the other.
     The registration is safely captured if EITHER one succeeds.

     The Sheet runs first, and only because it is fast, so its result can be
     printed in the email. If the Sheet failed, the email says so and Triumph
     can add the row by hand instead of discovering the gap weeks later.
     ------------------------------------------------------------------ */
  const submissionId = newSubmissionId(fields.source);
  const notes = submissionNotes(fields);
  const who = clean(fields.player_name) || clean(fields.parent_name);

  const sheet = await logToSheet(fields, submissionId);

  let captureStatus;
  if (sheet.logged) {
    captureStatus = "Google Sheet: Logged (row " + (sheet.row || "?") + ")" +
                    (sheet.slow ? " — confirmed after a slow write" : "");
  } else if (sheet.skipped) {
    captureStatus = null; /* not a registration form — say nothing */
  } else if (sheet.unconfirmed) {
    /* Never tell staff to re-enter by hand on a timeout — the row is usually
       already there, and manual entry would duplicate it. */
    captureStatus = "Google Sheet status: UNCONFIRMED — the write was slow and may " +
                    "have completed. Search MASTER REGISTRATIONS for Submission ID " +
                    submissionId + " before taking any manual action.";
  } else {
    captureStatus = "Google Sheet: NOT LOGGED — add this registration to the master sheet by hand.";
  }

  let email = { sent: false };
  try {
    const sent = await sendEmail(fields, notes, {
      submissionId: submissionId,
      captureStatus: captureStatus
        ? "Email: Delivered\n" + captureStatus
        : null
    });
    email = { sent: true, usedFallbackSender: !!sent.usedFallbackSender };
  } catch (err) {
    email = { sent: false, code: err.code || "error", message: err.message };
  }

  /* ---- AUTOMATIC TRYOUT CONFIRMATION -------------------------------------
     Permanent, for every successful tryout registration from here on.

     Sent only when the sheet confirmed a genuinely NEW row. A retried or
     duplicate submission returns duplicate:true and sends nothing, so a
     family who double-taps gets one confirmation, not two. An unconfirmed
     (timed-out) write sends nothing either: we do not confirm what we cannot
     see. The Resend idempotency key is the Submission ID, which is a second,
     independent guard.

     Any failure here is logged and swallowed. The registration is already
     captured, and no email outcome may change what the family is told. */
  /* THE SAME TWO-KINDS-OF-DUPLICATE PROBLEM AS THE CLINIC RSVP PATH.
     writeToSheet asks once; on a timeout it asks AGAIN with the same
     submissionId, and because doPost is idempotent on that id the second ask
     finds the row it already wrote and reports duplicate:true with slow:true.

     That is OUR OWN write landing late - a real new registration that has
     never been confirmed - not a family submitting twice. A genuine rapid
     re-submission carries a DIFFERENT submissionId and is caught on the FIRST
     ask, where slow is not set.

     Gating on !sheet.duplicate alone therefore silently dropped the
     confirmation for every registration whose write ran slow, which is the
     same defect found on the RSVP path on 2026-09-30. Provider idempotency
     (jw-tryout-confirm-<submissionId>) remains the backstop against a real
     double-send. */
  let tryoutConfirmation = "skipped";
  if (fields.source === "junior_wolves_tryout" && sheet.logged &&
      (!sheet.duplicate || sheet.slow === true)) {
    const next = JW.CLINICS.nextClinic();
    const clinicId = next ? next.id : null;
    const alreadyRsvpd = await clinicRsvpState(fields, clinicId);
    const out = await TRYOUT_CONFIRMATION.send({
      to: clean(fields.parent_email, 200),
      first: splitName(fields.player_name).first,
      grade: clean(fields.player_grade, 60),
      clinicId: clinicId,
      clinicRsvp: alreadyRsvpd,
      submissionId: submissionId
    });
    tryoutConfirmation = out.sent
      ? ("sent/" + (clinicId || "no-clinic") + "/" + (alreadyRsvpd === true ? "already-rsvpd"
          : alreadyRsvpd === false ? "invite" : "state-unknown"))
      : ("not-sent:" + (out.reason || "unknown"));
    if (!out.sent) console.error("[inquiry] tryout confirmation", submissionId, tryoutConfirmation, out.detail || "");
    else console.log("[inquiry] tryout confirmation", submissionId, tryoutConfirmation);
    await CLOG.recordSend({
      recordType: "tryout_registration", recordId: submissionId,
      recipient: clean(fields.parent_email, 200),
      confirmationType: "tryout_confirmation"
    }, out);
  } else if (fields.source === "junior_wolves_tryout") {
    /* Eligible but suppressed. The commonest cause is an unverified sheet
       write - the row usually lands anyway, which is exactly the gap the
       recovery pass is for. Record it so it is visible, not silent. */
    await CLOG.recordSkip({
      recordType: "tryout_registration", recordId: submissionId,
      recipient: clean(fields.parent_email, 200),
      confirmationType: "tryout_confirmation"
    }, sheet.duplicate ? "SKIPPED_DUPLICATE" : "SKIPPED_UNVERIFIED_WRITE",
       sheet.duplicate ? "duplicate-submission" : "sheet-write-unverified");
  }

  /* ---- interest acknowledgement -------------------------------------
     The 94 historical interest submissions never got anything. This is the
     receipt for future ones. It fires only for NEW interest rows, and only
     when the sheet confirmed the write - the same conservative gate the
     tryout confirmation uses.

     Note it is dormant while tryout registration is open: the Junior Wolves
     page runs one form in two modes, and in "open" mode it posts
     junior_wolves_tryout, so no interest row can arrive. */
  let interestAck = "skipped";
  if (fields.source === "junior_wolves_interest" && sheet.logged &&
      (!sheet.duplicate || sheet.slow === true)) {
    const nextClinic = JW.CLINICS.nextClinic();
    const ack = await INTEREST_ACK.send({
      to: clean(fields.parent_email, 200),
      first: splitName(fields.player_name).first,
      grade: clean(fields.player_grade, 60),
      clinicId: nextClinic ? nextClinic.id : null,
      tryoutOpen: false,
      submissionId: submissionId
    });
    interestAck = ack.sent ? "sent" : ("not-sent:" + (ack.reason || "unknown"));
    if (!ack.sent) console.error("[inquiry] interest ack", submissionId, interestAck, ack.detail || "");
    else console.log("[inquiry] interest ack", submissionId, interestAck);
    await CLOG.recordSend({
      recordType: "jw_interest", recordId: submissionId,
      recipient: clean(fields.parent_email, 200),
      confirmationType: "interest_acknowledgement"
    }, ack);
  } else if (fields.source === "junior_wolves_interest") {
    await CLOG.recordSkip({
      recordType: "jw_interest", recordId: submissionId,
      recipient: clean(fields.parent_email, 200),
      confirmationType: "interest_acknowledgement"
    }, sheet.duplicate ? "SKIPPED_DUPLICATE" : "SKIPPED_UNVERIFIED_WRITE",
       sheet.duplicate ? "duplicate-submission" : "sheet-write-unverified");
  }

  /* ---- one clear server-side line per outcome, for diagnosis ---- */
  const tag = "| id: " + submissionId + " | source: " + fields.source + " | " + who;
  if (email.sent && sheet.logged) {
    console.log("[inquiry] CAPTURED BY EMAIL + SHEET", tag);
  } else if (email.sent && sheet.skipped) {
    console.log("[inquiry] CAPTURED BY EMAIL (sheet not applicable:", sheet.skipped + ")", tag);
  } else if (email.sent && !sheet.logged) {
    console.error("[inquiry] REGISTRATION CAPTURED BY EMAIL — SHEET LOGGING FAILED |", sheet.error, tag);
  } else if (!email.sent && sheet.logged) {
    console.error("[inquiry] REGISTRATION CAPTURED BY SHEET — EMAIL DELIVERY FAILED |", email.message, tag);
  } else {
    console.error(
      "[inquiry] TOTAL CAPTURE FAILURE — NOTHING SAVED | email:", email.message,
      "| sheet:", sheet.error || sheet.skipped, tag
    );
  }

  const captured = email.sent || sheet.logged;

  if (encoded) {
    res.writeHead(303, { Location: captured ? "/thank-you" : "/thank-you?status=error" });
    return res.end();
  }

  if (captured) {
    return res.status(200).json({
      delivered: true,
      submissionId: submissionId,
      emailDelivered: email.sent,
      sheetLogged: !!sheet.logged,
      confirmation: tryoutConfirmation,
      interestAck: interestAck
    });
  }

  /* Both destinations failed. The browser gets a safe sentence and keeps every
     value the family typed — never a provider message, key name or stack. */
  return res.status(502).json({
    delivered: false,
    emailDelivered: false,
    sheetLogged: false,
    error: "We couldn't deliver your submission right now."
  });
};

/* Exported for testing / reuse by a Netlify or Cloudflare wrapper. */
module.exports.buildSubject = buildSubject;
module.exports.buildBody = buildBody;
module.exports.validate = validate;
module.exports.sendEmail = sendEmail;
module.exports.logToSheet = logToSheet;
module.exports.newSubmissionId = newSubmissionId;
module.exports.splitName = splitName;
module.exports.clinicRsvpState = clinicRsvpState;
