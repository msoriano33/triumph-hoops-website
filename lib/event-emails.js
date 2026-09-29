/* ==========================================================================
   JUNIOR WOLVES — RSVP EVENT COMMUNICATION LIFECYCLE
   --------------------------------------------------------------------------
   The default cadence for any RSVP-based Junior Wolves event. Four stages,
   two audiences, one configuration.

     STAGE         WHEN        AUDIENCE                  JOB
     reminder6     T-6 days    eligible, NOT RSVPed      why to come + RSVP
     reminder2     T-2 days    eligible, STILL not       headcount + RSVP
     logistics     T-1 day     CONFIRMED RSVPs only      where, when, bring
     morning       event day   CONFIRMED RSVPs only      short. see you today.

   THE TWO TRACKS NEVER MIX. A family that RSVPs after the 6-day reminder
   simply is not in the 2-day audience when it is computed, because the
   audience is computed from live RSVP state at send time and never stored.
   There is no list to forget to update.

   EVERY STAGE IS EVENT-AGNOSTIC. Each render takes a clinicId and reads
   assets/js/clinics.js for the date, the grade split, the session times, the
   venue and the entrance. October 11 and October 25 are the same code.

   Marketing language is allowed in reminder6 and reminder2, which exist to
   persuade. It is BANNED in logistics and morning, which go to families who
   have already said yes - selling to them is how you get ignored on the day
   it matters. The renderers enforce that.
   ========================================================================== */
"use strict";

const J = require("./jw-email.js");
const CLINICS = J.CLINICS;

/* Every household-facing render takes the same shape, so the sender can treat
   all four stages identically:
     household = { athletes: [{first, grade}, ...] }   (may be empty)
     clinicId  = "YYYY-MM-DD"
     photo     = optional {url, alt, caption}
*/

/* --------------------------------------------------- T-6  MAIN REMINDER -- */

function reminder6(clinicId, household, photo) {
  const clinic = need(clinicId);
  const names = J.firstNames(household && household.athletes);
  const who = J.nameList(names);
  const known = J.groupBySession(clinicId, household && household.athletes).length > 0;

  const blocks = [];
  blocks.push(J.prose(
    `<p style="margin:0 0 16px 0;">Our next free Junior Wolves skills clinic is <strong style="color:${J.C.white};">${J.esc(CLINICS.longDate(clinicId))}</strong> at Niles West, and we would like ${J.esc(who)} there.</p>` +
    `<p style="margin:0 0 16px 0;">These are real practices. Ball handling under pressure, shooting off the catch, closeouts, and live work where coaches stop play to fix spacing and decision-making instead of letting it run. Boys leave having been corrected on something specific, which is the whole point.</p>` +
    `<p style="margin:0;">It is free, it is open to any boy in grades 3rd&ndash;8th in the district, and no roster spot is required.</p>`));

  if (photo) blocks.push(J.photoBlock(photo));

  blocks.push(J.eyebrow(known ? "Your athlete's session" : "Two grade sessions"));
  blocks.push(known ? J.sessionPanel(clinicId, household.athletes) : J.bothSessionsPanel(clinicId));
  blocks.push(J.venuePanel(clinicId));

  blocks.push(J.prose(
    `<p style="margin:0;">We ask for an RSVP because it is how the staff sets group sizes before anyone walks in. It takes about thirty seconds, and if your athlete is already registered for tryouts we can look him up so you barely type anything.</p>`));
  blocks.push(J.button(J.rsvpUrl(clinicId, "reminder6"), "RSVP for " + clinic.date));
  blocks.push(J.small(`<p style="margin:0;">Already RSVPed? Then you can ignore this &mdash; our lists crossed.</p>`));

  return finish({
    stage: "reminder6", clinicId: clinicId,
    subject: "Free Junior Wolves clinic — " + CLINICS.longDate(clinicId),
    title: "Junior Wolves clinic",
    preheader: "Free skills clinic at Niles West on " + clinic.date + ". RSVP so we can build the groups.",
    kicker: "Free skills clinic · " + clinic.date,
    headline: `Come get<br>coached.`,
    body: blocks,
    footnote: "You are receiving this because you are on the Niles West Junior Wolves list or have registered an athlete with Triumph Hoops Academy.",
    requiresCta: true
  }, household, photo);
}

function reminder6Text(clinicId, household) {
  const clinic = need(clinicId);
  const who = J.nameList(J.firstNames(household && household.athletes));
  return ["NILES WEST JUNIOR WOLVES", "", "COME GET COACHED", "",
    "Our next free Junior Wolves skills clinic is " + CLINICS.longDate(clinicId),
    "at Niles West, and we would like " + who + " there.", "",
    "These are real practices. Ball handling under pressure, shooting off the",
    "catch, closeouts, and live work where coaches stop play to fix spacing and",
    "decision-making instead of letting it run.", "",
    "Free. Open to any boy in grades 3rd-8th in the district. No roster spot",
    "required.", ""].concat(sessionLines(clinicId, household))
    .concat(["", "RSVP: " + J.rsvpUrl(clinicId, "reminder6"), "",
      "We ask because it is how the staff sets group sizes before anyone walks",
      "in. If your athlete is already registered for tryouts we can look him up.", "",
      "Already RSVPed? Ignore this - our lists crossed.", "",
      "Oli & Marlowe", "Junior Wolves", "Powered by Triumph Hoops Academy"]).join("\n");
}

/* ------------------------------------------------- T-2  FINAL HEADCOUNT -- */

function reminder2(clinicId, household, photo) {
  const clinic = need(clinicId);
  const names = J.firstNames(household && household.athletes);
  const who = J.nameList(names);
  const known = J.groupBySession(clinicId, household && household.athletes).length > 0;
  const g2 = J.agree(names);

  const blocks = [];
  blocks.push(J.prose(
    `<p style="margin:0 0 16px 0;">Coaches are setting the groups for <strong style="color:${J.C.white};">${J.esc(CLINITE(clinicId))}</strong> now.</p>` +
    `<p style="margin:0;">If ${J.esc(who)} ${g2.is} planning to come, please RSVP today so ${g2.he} ${g2.lands} in the right group rather than being slotted in at the door.</p>`));

  blocks.push(known ? J.sessionPanel(clinicId, household.athletes) : J.bothSessionsPanel(clinicId));
  blocks.push(J.venuePanel(clinicId));
  blocks.push(J.button(J.rsvpUrl(clinicId, "reminder2"), "RSVP now"));
  blocks.push(J.small(`<p style="margin:0;">Still free. Still open to any 3rd&ndash;8th grade boy in the district. Already RSVPed? You are set &mdash; ignore this.</p>`));

  return finish({
    stage: "reminder2", clinicId: clinicId,
    subject: "Coaches are setting groups — RSVP for " + clinic.date,
    title: "RSVP for " + clinic.date,
    preheader: "We are building the grade groups for " + clinic.date + ". RSVP today if your athlete is coming.",
    kicker: clinic.date + " · Two days out",
    headline: `We're building<br>the groups.`,
    body: blocks,
    footnote: "You are receiving this because you are on the Niles West Junior Wolves list or have registered an athlete with Triumph Hoops Academy.",
    requiresCta: true
  }, household, photo);
}

function reminder2Text(clinicId, household) {
  const who = J.nameList(J.firstNames(household && household.athletes));
  const gt = J.agree(J.firstNames(household && household.athletes));
  return ["NILES WEST JUNIOR WOLVES", "", "WE'RE BUILDING THE GROUPS", "",
    "Coaches are setting the groups for " + CLINICS.longDate(clinicId) + " now.", "",
    "If " + who + " " + gt.is + " planning to come, please RSVP today so " + gt.he,
    gt.lands + " in the right group rather than being slotted in at the door.", ""]
    .concat(sessionLines(clinicId, household))
    .concat(["", "RSVP: " + J.rsvpUrl(clinicId, "reminder2"), "",
      "Still free. Still open to any 3rd-8th grade boy in the district.",
      "Already RSVPed? You are set - ignore this.", "",
      "Oli & Marlowe", "Junior Wolves", "Powered by Triumph Hoops Academy"]).join("\n");
}

/* ------------------------------------------------ T-1  CONFIRMED FAMILY -- */

function logistics(clinicId, household, photo) {
  const clinic = need(clinicId);
  const names = J.firstNames(household && household.athletes);
  const who = J.nameList(names);
  const groups = J.groupBySession(clinicId, household && household.athletes);

  const blocks = [];
  const g = J.agree(names);
  blocks.push(J.prose(
    `<p style="margin:0;">${J.esc(who)} ${g.is} on the list for tomorrow. Here is everything you need, in one place.</p>` +
    (groups.length > 1 ? `<p style="margin:16px 0 0 0;">Your athletes are in different grade groups, so they have different times. Both are below.</p>` : "")));

  blocks.push(J.eyebrow(groups.length > 1 ? "Your athletes' sessions" : "Your athlete's session"));
  blocks.push(J.sessionPanel(clinicId, household && household.athletes));
  blocks.push(J.venuePanel(clinicId));
  if (!clinic.entrance) {
    blocks.push(J.small(`<p style="margin:0;">We will point you to the right door at the building &mdash; look for Junior Wolves staff at the main entrance.</p>`));
  }
  blocks.push(J.whatToBring());
  blocks.push(J.prose(`<p style="margin:0;">Plans changed? Reply to this email so we can free ${g.plural ? "their spots" : "the spot"} in the group.</p>`));

  return finish({
    stage: "logistics", clinicId: clinicId,
    subject: "Tomorrow — " + (groups.length ? groups[0].time : clinic.time) + " at Niles West",
    title: "Tomorrow at Niles West",
    preheader: who + " " + g.is + " on the list for tomorrow at Niles West. Session time, address and what to bring.",
    kicker: "Tomorrow · " + clinic.date,
    headline: `See you<br>tomorrow.`,
    body: blocks,
    footnote: "You are receiving this because you RSVPed an athlete for this Junior Wolves clinic.",
    noSell: true
  }, household, photo);
}

function logisticsText(clinicId, household) {
  const clinic = need(clinicId);
  const who = J.nameList(J.firstNames(household && household.athletes));
  const g = J.agree(J.firstNames(household && household.athletes));
  const lines = ["NILES WEST JUNIOR WOLVES", "", "SEE YOU TOMORROW", "",
    who + " " + g.is + " on the list for tomorrow.", ""]
    .concat(sessionLines(clinicId, household));
  if (!clinic.entrance) {
    lines.push("", "We will point you to the right door at the building - look for Junior",
      "Wolves staff at the main entrance.");
  }
  lines.push("", "WHAT TO BRING", "  A basketball if you have one", "  Water bottle",
    "  Basketball shoes", "  Any medication your athlete may need, including an inhaler", "",
    "No basketball? Come anyway - we bring spares and nobody sits out for it.", "",
    "Plans changed? Reply to this email so we can free the spot in the group.", "",
    "Oli & Marlowe", "Junior Wolves", "Powered by Triumph Hoops Academy");
  return lines.join("\n");
}

/* -------------------------------------------------- EVENT DAY  MORNING -- */

function morning(clinicId, household, photo) {
  const clinic = need(clinicId);
  const who = J.nameList(J.firstNames(household && household.athletes));

  const blocks = [];
  blocks.push(J.sessionPanel(clinicId, household && household.athletes));
  blocks.push(J.venuePanel(clinicId));
  blocks.push(J.small(
    `<p style="margin:0;">Water, basketball shoes, a ball if you have one, and any medication ${J.esc(who)} may need &mdash; including an inhaler if applicable.</p>`));

  return finish({
    stage: "morning", clinicId: clinicId,
    subject: "See you today — " + clinic.date,
    title: "See you today",
    preheader: "Today at Niles West. Session time, address and the short list.",
    kicker: "Today · " + clinic.date,
    headline: `See you<br>today.`,
    body: blocks,
    footnote: "You are receiving this because you RSVPed an athlete for this Junior Wolves clinic.",
    noSell: true,
    maxBytes: 14000
  }, household, photo);
}

function morningText(clinicId, household) {
  const who = J.nameList(J.firstNames(household && household.athletes));
  return ["NILES WEST JUNIOR WOLVES", "", "SEE YOU TODAY", ""]
    .concat(sessionLines(clinicId, household))
    .concat(["", "Water. Basketball shoes. A ball if you have one. Any medication " + who,
      "may need, including an inhaler if applicable.", "",
      "Oli & Marlowe", "Junior Wolves"]).join("\n");
}

/* ------------------------------------------------------------- INTERNAL -- */

function need(clinicId) {
  const c = CLINICS.clinicById(clinicId);
  if (!c) throw new Error("unknown clinic: " + clinicId);
  return c;
}
function CLINITE(clinicId) { return CLINICS.longDate(clinicId); }

function sessionLines(clinicId, household) {
  const clinic = need(clinicId);
  const groups = J.groupBySession(clinicId, household && household.athletes);
  const loc = CLINICS.location;
  const out = [CLINICS.longDate(clinicId)];
  if (groups.length) groups.forEach(function (g) {
    out.push("  " + g.label + "  " + g.time + (g.names.length ? "  (" + g.names.join(" & ") + ")" : ""));
  });
  else if (clinic.sessions) clinic.sessions.forEach(function (s) { out.push("  " + s.label + "  " + s.time); });
  else out.push("  " + clinic.time);
  out.push("  " + loc.name, "  " + loc.street, "  " + loc.cityStateZip);
  if (clinic.entrance) out.push("  " + clinic.entrance);
  return out;
}

/* Renders the shell and runs the guards every stage must pass. */
function finish(spec, household, photo) {
  const html = J.shell({
    title: spec.title,
    preheader: spec.preheader,
    kicker: spec.kicker,
    headline: spec.headline,
    body: spec.body.join("\n"),
    footnote: spec.footnote
  });

  if (/\/dev/.test(html)) throw new Error(spec.stage + ": /dev URL in body");
  if (html.indexOf("undefined") !== -1) throw new Error(spec.stage + ": undefined leaked into the body");

  /* A confirmed family must never be sold to, and must never be asked to do
     the thing they have already done. */
  if (spec.noSell && /RSVP for |RSVP now|RSVP so |please RSVP/i.test(html)) {
    throw new Error(spec.stage + ": confirmed-family email must carry no RSVP ask");
  }
  if (spec.requiresCta && html.indexOf("/clinic-rsvp?clinic=") === -1) {
    throw new Error(spec.stage + ": reminder must carry an RSVP CTA");
  }
  /* The entrance is printed only from verified config, never invented. */
  const clinic = need(spec.clinicId);
  if (!clinic.entrance && /\bdoor\s*\d+/i.test(html)) {
    throw new Error(spec.stage + ": a door number appeared but none is verified for this event");
  }
  if (spec.maxBytes && html.length > spec.maxBytes) {
    throw new Error(spec.stage + ": too long (" + html.length + " > " + spec.maxBytes + ")");
  }
  /* A campaign that was briefed with a photo must actually carry it. */
  const audit = J.imageAudit(html);
  if (photo && audit.photos < 1) throw new Error(spec.stage + ": photo was supplied but is not in the rendered html");
  if (!audit.allHttps) throw new Error(spec.stage + ": a non-https image url");

  return { stage: spec.stage, clinicId: spec.clinicId, subject: spec.subject, html: html, images: audit };
}

/* One table, so adding a stage means adding a row - not editing a sender. */
const STAGES = {
  reminder6: { render: reminder6, text: reminder6Text, segment: "not_rsvpd", offsetDays: -6,
               label: "Main RSVP reminder (T-6)" },
  reminder2: { render: reminder2, text: reminder2Text, segment: "not_rsvpd", offsetDays: -2,
               label: "Final headcount reminder (T-2)" },
  logistics: { render: logistics, text: logisticsText, segment: "rsvpd",     offsetDays: -1,
               label: "Confirmed-family logistics (T-1)" },
  morning:   { render: morning,   text: morningText,   segment: "rsvpd",     offsetDays: 0,
               label: "Event-day morning reminder" }
};

function stage(name) { return Object.prototype.hasOwnProperty.call(STAGES, name) ? STAGES[name] : null; }

module.exports = { STAGES, stage, reminder6, reminder2, logistics, morning };
