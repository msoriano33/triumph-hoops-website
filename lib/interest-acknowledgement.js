/* ==========================================================================
   JUNIOR WOLVES — INTEREST FORM ACKNOWLEDGEMENT  (added 2026-09-30)
   --------------------------------------------------------------------------
   The Wednesday audit found 94 interest submissions that never received
   anything, because the only family-facing email on the registration path
   fires on source === "junior_wolves_tryout". This is the missing receipt.

   WHAT THIS EMAIL IS FOR
     An interest form is the weakest commitment a family can make, which makes
     it the easiest one to misread. A parent who fills one in can reasonably
     believe they have signed their child up. This email exists to say, kindly
     and immediately, that they have not - and to make the real next step
     obvious.

     Acknowledgement first. What it is NOT, second. Next action, third.
     One secondary opportunity at most. Nothing else.

   WHAT IT MUST NEVER DO
     - claim the athlete is registered for tryouts
     - claim a clinic RSVP the family has not made
     - imply a roster spot
     - carry two competing primary CTAs

   A NOTE ON WHEN THIS FIRES
     The Junior Wolves page runs ONE form in two modes. While tryout
     registration is open it posts source=junior_wolves_tryout; only in the
     pre-launch mode does it post junior_wolves_interest. So this email is
     dormant whenever registration is open, and wakes up for the next
     pre-launch window. `tryoutOpen` is passed in rather than assumed.
   ========================================================================== */

const J = require("./jw-email.js");
const CLINICS = require("../assets/js/clinics.js");

const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const MAIL_FROM = process.env.MAIL_FROM || "";
const REPLY_TO = process.env.MAIL_TO || "triumphhoopsacademy@gmail.com";

function build(o) {
  const first = String(o.first || "Your athlete").trim();
  const grade = String(o.grade || "").trim();
  const clinic = o.clinicId ? CLINICS.clinicById(o.clinicId) : null;
  const tryoutOpen = o.tryoutOpen === true;

  const blocks = [];

  /* ---- 1. ACKNOWLEDGEMENT ------------------------------------------- */
  blocks.push(J.prose(
    `<p style="margin:0 0 16px 0;">We have <strong style="color:${J.C.white};">${J.esc(first)}</strong>${grade ? `, ${J.esc(grade)} grade,` : ""} on the Niles West Junior Wolves interest list. Nothing else is needed from you right now.</p>`));

  blocks.push(J.panel(
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:15px;letter-spacing:1.6px;color:${J.C.muted};text-transform:uppercase;font-weight:bold;">On the interest list</div>` +
    `<div class="jw-display" style="font-family:'Arial Black','Arial Bold',Arial,Helvetica,sans-serif;font-size:24px;line-height:28px;color:${J.C.white};padding-top:6px;text-transform:uppercase;">${J.esc(first)}</div>` +
    (grade ? `<div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:${J.C.muted};padding-top:8px;">${J.esc(grade)} grade</div>` : ""),
    true));

  /* ---- 2. WHAT THIS IS NOT ------------------------------------------ */
  blocks.push(J.divider());
  blocks.push(J.eyebrow("What this is, and what it is not"));
  blocks.push(J.prose(
    `<p style="margin:0 0 16px 0;"><strong style="color:${J.C.white};">The interest list is not a tryout registration.</strong> ${J.esc(first)} is not signed up to try out, and no roster spot is being held. Roster spots are earned at tryouts, never before them.</p>` +
    `<p style="margin:0 0 16px 0;"><strong style="color:${J.C.white};">It is also not a clinic RSVP.</strong> Our free skills clinics are a separate sign-up, because the coaching staff builds the grade groups from the RSVP list before anyone walks in.</p>` +
    `<p style="margin:0;">What it does do is make sure you hear from us first &mdash; when tryout registration opens, when a clinic is scheduled, and when anything about the season is locked in.</p>`));

  /* ---- 3. THE NEXT ACTION ------------------------------------------- */
  blocks.push(J.divider());
  if (tryoutOpen) {
    blocks.push(J.eyebrow("Tryout registration is open"));
    blocks.push(J.prose(
      `<p style="margin:0;">If you want ${J.esc(first)} evaluated for a Junior Wolves team this season, this is the step that actually does it.</p>`));
    blocks.push(J.button("https://www.triumphhoopsacademy.com/junior-wolves?source=interest_ack",
      "Register for tryouts"));
  } else {
    blocks.push(J.eyebrow("What happens next"));
    blocks.push(J.prose(
      `<p style="margin:0;">Tryout registration is not open yet. When it opens we will email you at this address with the dates for ${J.esc(first)}&rsquo;s grade and a direct link to register. You do not need to check back.</p>`));
  }

  /* ---- 4. ONE SECONDARY OPPORTUNITY, AT MOST ------------------------ */
  if (clinic) {
    blocks.push(J.divider());
    blocks.push(J.eyebrow("In the meantime"));
    blocks.push(J.prose(
      `<p style="margin:0;">Our next free skills clinic is <strong style="color:${J.C.white};">${J.esc(CLINICS.longDate(clinic.id))}</strong> at Niles West. It is open to any athlete in the district, it costs nothing, and it is the easiest way to meet the coaching staff before tryouts.</p>`));
    blocks.push(J.small(
      `<p style="margin:0;"><a href="${J.rsvpUrl(clinic.id, "interest_ack")}" style="color:${J.C.white};">RSVP for the ${J.esc(clinic.date)} clinic</a></p>`));
  }

  blocks.push(J.prose(`<p style="margin:0;">Questions? Just reply to this email.</p>`));

  const html = J.shell({
    title: "Junior Wolves interest received",
    preheader: first + " is on the Junior Wolves interest list. This is not a tryout registration — here is what happens next.",
    kicker: "Interest received",
    headline: `${J.esc(first)} is on the<br>interest list.`,
    body: blocks.join("\n"),
    footnote: "You are receiving this because you submitted the Niles West Junior Wolves interest form."
  });

  /* Guards. The whole point of this email is that it cannot mislead, so a
     violation refuses to send rather than sending something wrong. */
  if (/\/dev/.test(html)) throw new Error("refusing to send: /dev URL in body");
  if (html.indexOf("PLACEHOLDER") !== -1) throw new Error("unreplaced placeholder");
  if (html.indexOf("undefined") !== -1) throw new Error("undefined leaked into body");
  if (/registered for tryouts\b/i.test(html) && !/not a tryout registration/i.test(html)) {
    throw new Error("must not imply a tryout registration");
  }
  if (/RSVP is (already )?confirmed/i.test(html)) {
    throw new Error("must not claim a clinic RSVP");
  }
  /* Exactly one primary button at most. Two CTAs is how a family ends up
     doing neither. J.button() is the only helper that renders an anchor with
     padding:15px 30px, so that is the signature we count - a class name this
     template never sets would be a guard that can never fire. */
  const buttons = (html.match(/padding:15px 30px;/g) || []).length;
  if (buttons > 1) throw new Error("more than one primary CTA: " + buttons);
  if (tryoutOpen && buttons !== 1) throw new Error("tryout CTA missing while registration is open");
  if (!tryoutOpen && buttons !== 0) throw new Error("must not push a CTA while registration is closed");

  return {
    subject: "Junior Wolves interest received — " + first,
    html: html,
    text: text(o, first, grade, clinic, tryoutOpen),
    images: J.imageAudit(html)
  };
}

function text(o, first, grade, clinic, tryoutOpen) {
  const lines = ["NILES WEST JUNIOR WOLVES", "", "INTEREST RECEIVED", "",
    first + (grade ? ", " + grade + " grade," : "") + " is on the Niles West Junior Wolves",
    "interest list. Nothing else is needed from you right now.", "",
    "WHAT THIS IS, AND WHAT IT IS NOT", "",
    "The interest list is NOT a tryout registration. " + first + " is not",
    "signed up to try out, and no roster spot is being held. Roster spots",
    "are earned at tryouts, never before them.", "",
    "It is also NOT a clinic RSVP. Our free skills clinics are a separate",
    "sign-up, because the coaching staff builds the grade groups from the",
    "RSVP list before anyone walks in.", "",
    "What it does do is make sure you hear from us first - when tryout",
    "registration opens, when a clinic is scheduled, and when anything",
    "about the season is locked in.", ""];

  if (tryoutOpen) {
    lines.push("TRYOUT REGISTRATION IS OPEN", "",
      "If you want " + first + " evaluated for a Junior Wolves team this",
      "season, this is the step that actually does it:",
      "https://www.triumphhoopsacademy.com/junior-wolves?source=interest_ack", "");
  } else {
    lines.push("WHAT HAPPENS NEXT", "",
      "Tryout registration is not open yet. When it opens we will email you",
      "at this address with the dates for " + first + "'s grade and a direct",
      "link to register. You do not need to check back.", "");
  }

  if (clinic) {
    lines.push("IN THE MEANTIME", "",
      "Our next free skills clinic is " + CLINICS.longDate(clinic.id) + " at",
      "Niles West. Open to any athlete in the district, no cost.",
      J.rsvpUrl(clinic.id, "interest_ack"), "");
  }

  lines.push("Questions? Just reply to this email.", "",
    "You are receiving this because you submitted the Niles West Junior",
    "Wolves interest form.");
  return lines.join("\n");
}

async function send(o) {
  if (!RESEND_API_KEY) return { sent: false, reason: "no-key" };
  const from = MAIL_FROM || "Niles West Junior Wolves <noreply@triumphhoopsacademy.com>";
  const check = J.sendableTransactional(o.to);
  if (!check.ok) return { sent: false, reason: "recipient-" + check.reason };

  let built;
  try { built = build(o); }
  catch (e) { return { sent: false, reason: "render", detail: e.message }; }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + RESEND_API_KEY,
        "Content-Type": "application/json",
        /* Deterministic: the same submission can never produce two emails. */
        "Idempotency-Key": "jw-confirm-jw_interest-" + String(o.submissionId || check.email)
      },
      body: JSON.stringify({
        from: from, to: check.email, reply_to: REPLY_TO,
        subject: built.subject, html: built.html, text: built.text
      })
    });
    const raw = await response.text();
    if (!response.ok) {
      return { sent: false, reason: "resend-" + response.status,
               status: response.status, detail: raw.slice(0, 200) };
    }
    let data = {};
    try { data = JSON.parse(raw); } catch (e) { /* accepted but unparsable */ }
    return { sent: true, id: data.id || null, status: response.status };
  } catch (e) {
    return { sent: false, reason: (e && e.name) || "network" };
  }
}

module.exports = { build, send };
