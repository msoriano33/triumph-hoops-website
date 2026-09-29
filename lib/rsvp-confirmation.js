/* ==========================================================================
   JUNIOR WOLVES — CLINIC RSVP CONFIRMATION EMAIL
   --------------------------------------------------------------------------
   PERMANENT INFRASTRUCTURE. Every clinic RSVP that is newly written gets one
   of these, automatically, for every clinic from now on. Nothing about it is
   dated to a single campaign: the date, the time and the grade-based session
   all come from assets/js/clinics.js, so adding a clinic there is the only
   thing needed to make this email correct for it.

   It is sent from api/clinic-rsvp.js AFTER the sheet has confirmed the row,
   and only for a genuinely new row - never on a retry, a duplicate, or an
   RSVP that already existed. A send failure is logged and swallowed: an email
   problem must never turn a saved RSVP into an error for the family.
   ========================================================================== */
"use strict";

const CLINICS = require("../assets/js/clinics.js");

const MAIL_TO = process.env.MAIL_TO || "triumphhoopsacademy@gmail.com";
const MAIL_FROM = process.env.MAIL_FROM || "";
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const RESEND_URL = "https://api.resend.com/emails";
const FROM_DISPLAY = "Niles West Junior Wolves";
const JW_LOGO_URL = "https://www.triumphhoopsacademy.com/assets/img/jr-wolves-email-logo.png";
const SITE = "https://www.triumphhoopsacademy.com";

function senderAddress() {
  const m = MAIL_FROM.match(/<([^>]+)>/);
  const addr = (m ? m[1] : MAIL_FROM).trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(addr) ? addr : "";
}

function esc(v) {
  return String(v == null ? "" : v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* ------------------------------------------------------------------ HTML -- */

function html(o) {
  const sessionBlock = o.sessionLabel
    ? '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#17171a" style="background:#17171a;">' +
        '<tr><td style="padding:18px 22px;border-left:3px solid #c8102e;">' +
          '<div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:15px;letter-spacing:1.6px;color:#a1a1aa;text-transform:uppercase;font-weight:bold;">' + esc(o.sessionLabel) + "</div>" +
          '<div class="jw-display jw-time" style="font-family:\'Arial Black\',\'Arial Bold\',Arial,Helvetica,sans-serif;font-size:30px;line-height:34px;color:#ffffff;padding-top:6px;text-transform:uppercase;">' + esc(o.sessionTime) + "</div>" +
          '<div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:#a1a1aa;padding-top:8px;">' + esc(o.first) + " &middot; " + esc(o.grade) + " grade</div>" +
        "</td></tr></table>"
    : '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#17171a" style="background:#17171a;">' +
        '<tr><td style="padding:18px 22px;border-left:3px solid #c8102e;">' +
          '<div class="jw-display jw-time" style="font-family:\'Arial Black\',\'Arial Bold\',Arial,Helvetica,sans-serif;font-size:30px;line-height:34px;color:#ffffff;text-transform:uppercase;">' + esc(o.clinicTime) + "</div>" +
          '<div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:#a1a1aa;padding-top:8px;">' + esc(o.first) + " &middot; " + esc(o.grade) + " grade</div>" +
        "</td></tr></table>";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>RSVP confirmed</title>
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
    .jw-time { font-size:26px !important; line-height:30px !important; }
  }
  @media (prefers-color-scheme: light) { .jw-shell { background:#0b0b0c !important; } }
</style>
</head>
<body style="margin:0;padding:0;background:#000000;">

<div style="display:none;font-size:1px;color:#000000;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
  ${esc(o.first)} is on the list for ${esc(o.clinicLong)} at Niles West High School.
  &#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#000000" style="background:#000000;">
<tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" class="jw-wrap jw-shell" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#0b0b0c" style="width:600px;max-width:600px;background:#0b0b0c;">

    <tr><td class="jw-pad" align="left" bgcolor="#0b0b0c" style="padding:28px 36px 0 36px;background:#0b0b0c;">
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:16px;letter-spacing:2px;color:#ffffff;font-weight:bold;text-transform:uppercase;">Niles West Junior Wolves</div>
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;line-height:14px;letter-spacing:1.6px;color:#a1a1aa;text-transform:uppercase;padding-top:5px;">Powered by Triumph Hoops Academy</div>
    </td></tr>

    <tr><td class="jw-pad" style="padding:18px 36px 0 36px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td height="3" bgcolor="#c8102e" width="56" style="height:3px;line-height:3px;font-size:3px;background:#c8102e;width:56px;">&nbsp;</td>
        <td height="3" bgcolor="#2a2a2f" style="height:3px;line-height:3px;font-size:3px;background:#2a2a2f;">&nbsp;</td>
      </tr></table>
    </td></tr>

    <tr><td class="jw-pad" align="left" style="padding:26px 36px 0 36px;">
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;line-height:14px;letter-spacing:2px;color:#ff3b52;text-transform:uppercase;font-weight:bold;padding-bottom:10px;">RSVP confirmed</div>
      <div class="jw-display jw-h1" style="font-family:'Arial Black','Arial Bold',Arial,Helvetica,sans-serif;font-size:32px;line-height:36px;color:#ffffff;text-transform:uppercase;letter-spacing:-0.3px;">
        ${esc(o.first)} is on the list for ${esc(o.clinicShortUpper)}.
      </div>
    </td></tr>

    <tr><td class="jw-pad" align="left" style="padding:20px 36px 0 36px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:23px;color:#e4e4e7;">
      <p style="margin:0;">This is your confirmation &mdash; there is nothing else to do. Our coaching staff uses these RSVPs to set group sizes before you arrive, so thank you for letting us know.</p>
    </td></tr>

    <tr><td class="jw-pad" align="left" style="padding:22px 36px 0 36px;">
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;line-height:14px;letter-spacing:2px;color:#a1a1aa;text-transform:uppercase;font-weight:bold;padding-bottom:12px;">${o.sessionLabel ? "Your athlete&rsquo;s session" : "Clinic time"}</div>
      ${sessionBlock}
    </td></tr>

    <tr><td class="jw-pad" align="left" style="padding:14px 36px 0 36px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#17171a" style="background:#17171a;">
        <tr><td style="padding:20px 22px;border-left:3px solid #2a2a2f;">
          <div class="jw-display" style="font-family:'Arial Black','Arial Bold',Arial,Helvetica,sans-serif;font-size:18px;line-height:24px;color:#ffffff;text-transform:uppercase;">${esc(o.clinicLong)}</div>
          <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:21px;color:#e4e4e7;padding-top:10px;"><strong style="color:#ffffff;text-transform:uppercase;letter-spacing:0.5px;">Niles West High School</strong><br>5701 Oakton St<br>Skokie, IL 60077</div>
          <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;padding-top:10px;"><a href="${esc(CLINICS.location.mapsUrl)}" style="color:#ff3b52;text-decoration:underline;">Open in maps</a></div>
        </td></tr>
      </table>
    </td></tr>

    <tr><td class="jw-pad" align="left" style="padding:26px 36px 0 36px;font-family:Arial,Helvetica,sans-serif;">
      <div style="font-size:10px;line-height:14px;letter-spacing:2px;color:#a1a1aa;text-transform:uppercase;font-weight:bold;">What to bring</div>
      <div style="font-size:14px;line-height:24px;color:#a1a1aa;padding-top:8px;">
        <span style="color:#ff3b52;">&bull;</span>&nbsp; Basketball if possible<br>
        <span style="color:#ff3b52;">&bull;</span>&nbsp; Water bottle<br>
        <span style="color:#ff3b52;">&bull;</span>&nbsp; Basketball shoes<br>
        <span style="color:#ff3b52;">&bull;</span>&nbsp; Any medication your athlete may need, including an inhaler if applicable
      </div>
    </td></tr>

    <tr><td class="jw-pad" align="left" style="padding:24px 36px 0 36px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#a1a1aa;">
      <p style="margin:0;">A clinic RSVP is not tryout registration. Clinics are open sessions and do not reserve a roster spot. Tryout registration lives on the <a href="${SITE}/junior-wolves#register" style="color:#ff3b52;text-decoration:underline;">Junior Wolves page</a>.</p>
    </td></tr>

    <tr><td class="jw-pad" align="left" style="padding:22px 36px 0 36px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:23px;color:#e4e4e7;">
      <p style="margin:0;">Plans change &mdash; if ${esc(o.first)} can&rsquo;t make it, just reply to this email so we can free up the spot in the group.</p>
    </td></tr>

    <tr><td class="jw-pad" style="padding:30px 36px 0 36px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td height="1" bgcolor="#2a2a2f" style="height:1px;line-height:1px;font-size:1px;background:#2a2a2f;">&nbsp;</td>
      </tr></table>
    </td></tr>

    <tr><td class="jw-pad" align="left" style="padding:22px 36px 0 36px;">
      <img src="${JW_LOGO_URL}" width="160" height="111" alt="Niles West Junior Wolves Basketball" style="display:block;width:160px;max-width:160px;height:auto;border:0;outline:none;text-decoration:none;">
    </td></tr>

    <tr><td class="jw-pad" align="left" style="padding:16px 36px 0 36px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:23px;color:#ffffff;">
      <div style="font-weight:bold;">Oli &amp; Marlowe</div>
      <div style="color:#a1a1aa;font-size:14px;line-height:21px;padding-top:2px;">Junior Wolves<br>Powered by Triumph Hoops Academy</div>
    </td></tr>

    <tr><td class="jw-pad" align="left" style="padding:22px 36px 34px 36px;">
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:20px;color:#a1a1aa;">
        <a href="mailto:${esc(MAIL_TO)}" style="color:#a1a1aa;text-decoration:underline;">${esc(MAIL_TO)}</a>
      </div>
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:17px;color:#67676f;padding-top:12px;">
        You&rsquo;re receiving this because you RSVPed an athlete for a Niles West Junior Wolves skills clinic.
      </div>
    </td></tr>

  </table>
</td></tr>
</table>
</body>
</html>`;
}

/* ------------------------------------------------------------------ TEXT -- */

function text(o) {
  const lines = ["NILES WEST JUNIOR WOLVES", "", "RSVP CONFIRMED", "",
    o.first + " is on the list for " + o.clinicLong + ".", "",
    "This is your confirmation - there is nothing else to do."];
  if (o.sessionLabel) {
    lines.push("", "YOUR ATHLETE'S SESSION:", "  " + o.sessionLabel + "  " + o.sessionTime);
  } else {
    lines.push("", "CLINIC TIME:", "  " + o.clinicTime);
  }
  lines.push("", o.clinicLong, "Niles West High School", "5701 Oakton St", "Skokie, IL 60077", "",
    "WHAT TO BRING", "  Basketball if possible", "  Water bottle", "  Basketball shoes",
    "  Any medication your athlete may need, including an inhaler if applicable", "",
    "A clinic RSVP is not tryout registration. Clinics are open sessions and do",
    "not reserve a roster spot.", "",
    "If " + o.first + " can't make it, reply to this email so we can free up the spot.", "",
    "Oli & Marlowe", "Junior Wolves", "Powered by Triumph Hoops Academy",
    MAIL_TO);
  return lines.join("\n");
}

/* --------------------------------------------------------------- ASSEMBLE -- */

/* Everything the email says about WHEN comes from clinics.js. If the clinic id
   is unknown we do not guess - we send nothing and say so to the caller. */
function build(o) {
  const clinic = CLINICS.clinicById(o.clinicId);
  if (!clinic) return null;
  const session = CLINICS.sessionFor(o.clinicId, o.grade);
  const view = {
    first: String(o.first || "Your athlete").trim(),
    grade: String(o.grade || "").trim(),
    clinicTime: clinic.time,
    clinicLong: clinic.weekday + ", " + clinic.date + ", " + clinic.id.slice(0, 4),
    clinicShortUpper: clinic.weekday + ", " + clinic.date,
    sessionLabel: session ? session.label : "",
    sessionTime: session ? session.time : ""
  };
  return {
    subject: "RSVP confirmed — " + view.first + " · " + clinic.weekday + ", " + clinic.date,
    html: html(view),
    text: text(view)
  };
}

/* Fire-and-report. Never throws: the RSVP is already saved by the time this
   runs, and no email outcome may change what the family is told about it. */
async function send(o) {
  if (!RESEND_API_KEY) return { sent: false, reason: "no-key" };
  const from = senderAddress();
  if (!from) return { sent: false, reason: "no-sender" };
  const to = String(o.to || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) return { sent: false, reason: "no-recipient" };

  const built = build(o);
  if (!built) return { sent: false, reason: "unknown-clinic" };

  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = setTimeout(function () { if (controller) controller.abort(); }, 6000);
  try {
    const response = await fetch(RESEND_URL, {
      method: "POST",
      signal: controller ? controller.signal : undefined,
      headers: {
        Authorization: "Bearer " + RESEND_API_KEY,
        "Content-Type": "application/json",
        /* One confirmation per RSVP row, even if this code somehow runs twice. */
        "Idempotency-Key": "jw-rsvp-confirm-" + String(o.rsvpId || to + "-" + o.clinicId)
      },
      body: JSON.stringify({
        from: FROM_DISPLAY + " <" + from + ">",
        to: [to],
        reply_to: MAIL_TO,
        subject: built.subject,
        text: built.text,
        html: built.html
      })
    });
    const raw = await response.text().catch(function () { return ""; });
    if (!response.ok) return { sent: false, reason: "resend-" + response.status, detail: raw.slice(0, 200) };
    let data = {};
    try { data = JSON.parse(raw); } catch (e) { /* id is a nicety */ }
    return { sent: true, id: data.id || null };
  } catch (e) {
    return { sent: false, reason: (e && e.name) || "network" };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { build: build, send: send };
