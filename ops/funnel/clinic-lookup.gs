/* ==========================================================================
   JUNIOR WOLVES — CLINIC RSVP FUNNEL: ATHLETE LOOKUP  (added 2026-09-29)
   --------------------------------------------------------------------------
   READ-ONLY. Added for the "have you already registered for tryouts?" funnel.
   It never writes, never edits, and never touches the existing clinicRsvp_
   path. Dropping this function out again leaves the RSVP pipeline exactly as
   it was on 2026-09-27.

   WHY A TOKEN AND NOT THE ROW
     The browser is told only what it must show the parent: display name and
     grade. Everything else the RSVP needs — school, parent name, parent email —
     stays server-side. The browser carries back an HMAC of the Submission ID
     plus the clinic id, so the confirm step proves the server itself found
     this athlete rather than trusting a row number from the client.

   WHY MATCHING IS CONSERVATIVE
     Sept 27 taught us what loose matching costs: "Kadon" vs "Kaden",
     "Gigas" vs "Gikas", "Haranbasic" vs "Hodzic Harambasic", and a Vinny who
     was really the Vincent already on the sheet. A near-miss that silently
     picks the wrong athlete is worse than asking the parent one more question,
     so anything short of exactly one confident hit returns 'none' or 'many'
     and the funnel falls back to the full form.
   ========================================================================== */
var MASTER_SHEET = 'MASTER REGISTRATIONS';

function mrNorm_(v) {
  return String(v == null ? '' : v)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   /* Léo -> Leo */
    .replace(/[^A-Za-z]/g, '')
    .toLowerCase();
}

/* "8th grade" / "8TH" / "8" all collapse to "8th". */
function mrGrade_(v) {
  var m = String(v == null ? '' : v).match(/(\d+)/);
  return m ? m[1] + 'th' : '';
}
function gradeEq_(a, b) {
  var x = mrGrade_(a), y = mrGrade_(b);
  return !!x && x === y;
}

function mrHeaderIndex_(sheet) {
  var head = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var idx = {};
  for (var i = 0; i < head.length; i++) idx[String(head[i]).trim()] = i;
  return idx;
}

/* Full name in MASTER REGISTRATIONS is one field. Split off the last token as
   the surname, which is what the check-in sheets and CLINIC RSVP use. */
function splitFull_(full) {
  var parts = String(full == null ? '' : full).replace(/\s+/g, ' ').trim().split(' ');
  if (parts.length < 2) return { first: parts[0] || '', last: '' };
  return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] };
}

function lookupToken_(submissionId, clinicId) {
  var raw = String(submissionId) + '|' + String(clinicId);
  var sig = Utilities.computeHmacSha256Signature(raw, SHEETS_WEBHOOK_SECRET);
  return Utilities.base64EncodeWebSafe(sig).slice(0, 32);
}

/* body: { clinicId, first, last, grade }
   returns { ok, match: 'one'|'none'|'many', athlete?, token?, alreadyRsvpd?,
             rsvp?: { status, grade } }                                    */
function clinicLookup_(body) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(MASTER_SHEET);
  if (!sheet) return { ok: true, match: 'none', reason: 'no master sheet' };

  var idx = mrHeaderIndex_(sheet);
  var cFull = idx['Player Full Name'], cLast = idx['Player Last Name'],
      cGrade = idx['Grade'], cSchool = idx['School'],
      cParent = idx['Parent / Guardian Name'], cEmail = idx['Parent Email'],
      cSub = idx['Submission ID'], cStatus = idx['Registration Status'];
  if (cFull == null || cGrade == null) return { ok: true, match: 'none', reason: 'master layout' };

  var wantFirst = mrNorm_(body.first), wantLast = mrNorm_(body.last);
  if (!wantFirst || !wantLast) return { ok: true, match: 'none', reason: 'need both names' };

  var last = sheet.getLastRow();
  if (last < 2) return { ok: true, match: 'none' };
  var rows = sheet.getRange(2, 1, last - 1, sheet.getLastColumn()).getValues();

  /* Collapse the duplicate registration rows the audit found (Leo Sneed had
     three) into one candidate per athlete, keyed by name + grade. */
  var byKey = {};
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var full = r[cFull];
    if (!full) continue;
    if (!gradeEq_(r[cGrade], body.grade)) continue;

    var sp = splitFull_(full);
    var rowLast = cLast != null && r[cLast] ? r[cLast] : sp.last;
    /* Both names must match exactly after normalising. No prefix or fuzzy
       matching: that is what produced the Qasim false positive. */
    if (mrNorm_(sp.first) !== wantFirst) continue;
    if (mrNorm_(rowLast) !== wantLast) continue;

    var key = wantFirst + '|' + wantLast + '|' + mrGrade_(r[cGrade]);
    if (byKey[key]) continue;                       /* first row wins */
    byKey[key] = {
      submissionId: cSub != null ? String(r[cSub]) : '',
      first: sp.first,
      last: String(rowLast),
      grade: mrGrade_(r[cGrade]),
      school: cSchool != null ? String(r[cSchool] || '') : '',
      parentName: cParent != null ? String(r[cParent] || '') : '',
      parentEmail: cEmail != null ? String(r[cEmail] || '') : '',
      status: cStatus != null ? String(r[cStatus] || '') : ''
    };
  }

  var keys = Object.keys(byKey);
  if (keys.length === 0) return { ok: true, match: 'none' };
  if (keys.length > 1) return { ok: true, match: 'many' };

  var a = byKey[keys[0]];
  if (!a.submissionId) return { ok: true, match: 'none', reason: 'no submission id' };

  /* Age is not held in MASTER REGISTRATIONS. Reuse the age this athlete gave
     on a previous clinic RSVP rather than asking the parent again. */
  var prior = priorClinicRow_(ss, a, null);
  var already = priorClinicRow_(ss, a, body.clinicId);

  return {
    ok: true,
    match: 'one',
    token: lookupToken_(a.submissionId, body.clinicId),
    athlete: { first: a.first, last: a.last, grade: a.grade },   /* shown to the parent */
    knownAge: prior ? prior.age : '',
    alreadyRsvpd: !!already,
    rsvp: already ? { status: already.status, grade: already.grade } : null
  };
}

/* Most recent CLINIC RSVP row for this athlete. clinicId null = any clinic. */
function priorClinicRow_(ss, athlete, clinicId) {
  var sheet = ss.getSheetByName(CLINIC_SHEET);
  if (!sheet) return null;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  var rows = sheet.getRange(2, 1, lastRow - 1, CLINIC_HEADERS.length).getValues();
  var cFirst = clinicCol_('Player First Name') - 1, cLast = clinicCol_('Player Last Name') - 1,
      cGrade = clinicCol_('Grade') - 1, cAge = clinicCol_('Age') - 1,
      cClinic = clinicCol_('Clinic Date') - 1, cStatus = clinicCol_('Attendance Status') - 1;
  var wantF = mrNorm_(athlete.first), wantL = mrNorm_(athlete.last);
  var hit = null;
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (mrNorm_(r[cFirst]) !== wantF || mrNorm_(r[cLast]) !== wantL) continue;
    if (clinicId && clinicKey_(r[cClinic]) !== clinicKey_(clinicId)) continue;
    /* A cancelled RSVP is not an active one - the parent may re-RSVP. */
    if (clinicId && String(r[cStatus]).trim() === 'Cancelled') continue;
    hit = { row: i + 2, age: r[cAge], grade: r[cGrade], status: String(r[cStatus]).trim() };
  }
  return hit;
}

/* Confirm step. The browser returns the token; the server re-finds the athlete
   and fills school / parent / email from MASTER REGISTRATIONS so none of it
   ever travelled through the page. Falls through to the ordinary clinicRsvp_
   writer, so duplicate protection and idempotency are unchanged. */
function clinicRsvpMatched_(body) {
  var out = clinicLookup_({ clinicId: body.clinicId, first: body.first, last: body.last, grade: body.grade });
  if (out.match !== 'one') return { ok: false, error: 'no confident match' };
  if (out.token !== body.token) return { ok: false, error: 'token mismatch' };
  if (out.alreadyRsvpd) return { ok: true, alreadyRsvpd: true, duplicate: true };

  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(MASTER_SHEET);
  var idx = mrHeaderIndex_(sheet);
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  var found = null;
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][idx['Submission ID']]) && lookupToken_(rows[i][idx['Submission ID']], body.clinicId) === body.token) {
      found = rows[i]; break;
    }
  }
  if (!found) return { ok: false, error: 'token no longer resolves' };

  var sp = splitFull_(found[idx['Player Full Name']]);
  var rowLast = idx['Player Last Name'] != null && found[idx['Player Last Name']]
    ? found[idx['Player Last Name']] : sp.last;

  return clinicRsvp_({
    rsvpId: body.rsvpId,
    clinicId: body.clinicId,
    clinicIds: body.clinicIds,
    submittedAt: body.submittedAt,
    playerFirst: sp.first,
    playerLast: String(rowLast),
    playerFull: sp.first + ' ' + rowLast,
    grade: mrGrade_(found[idx['Grade']]),
    age: body.age || out.knownAge || '',
    school: String(found[idx['School']] || ''),
    parentName: String(found[idx['Parent / Guardian Name']] || ''),
    parentEmail: String(found[idx['Parent Email']] || ''),
    source: body.source || 'funnel_matched'
  });
}
