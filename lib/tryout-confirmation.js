/* ==========================================================================
   JUNIOR WOLVES — TRYOUT REGISTRATION CONFIRMATION
   --------------------------------------------------------------------------
   PERMANENT. Every successful tryout registration gets one, automatically,
   from now on. Sent from api/inquiry.js after MASTER REGISTRATIONS has
   confirmed the row - never on a retry, never on a duplicate.

   ITS ONE HARD JOB
     Make the difference between TRYOUT REGISTRATION and CLINIC RSVP
     unmistakable. A family that registers for tryouts has NOT RSVPed for a
     clinic, and two families have already emailed us confused about exactly
     that. So the email states it outright, explains why the two are separate,
     and then offers the clinic RSVP as the obvious next step.

   IT MUST NEVER CLAIM AN RSVP THE ATHLETE DOES NOT HAVE.
     `clinicRsvp` is read from live data by the caller. Only two states are
     ever rendered:
       not RSVPed  -> "RSVP for the next clinic" CTA
       RSVPed      -> "your clinic RSVP is already confirmed" + their session,
                      and NO second RSVP CTA
     If the caller could not determine the state, it passes null and the email
     falls back to the invitation without asserting anything either way.

   NOTHING HERE IS DATED. The next clinic, its sessions and its venue all come
   from assets/js/clinics.js.
   ========================================================================== */
"use strict";

const J = require("./jw-email.js");
const CLINICS = J.CLINICS;

const RESEND_URL = "https://api.resend.com/emails";
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const MAIL_FROM = process.env.MAIL_FROM || "";
const FROM_DISPLAY = "Niles West Junior Wolves";

function senderAddress() {
  const m = MAIL_FROM.match(/<([^>]+)>/);
  const addr = (m ? m[1] : MAIL_FROM).trim();
  return J.validEmail(addr) ? addr : "";
}

/* --------------------------------------------------------------- RENDER -- */

/**
 * @param {object} o
 *   first        athlete first name
 *   grade        athlete grade, e.g. "6th"
 *   clinicId     the next clinic to offer, or null/absent for none
 *   clinicRsvp   true  = already RSVPed for that clinic
 *                false = not RSVPed
 *                null  = unknown; the email asserts neither
 *   photo        optional {url, alt, caption, width, height}
 */
function build(o) {
  const first = String(o.first || "Your athlete").trim();
  const grade = String(o.grade || "").trim();
  const clinic = o.clinicId ? CLINICS.clinicById(o.clinicId) : null;
  const athletes = [{ first: first, grade: grade }];

  const blocks = [];

  blocks.push(J.prose(
    `<p style="margin:0 0 16px 0;">We have <strong style="color:${J.C.white};">${J.esc(first)}</strong>${grade ? `, ${J.esc(grade)} grade,` : ""} on the Junior Wolves tryout list. Nothing else is needed from you for the registration itself.</p>`));

  blocks.push(J.panel(
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:15px;letter-spacing:1.6px;color:${J.C.muted};text-transform:uppercase;font-weight:bold;">Registered for tryouts</div>` +
    `<div class="jw-display" style="font-family:'Arial Black','Arial Bold',Arial,Helvetica,sans-serif;font-size:24px;line-height:28px;color:${J.C.white};padding-top:6px;text-transform:uppercase;">${J.esc(first)}</div>` +
    (grade ? `<div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:${J.C.muted};padding-top:8px;">${J.esc(grade)} grade</div>` : ""),
    true));

  blocks.push(J.prose(
    `<p style="margin:0 0 16px 0;">Registering puts ${J.esc(first)} on the list to be evaluated. It does not reserve a roster spot &mdash; those are earned at tryouts. We will email you the tryout dates and times for his grade as soon as they are set.</p>`));

  if (o.photo) blocks.push(J.photoBlock(o.photo));

  /* ---- The distinction. This is the reason the email exists. ---- */
  blocks.push(J.divider());
  blocks.push(J.eyebrow("One thing to know"));
  blocks.push(J.prose(
    `<p style="margin:0 0 16px 0;"><strong style="color:${J.C.white};">${J.esc(first)} is registered for Junior Wolves tryouts. This does not automatically RSVP ${J.esc(first)} for a Junior Wolves clinic.</strong></p>` +
    `<p style="margin:0;">They are two separate things on purpose. Clinics are free, open sessions that anyone in the district can attend; tryouts are how rosters get decided. We ask for a clinic RSVP separately because it is how our coaching staff knows how many athletes to expect, builds the grade groups before anyone walks in, and keeps the groups small enough to actually coach.</p>`));

  if (clinic && o.clinicRsvp === true) {
    /* Already on the list. Confirm it, show the session, and do NOT ask
       again - a second CTA here is what makes families RSVP twice. */
    blocks.push(J.divider());
    blocks.push(J.eyebrow("Your next clinic"));
    blocks.push(J.prose(
      `<p style="margin:0;"><strong style="color:${J.C.white};">Your ${J.esc(clinic.date)} clinic RSVP is already confirmed.</strong> Nothing more to do &mdash; here is when ${J.esc(first)} is on the floor.</p>`));
    blocks.push(J.sessionPanel(o.clinicId, athletes));
    blocks.push(J.venuePanel(o.clinicId));
    blocks.push(J.whatToBring());
  } else if (clinic) {
    /* Not RSVPed, or unknown. Invite - and never claim they are confirmed. */
    blocks.push(J.divider());
    blocks.push(J.eyebrow("The next clinic"));
    blocks.push(J.prose(
      `<p style="margin:0;">${J.esc(first)} is welcome at our next one, free, whatever happens at tryouts.</p>`));
    blocks.push(J.sessionPanel(o.clinicId, athletes));
    blocks.push(J.venuePanel(o.clinicId));
    blocks.push(J.prose(
      `<p style="margin:0;">It takes about thirty seconds. Because ${J.esc(first)} is already registered, we can look him up &mdash; you will not have to type his details again.</p>`));
    blocks.push(J.button(J.rsvpUrl(o.clinicId, "tryout_confirmation"), "RSVP for the next clinic"));
  } else {
    /* Season over, or no clinic configured. Say nothing rather than invent. */
    blocks.push(J.small(
      `<p style="margin:0;">There is no clinic on the calendar right now. When the next one is scheduled we will email you, and you can RSVP then.</p>`));
  }

  blocks.push(J.prose(`<p style="margin:0;">Questions about any of this? Just reply to this email.</p>`));

  const html = J.shell({
    title: "Tryout registration received",
    preheader: first + " is on the Junior Wolves tryout list. A clinic RSVP is separate — here is how to do it.",
    kicker: "Tryout registration received",
    headline: `${J.esc(first)} is on the<br>tryout list.`,
    body: blocks.join("\n"),
    footnote: "You are receiving this because you registered an athlete for Niles West Junior Wolves tryouts."
  });

  /* Guards. A failure here refuses to send rather than sending something
     wrong - the whole point of this email is that it cannot mislead. */
  if (/\/dev/.test(html)) throw new Error("refusing to send: /dev URL in body");
  if (html.indexOf("PLACEHOLDER") !== -1) throw new Error("unreplaced placeholder");
  if (o.clinicRsvp === true && html.indexOf("RSVP for the next clinic") !== -1) {
    throw new Error("already-RSVPed email must not carry an RSVP CTA");
  }
  if (o.clinicRsvp !== true && /RSVP is already confirmed/.test(html)) {
    throw new Error("must not claim an RSVP that was not verified");
  }

  return {
    subject: "Tryout registration received — " + first,
    html: html,
    text: text(o, first, grade, clinic),
    images: J.imageAudit(html)
  };
}

function text(o, first, grade, clinic) {
  const lines = ["NILES WEST JUNIOR WOLVES", "", "TRYOUT REGISTRATION RECEIVED", "",
    first + (grade ? ", " + grade + " grade," : "") + " is on the Junior Wolves tryout list.",
    "Nothing else is needed from you for the registration itself.", "",
    "Registering puts " + first + " on the list to be evaluated. It does not",
    "reserve a roster spot - those are earned at tryouts. We will email you the",
    "tryout dates and times for his grade as soon as they are set.", "",
    "ONE THING TO KNOW", "",
    first + " is registered for Junior Wolves tryouts. This does NOT",
    "automatically RSVP " + first + " for a Junior Wolves clinic.", "",
    "They are separate on purpose. Clinics are free, open sessions anyone in",
    "the district can attend; tryouts are how rosters get decided. We ask for a",
    "clinic RSVP separately because it is how our staff knows how many athletes",
    "to expect, builds the grade groups before anyone walks in, and keeps the",
    "groups small enough to actually coach."];

  if (clinic && o.clinicRsvp === true) {
    const s = CLINICS.sessionFor(clinic.id, grade);
    lines.push("", "YOUR " + clinic.date.toUpperCase() + " CLINIC RSVP IS ALREADY CONFIRMED", "",
      "  " + CLINICS.longDate(clinic.id),
      "  " + (s ? s.label + "  " + s.time : clinic.time),
      "  " + CLINICS.location.name + ", " + CLINICS.location.street + ", " + CLINICS.location.cityStateZip);
    if (clinic.entrance) lines.push("  " + clinic.entrance);
    lines.push("", "WHAT TO BRING", "  A basketball if you have one", "  Water bottle",
      "  Basketball shoes", "  Any medication your athlete may need, including an inhaler",
      "", "No basketball? Come anyway - we bring spares and nobody sits out for it.");
  } else if (clinic) {
    const s = CLINICS.sessionFor(clinic.id, grade);
    lines.push("", "THE NEXT CLINIC", "",
      "  " + CLINICS.longDate(clinic.id),
      "  " + (s ? s.label + "  " + s.time : clinic.time),
      "  " + CLINICS.location.name + ", " + CLINICS.location.street + ", " + CLINICS.location.cityStateZip,
      "", "RSVP: " + J.rsvpUrl(clinic.id, "tryout_confirmation"),
      "Because " + first + " is already registered, we can look him up - you will",
      "not have to type his details again.");
  } else {
    lines.push("", "There is no clinic on the calendar right now. When the next one is",
      "scheduled we will email you, and you can RSVP then.");
  }

  lines.push("", "Questions? Reply to this email.", "",
    "Oli & Marlowe", "Junior Wolves", "Powered by Triumph Hoops Academy", J.MAIL_TO);
  return lines.join("\n");
}

/* ----------------------------------------------------------------- SEND -- */

/* Never throws. The registration is already saved by the time this runs, and
   no email outcome may change what the family is told about it. */
async function send(o) {
  if (!RESEND_API_KEY) return { sent: false, reason: "no-key" };
  const from = senderAddress();
  if (!from) return { sent: false, reason: "no-sender" };

  /* Transactional: a receipt is owed to whoever registered, including
     Triumph's own mailbox. Only an undeliverable address is refused. */
  const check = J.sendableTransactional(o.to);
  if (!check.ok) return { sent: false, reason: "recipient-" + check.reason };

  let built;
  try { built = build(o); }
  catch (e) { return { sent: false, reason: "render", detail: e.message }; }

  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = setTimeout(function () { if (controller) controller.abort(); }, 6000);
  try {
    const response = await fetch(RESEND_URL, {
      method: "POST",
      signal: controller ? controller.signal : undefined,
      headers: {
        Authorization: "Bearer " + RESEND_API_KEY,
        "Content-Type": "application/json",
        /* One per registration. Keyed on the Submission ID, so a retried
           submission that resolves to the same row cannot send twice. */
        "Idempotency-Key": "jw-tryout-confirm-" + String(o.submissionId || check.email)
      },
      body: JSON.stringify({
        from: FROM_DISPLAY + " <" + from + ">",
        to: [check.email],
        reply_to: J.MAIL_TO,
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
