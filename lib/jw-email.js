/* ==========================================================================
   JUNIOR WOLVES — SHARED EMAIL BRAND SYSTEM
   --------------------------------------------------------------------------
   One shell, one set of blocks, used by every Junior Wolves email the system
   sends automatically: tryout confirmation, RSVP confirmation, and the whole
   event reminder lifecycle. Black field, red rule, Arial Black display, logo
   and signature at the foot - the same identity families have already seen.

   NOTHING HERE IS DATED.
     Every date, time, session and venue comes from assets/js/clinics.js via
     the clinicId passed in. Adding a clinic there is the only change needed to
     make every email in this system correct for it. There is no October 11 in
     this file and there must never be one.

   WHY TABLES AND INLINE STYLE
     Email clients are not browsers. Flex, grid and <style> blocks are dropped
     or mangled by Outlook and parts of Gmail, so the layout is nested tables
     with inline style and the media queries only adjust padding and type size.
   ========================================================================== */
"use strict";

const CLINICS = require("../assets/js/clinics.js");

const MAIL_TO = process.env.MAIL_TO || "triumphhoopsacademy@gmail.com";
const SITE = "https://www.triumphhoopsacademy.com";
const LOGO_URL = SITE + "/assets/img/jr-wolves-email-logo.png";

/* Brand tokens. Changing a colour here changes every automatic email. */
const C = {
  page: "#000000",
  shell: "#0b0b0c",
  panel: "#17171a",
  rule: "#2a2a2f",
  red: "#c8102e",
  redBright: "#ff3b52",   /* small red type on black only - crimson fails AA */
  text: "#e4e4e7",
  muted: "#a1a1aa",
  faint: "#67676f",
  white: "#ffffff"
};

function esc(v) {
  return String(v == null ? "" : v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* ---------------------------------------------------------------- AUDIENCE --
   Addresses that must never reach a send, checked in one place so the API,
   the audience builder and the Apps Script all agree.

   PLACEHOLDER DOMAINS
     Reserved-for-documentation domains (RFC 2606) plus the usual filler.
     Resend refuses example.com with a deterministic 422, so one of these in
     the data costs a guaranteed rejection on every single send and inflates
     the expected audience count. Excluded at build time instead. */
const PLACEHOLDER_DOMAINS = [
  "example.com", "example.org", "example.net", "example.edu",
  "test.com", "test.test", "localhost", "invalid", "email.com",
  "domain.com", "yourdomain.com", "mydomain.com", "none.com",
  "noemail.com", "no-email.com", "nomail.com", "fake.com", "sample.com"
];

/* Triumph's own inboxes. Real addresses, but they are us, not a family. */
const ORG_ADDRESSES = [
  "triumphhoopsacademy@gmail.com",
  "msoriano33@gmail.com",
  "noreply@triumphhoopsacademy.com"
];

/* Rows deliberately left in the sheets to prove a path works. */
const QA_MARKER = /qa test|qa verify|qafunnel|qatest|funnelcheck|do not count/i;

function normEmail(v) { return String(v == null ? "" : v).trim().toLowerCase(); }

function isPlaceholder(email) {
  const e = normEmail(email);
  const at = e.lastIndexOf("@");
  if (at === -1) return false;
  const domain = e.slice(at + 1);
  if (PLACEHOLDER_DOMAINS.indexOf(domain) !== -1) return true;
  /* .test / .invalid / .example / .localhost are reserved and never route. */
  return /\.(test|invalid|example|localhost)$/.test(domain);
}

function isOrg(email) { return ORG_ADDRESSES.indexOf(normEmail(email)) !== -1; }

function validEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normEmail(e)); }

/* TRANSACTIONAL vs CAMPAIGN sendability - they are not the same question.

   A CAMPAIGN audience excludes Triumph's own inboxes, because we are not a
   family and must not inflate a count or receive our own marketing.

   A TRANSACTIONAL receipt - a tryout confirmation, an RSVP confirmation - is
   owed to whoever just filled the form, and that can legitimately be Oli
   registering his own child from the org mailbox. Refusing it would leave a
   real registration with no confirmation, which is the exact failure this
   system was built to end. So only genuinely undeliverable addresses are
   refused here. (Caught in QA 2026-09-29, when a confirmation was suppressed
   as "org-inbox".) */
function sendableTransactional(email) {
  const e = normEmail(email);
  if (!e) return { ok: false, reason: "empty" };
  if (!validEmail(e)) return { ok: false, reason: "malformed" };
  if (isPlaceholder(e)) return { ok: false, reason: "placeholder-domain" };
  return { ok: true, email: e };
}

/* The single test every address must pass to enter a real CAMPAIGN send, and
   the reason it failed when it does not - so a build can report WHY a count
   moved rather than silently shrinking. */
function sendable(email) {
  const e = normEmail(email);
  if (!e) return { ok: false, reason: "empty" };
  if (!validEmail(e)) return { ok: false, reason: "malformed" };
  if (isPlaceholder(e)) return { ok: false, reason: "placeholder-domain" };
  if (isOrg(e)) return { ok: false, reason: "org-inbox" };
  return { ok: true, email: e };
}

/* ------------------------------------------------------------------ BLOCKS -- */

function prose(html) {
  return `<tr><td class="jw-pad" align="left" style="padding:22px 36px 0 36px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:23px;color:${C.text};">${html}</td></tr>`;
}

function small(html) {
  return `<tr><td class="jw-pad" align="left" style="padding:20px 36px 0 36px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:${C.muted};">${html}</td></tr>`;
}

function button(href, label) {
  return `<tr><td class="jw-pad" align="left" style="padding:26px 36px 0 36px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td bgcolor="${C.red}" style="background:${C.red};">
          <a href="${href}" style="display:block;padding:15px 30px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:18px;font-weight:bold;letter-spacing:1.4px;text-transform:uppercase;color:${C.white};text-decoration:none;">${esc(label)}</a>
        </td>
      </tr></table>
    </td></tr>`;
}

function eyebrow(text) {
  return `<tr><td class="jw-pad" align="left" style="padding:24px 36px 0 36px;">
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;line-height:14px;letter-spacing:2px;color:${C.muted};text-transform:uppercase;font-weight:bold;">${esc(text)}</div>
    </td></tr>`;
}

function divider() {
  return `<tr><td class="jw-pad" style="padding:26px 36px 0 36px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td height="1" bgcolor="${C.rule}" style="height:1px;line-height:1px;font-size:1px;background:${C.rule};">&nbsp;</td>
      </tr></table>
    </td></tr>`;
}

/* A highlighted panel. `accent` true draws the red edge - used for the one
   thing the reader must not miss (their session time). */
function panel(inner, accent) {
  return `<tr><td class="jw-pad" align="left" style="padding:14px 36px 0 36px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.panel}" style="background:${C.panel};">
        <tr><td style="padding:18px 22px;border-left:3px solid ${accent ? C.red : C.rule};">${inner}</td></tr>
      </table>
    </td></tr>`;
}

/* ------------------------------------------------------------ EVENT BLOCKS --
   All of these take a clinicId and read clinics.js. None of them accept a
   date, a time or a session as an argument, which is what stops a caller from
   printing a time that disagrees with the RSVP page. */

/* The athlete's OWN session, derived from grade. The single most important
   line in a logistics email, so it gets the accent panel. */
function sessionPanel(clinicId, athletes) {
  const clinic = CLINICS.clinicById(clinicId);
  if (!clinic) return "";
  const groups = groupBySession(clinicId, athletes);
  if (!groups.length) {
    return panel(
      `<div class="jw-display jw-time" style="font-family:'Arial Black','Arial Bold',Arial,Helvetica,sans-serif;font-size:28px;line-height:32px;color:${C.white};text-transform:uppercase;">${esc(clinic.time)}</div>`,
      true);
  }
  return groups.map(function (g) {
    return panel(
      `<div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:15px;letter-spacing:1.6px;color:${C.muted};text-transform:uppercase;font-weight:bold;">${esc(g.label)}</div>` +
      `<div class="jw-display jw-time" style="font-family:'Arial Black','Arial Bold',Arial,Helvetica,sans-serif;font-size:28px;line-height:32px;color:${C.white};padding-top:5px;text-transform:uppercase;">${esc(g.time)}</div>` +
      (g.names.length ? `<div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:${C.muted};padding-top:8px;">${esc(g.names.join(" &amp; "))}</div>` : ""),
      true);
  }).join("\n");
}

/* Both sessions, for a reader whose grade we do not know - an invitation to
   families who have not told us anything yet. */
function bothSessionsPanel(clinicId) {
  const clinic = CLINICS.clinicById(clinicId);
  if (!clinic) return "";
  if (!clinic.sessions || clinic.sessions.length < 2) {
    return panel(`<div class="jw-display jw-time" style="font-family:'Arial Black','Arial Bold',Arial,Helvetica,sans-serif;font-size:28px;line-height:32px;color:${C.white};text-transform:uppercase;">${esc(clinic.time)}</div>`, true);
  }
  const rows = clinic.sessions.map(function (s) {
    return `<tr><td style="padding:16px 22px;border-left:3px solid ${C.red};">
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:15px;letter-spacing:1.6px;color:${C.muted};text-transform:uppercase;font-weight:bold;">${esc(s.label)}</div>
        <div class="jw-display jw-time" style="font-family:'Arial Black','Arial Bold',Arial,Helvetica,sans-serif;font-size:26px;line-height:30px;color:${C.white};padding-top:5px;text-transform:uppercase;">${esc(s.time)}</div>
      </td></tr>`;
  }).join(`<tr><td style="padding:0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="1" bgcolor="${C.rule}" style="height:1px;line-height:1px;font-size:1px;background:${C.rule};">&nbsp;</td></tr></table></td></tr>`);

  return `<tr><td class="jw-pad" align="left" style="padding:14px 36px 0 36px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.panel}" style="background:${C.panel};">${rows}</table>
    </td></tr>`;
}

/* Venue. `entrance` prints ONLY when clinics.js has it verified for this
   date - see the note there. An unverified door is worse than no door. */
function venuePanel(clinicId) {
  const clinic = CLINICS.clinicById(clinicId);
  if (!clinic) return "";
  const loc = CLINICS.location;
  const entrance = clinic.entrance
    ? `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:21px;color:${C.white};padding-top:10px;"><strong>${esc(clinic.entrance)}</strong></div>`
    : "";
  return panel(
    `<div class="jw-display" style="font-family:'Arial Black','Arial Bold',Arial,Helvetica,sans-serif;font-size:18px;line-height:24px;color:${C.white};text-transform:uppercase;">${esc(CLINICS.longDate(clinicId))}</div>` +
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:21px;color:${C.text};padding-top:10px;"><strong style="color:${C.white};text-transform:uppercase;letter-spacing:0.5px;">${esc(loc.name)}</strong><br>${esc(loc.street)}<br>${esc(loc.cityStateZip)}</div>` +
    entrance +
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;padding-top:10px;"><a href="${esc(loc.mapsUrl)}" style="color:${C.redBright};text-decoration:underline;">Open in maps</a></div>`,
    false);
}

/* What to bring. Identical wording in every email that needs it, including
   the line that says a missing basketball is not a reason to stay home. */
function whatToBring() {
  return `<tr><td class="jw-pad" align="left" style="padding:24px 36px 0 36px;font-family:Arial,Helvetica,sans-serif;">
      <div style="font-size:10px;line-height:14px;letter-spacing:2px;color:${C.muted};text-transform:uppercase;font-weight:bold;">What to bring</div>
      <div style="font-size:14px;line-height:24px;color:${C.muted};padding-top:8px;">
        <span style="color:${C.redBright};">&bull;</span>&nbsp; A basketball if you have one<br>
        <span style="color:${C.redBright};">&bull;</span>&nbsp; Water bottle<br>
        <span style="color:${C.redBright};">&bull;</span>&nbsp; Basketball shoes<br>
        <span style="color:${C.redBright};">&bull;</span>&nbsp; Any medication your athlete may need, including an inhaler if applicable
      </div>
      <div style="font-size:13px;line-height:20px;color:${C.faint};padding-top:10px;">No basketball? Come anyway &mdash; we bring spares and nobody sits out for it.</div>
    </td></tr>`;
}

/* ------------------------------------------------------------------ SHELL -- */

function shell(o) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${esc(o.title)}</title>
<style>
  body { margin:0 !important; padding:0 !important; width:100% !important; }
  table { border-collapse:collapse !important; }
  img { border:0; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; }
  a { text-decoration:none; }
  .jw-display { font-family: 'Arial Black','Arial Bold',Arial,Helvetica,sans-serif; }
  @media screen and (max-width:620px) {
    .jw-wrap { width:100% !important; }
    .jw-pad { padding-left:22px !important; padding-right:22px !important; }
    .jw-h1 { font-size:28px !important; line-height:32px !important; }
    .jw-time { font-size:24px !important; line-height:28px !important; }
    .jw-photo { width:100% !important; height:auto !important; }
  }
  @media (prefers-color-scheme: light) { .jw-shell { background:${C.shell} !important; } }
</style>
</head>
<body style="margin:0;padding:0;background:${C.page};">

<div style="display:none;font-size:1px;color:${C.page};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
  ${esc(o.preheader)}
  &#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.page}" style="background:${C.page};">
<tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" class="jw-wrap jw-shell" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.shell}" style="width:600px;max-width:600px;background:${C.shell};">

    <tr><td class="jw-pad" align="left" bgcolor="${C.shell}" style="padding:28px 36px 0 36px;background:${C.shell};">
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:16px;letter-spacing:2px;color:${C.white};font-weight:bold;text-transform:uppercase;">Niles West Junior Wolves</div>
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;line-height:14px;letter-spacing:1.6px;color:${C.muted};text-transform:uppercase;padding-top:5px;">Powered by Triumph Hoops Academy</div>
    </td></tr>

    <tr><td class="jw-pad" style="padding:18px 36px 0 36px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td height="3" bgcolor="${C.red}" width="56" style="height:3px;line-height:3px;font-size:3px;background:${C.red};width:56px;">&nbsp;</td>
        <td height="3" bgcolor="${C.rule}" style="height:3px;line-height:3px;font-size:3px;background:${C.rule};">&nbsp;</td>
      </tr></table>
    </td></tr>

    <tr><td class="jw-pad" align="left" style="padding:26px 36px 0 36px;">
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;line-height:14px;letter-spacing:2px;color:${C.redBright};text-transform:uppercase;font-weight:bold;padding-bottom:10px;">${esc(o.kicker)}</div>
      <div class="jw-display jw-h1" style="font-family:'Arial Black','Arial Bold',Arial,Helvetica,sans-serif;font-size:32px;line-height:36px;color:${C.white};text-transform:uppercase;letter-spacing:-0.3px;">
        ${o.headline}
      </div>
    </td></tr>

    ${o.body}

    ${divider()}

    <tr><td class="jw-pad" align="left" style="padding:22px 36px 0 36px;">
      <img src="${LOGO_URL}" width="160" height="111" alt="Niles West Junior Wolves Basketball" style="display:block;width:160px;max-width:160px;height:auto;border:0;outline:none;text-decoration:none;">
    </td></tr>

    <tr><td class="jw-pad" align="left" style="padding:16px 36px 0 36px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:23px;color:${C.white};">
      <div style="font-weight:bold;">Oli &amp; Marlowe</div>
      <div style="color:${C.muted};font-size:14px;line-height:21px;padding-top:2px;">Junior Wolves<br>Powered by Triumph Hoops Academy</div>
    </td></tr>

    <tr><td class="jw-pad" align="left" style="padding:22px 36px 34px 36px;">
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:20px;color:${C.muted};">
        <a href="mailto:${esc(MAIL_TO)}" style="color:${C.muted};text-decoration:underline;">${esc(MAIL_TO)}</a>
      </div>
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:17px;color:${C.faint};padding-top:12px;">
        ${esc(o.footnote)}
      </div>
    </td></tr>

  </table>
</td></tr>
</table>
</body>
</html>`;
}

/* ------------------------------------------------------------------ PHOTO --
   A campaign photograph, when one has been supplied for that campaign.

   THE SEPT 27 LESSON
     Both follow-up emails shipped with only the logo because nothing verified
     that requested photography was present. `photo` is therefore an explicit
     argument, `hasPhoto()` is a question any QA step can ask of the RENDERED
     html, and a campaign whose brief includes a photo must assert it. */
function photoBlock(photo) {
  if (!photo || !photo.url) return "";
  if (!/^https:\/\//.test(photo.url)) throw new Error("photo url must be absolute https");
  const w = photo.width || 600, h = photo.height || "";
  return `<tr><td class="jw-pad" align="left" style="padding:24px 36px 0 36px;">
      <img class="jw-photo" src="${esc(photo.url)}" width="${w}"${h ? ' height="' + h + '"' : ""} alt="${esc(photo.alt || "Junior Wolves clinic at Niles West")}" style="display:block;width:100%;max-width:528px;height:auto;border:0;outline:none;text-decoration:none;">
      ${photo.caption ? `<div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:${C.faint};padding-top:8px;">${esc(photo.caption)}</div>` : ""}
    </td></tr>`;
}

/* Counts real <img> tags and tells you what they are. A logo-only email
   returns photos: 0, which is the check Sept 27 did not have. */
function imageAudit(html) {
  const srcs = [];
  const re = /<img[^>]*src="([^"]+)"[^>]*>/g;
  let m;
  while ((m = re.exec(html)) !== null) srcs.push(m[1]);
  const logos = srcs.filter(function (s) { return s === LOGO_URL; });
  const photos = srcs.filter(function (s) { return s !== LOGO_URL; });
  return {
    total: srcs.length,
    logo: logos.length,
    photos: photos.length,
    photoUrls: photos,
    allHttps: srcs.every(function (s) { return /^https:\/\//.test(s); })
  };
}

/* --------------------------------------------------------------- GROUPING --
   Household -> one entry per session that household has an athlete in,
   younger first. A household with brothers in different sessions gets both
   times stated separately rather than one averaged line. */
function groupBySession(clinicId, athletes) {
  const clinic = CLINICS.clinicById(clinicId);
  if (!clinic) return [];
  const order = (clinic.sessions || []).map(function (s) { return s.id; });
  const by = {};
  (athletes || []).forEach(function (a) {
    const s = CLINICS.sessionFor(clinicId, a.grade);
    if (!s) return;                       /* unknown grade: never guessed */
    if (!by[s.id]) by[s.id] = { id: s.id, label: s.label, time: s.time, names: [] };
    if (a.first) by[s.id].names.push(a.first);
  });
  return order.map(function (id) { return by[id]; }).filter(Boolean);
}

function firstNames(athletes) {
  return (athletes || []).map(function (a) { return a.first; }).filter(Boolean);
}

/* Verb and pronoun agreement for a household that may have one athlete or
   three. Without this the sibling case reads "Jordan and Casey is on the
   list", which is exactly the sort of thing a parent notices and we do not.
   An empty household falls back to "your athlete", which is singular. */
function agree(names) {
  const plural = (names || []).length > 1;
  return {
    plural: plural,
    is: plural ? "are" : "is",
    he: plural ? "they" : "he",
    his: plural ? "their" : "his",
    lands: plural ? "land" : "lands",
    him: plural ? "them" : "him"
  };
}

/* "Jordan", "Jordan and Casey", "Jordan, Casey and Sam" */
function nameList(names) {
  if (!names.length) return "your athlete";
  if (names.length === 1) return names[0];
  return names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
}

/* RSVP link for one clinic, carrying attribution and preselecting the date. */
function rsvpUrl(clinicId, source) {
  return SITE + "/clinic-rsvp?clinic=" + encodeURIComponent(clinicId) +
         "&source=" + encodeURIComponent(source || "email");
}

/* Feedback link for one clinic. The `source` is what lets us tell a response
   to this email apart from a response to the Sept 29 follow-up, which matters
   because the whole point of this send is finding out whether a louder CTA
   moves the number. */
function feedbackUrl(clinicId, source) {
  return SITE + "/clinic-feedback?clinic=" + encodeURIComponent(clinicId) +
         "&source=" + encodeURIComponent(source || "email");
}

/* A SECONDARY call to action: outlined rather than filled, so it reads as
   clearly subordinate to the red primary while still being a button you
   cannot miss on a phone. The Sept 29 follow-up put feedback in an inline
   sentence and almost nobody saw it - 3 responses from 89 households. A link
   inside a paragraph is not a call to action.

   Built from a bordered table cell rather than CSS borders on an anchor,
   because Outlook drops the latter. */
function buttonOutline(href, label) {
  return `<tr><td class="jw-pad" align="left" style="padding:16px 36px 0 36px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td bgcolor="${C.panel}" style="background:${C.panel};border:2px solid ${C.white};">
          <a href="${href}" style="display:block;padding:14px 28px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:18px;font-weight:bold;letter-spacing:1.4px;text-transform:uppercase;color:${C.white};text-decoration:none;">${esc(label)}</a>
        </td>
      </tr></table>
    </td></tr>`;
}

module.exports = {
  C, esc, shell, prose, small, button, eyebrow, divider, panel,
  sessionPanel, bothSessionsPanel, venuePanel, whatToBring,
  photoBlock, imageAudit,
  groupBySession, firstNames, nameList, agree, rsvpUrl, feedbackUrl, buttonOutline,
  normEmail, validEmail, isPlaceholder, isOrg, sendable, sendableTransactional,
  PLACEHOLDER_DOMAINS, ORG_ADDRESSES, QA_MARKER,
  MAIL_TO, SITE, LOGO_URL, CLINICS
};
