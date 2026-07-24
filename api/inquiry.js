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
const RESEND_URL = "https://api.resend.com/emails";

/* --------------------------------------------------------------------------
   Field map — label shown in the email, keyed by form field name.
   Add a field to a form, add it here, and it appears in the email.
   -------------------------------------------------------------------------- */
const FIELD_LABELS = {
  parent_name: "Parent / Guardian",
  player_name: "Player",
  player_age: "Age",
  player_grade: "Grade",
  school: "School",
  district_confirm: "Niles West district",
  interest: "Interest",
  experience: "Basketball experience",
  current_team: "Current / previous team",
  coaching_experience: "Coaching experience",
  age_groups: "Age groups coached",
  parent_phone: "Phone",
  parent_email: "Email",
  message: "Additional information",
  acknowledgement: "Acknowledged tryout terms"
};

const FIELD_ORDER = Object.keys(FIELD_LABELS);

const VALID_SOURCES = [
  "homepage_get_started",
  "weekly_training",
  "sunday_training",
  "development_team_interest",
  "aau_travel_interest",
  "junior_wolves_tryout",
  "coaching_interest",
  "general_contact"
];

/* Very small in-memory throttle. Serverless instances are short-lived, so
   treat this as a speed bump, not a security control. */
const recent = new Map();
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX = 5;

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

function gradeOrAge(fields) {
  if (fields.player_grade) return clean(fields.player_grade).toUpperCase();
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
      parts.push("NEW JUNIOR WOLVES TRYOUT REGISTRATION", who, player);
      break;
    case "coaching_interest":
      parts.push("NEW COACHING INTEREST", clean(fields.parent_name).toUpperCase());
      break;
    case "general_contact":
      parts.push("NEW GENERAL CONTACT", clean(fields.parent_name).toUpperCase());
      break;
    default:
      parts.push("NEW TRIUMPH INQUIRY", who, clean(fields.interest).toUpperCase());
  }

  return parts.filter(Boolean).join(" — ").slice(0, 180);
}

/* --------------------------------------------------------------------------
   Body — same information as plain text and HTML, formatted for a phone.
   -------------------------------------------------------------------------- */
function buildBody(fields) {
  const rows = FIELD_ORDER
    .filter((key) => fields[key])
    .map((key) => [FIELD_LABELS[key], clean(fields[key])]);

  rows.push(["Source", fields.source]);
  rows.push(["Submitted", new Date().toLocaleString("en-US", { timeZone: "America/Chicago" }) + " CT"]);
  if (fields.page) rows.push(["Page", clean(fields.page, 300)]);

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
   Validation — server side, independent of the browser.
   -------------------------------------------------------------------------- */
function validate(fields) {
  const errors = [];

  if (fields.hp_company) errors.push("spam");
  const started = Number(fields.form_started || 0);
  if (started && Date.now() - started < 2500) errors.push("too fast");

  if (!fields.source || !VALID_SOURCES.includes(fields.source)) errors.push("Unknown form source.");
  if (!fields.parent_name) errors.push("Parent / guardian name is required.");
  if (!fields.parent_email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(fields.parent_email)) {
    errors.push("A valid email address is required.");
  }
  if (fields.source === "junior_wolves_tryout" && !fields.acknowledgement) {
    errors.push("Tryout acknowledgement is required.");
  }

  return errors;
}

/* --------------------------------------------------------------------------
   Send
   -------------------------------------------------------------------------- */
async function sendEmail(fields) {
  if (!RESEND_API_KEY || !MAIL_FROM) {
    throw new Error(
      "Email is not configured yet. Set RESEND_API_KEY and MAIL_FROM in the hosting environment."
    );
  }

  const { text, html } = buildBody(fields);

  const response = await fetch(RESEND_URL, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + RESEND_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: MAIL_FROM,
      to: [MAIL_TO],
      reply_to: fields.parent_email,
      subject: buildSubject(fields),
      text,
      html
    })
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error("Email provider rejected the message (" + response.status + "). " + detail.slice(0, 300));
  }

  return response.json().catch(() => ({}));
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

  const errors = validate(fields);

  /* Silently accept obvious bot traffic so scripts do not learn the rules. */
  if (errors[0] === "spam" || errors[0] === "too fast") {
    if (encoded) { res.writeHead(303, { Location: "/thank-you" }); return res.end(); }
    return res.status(200).json({ delivered: true });
  }

  if (errors.length) {
    if (encoded) { res.writeHead(303, { Location: "/thank-you?status=error" }); return res.end(); }
    return res.status(400).json({ delivered: false, error: errors[0] });
  }

  try {
    await sendEmail(fields);
    if (encoded) { res.writeHead(303, { Location: "/thank-you" }); return res.end(); }
    return res.status(200).json({ delivered: true });
  } catch (err) {
    console.error("[inquiry] delivery failed:", err.message, "| source:", fields.source);
    if (encoded) { res.writeHead(303, { Location: "/thank-you?status=error" }); return res.end(); }
    return res.status(502).json({ delivered: false, error: err.message });
  }
};

/* Exported for testing / reuse by a Netlify or Cloudflare wrapper. */
module.exports.buildSubject = buildSubject;
module.exports.buildBody = buildBody;
module.exports.validate = validate;
module.exports.sendEmail = sendEmail;
