/* ==========================================================================
   JUNIOR WOLVES — LIVE EVENT AUDIENCE  (added 2026-09-29)
   --------------------------------------------------------------------------
   READ-ONLY. Computes, at the moment it is asked, who should receive a given
   stage of an event's communication lifecycle. It never writes and never
   stores a list.

   WHY THE SERVER BUILDS THE LIST
     Earlier campaigns had the operator paste the whole audience into the send
     endpoint, gated by a hash. That works for a one-off but not for a
     lifecycle: a family who RSVPs an hour before the 2-day reminder must drop
     out of it by themselves. So the audience is derived here, from live rows,
     every time - and the browser never handles addresses at all.

   SEGMENTS
     not_rsvpd  everyone in the master audience who has NO live RSVP for this
                clinic. Athletes come from MASTER REGISTRATIONS so the email
                can still name them and pick their session.
     rsvpd      households WITH a live RSVP for this clinic. Athletes are the
                ones actually RSVPed, not everyone the household registered.

   The two are disjoint by construction: rsvpd is the set, not_rsvpd is
   its complement inside the master audience. There is no third place a
   household can be, and none can be in both.

   EXCLUSIONS are applied identically to both segments - QA rows, placeholder
   domains, Triumph's own inboxes, malformed addresses, and cancelled RSVPs.
   ========================================================================== */
var EA_MASTER = 'MASTER REGISTRATIONS';
var EA_RSVP = 'CLINIC RSVP';

/* Reserved-for-documentation and filler domains. Mirrors the list in
   lib/jw-email.js - both must agree or the counts will not. */
var EA_PLACEHOLDER_DOMAINS = [
  'example.com', 'example.org', 'example.net', 'example.edu',
  'test.com', 'test.test', 'localhost', 'invalid', 'email.com',
  'domain.com', 'yourdomain.com', 'mydomain.com', 'none.com',
  'noemail.com', 'no-email.com', 'nomail.com', 'fake.com', 'sample.com'
];
var EA_ORG = ['triumphhoopsacademy@gmail.com', 'msoriano33@gmail.com',
              'noreply@triumphhoopsacademy.com'];
var EA_QA = /qa test|qa verify|qafunnel|qatest|funnelcheck|do not count/i;

function eaEmail_(v) { return String(v == null ? '' : v).trim().toLowerCase(); }

/* A Clinic Date cell can come back as a STRING or as a real Date, depending
   on how that row was written. getValues() gives a Date for a date-formatted
   cell, and String(thatDate) is never '2026-10-11'. Normalise both.
   Found in QA 2026-09-29: the first audience build reported rsvpd = 0 for a
   clinic that had 18 RSVPed households. */
function eaClinicDate_(v) {
  if (v instanceof Date) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  var s = String(v == null ? '' : v).trim();
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  var d = new Date(s);
  if (!isNaN(d.getTime())) return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return s;
}

/* Grades, correctly. mrGrade_ exists for MATCHING, where both sides are
   mangled the same way, so its "3rd" -> "3th" is harmless there. It is NOT
   harmless here: the session lookup compares against the real labels in
   clinics.js, so a 3rd grader normalised to "3th" resolves to no session and
   drops silently out of his own family's logistics email. Found in QA
   2026-09-29 with 7 third-graders RSVPed for October 11. */
function eaGrade_(v) {
  var m = String(v == null ? '' : v).match(/(\d+)/);
  if (!m) return '';
  var n = parseInt(m[1], 10);
  var suffix = (n % 100 >= 11 && n % 100 <= 13) ? 'th'
    : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th';
  return n + suffix;
}

function eaSendable_(e) {
  if (!e) return 'empty';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)) return 'malformed';
  var at = e.lastIndexOf('@');
  var domain = e.slice(at + 1);
  if (EA_PLACEHOLDER_DOMAINS.indexOf(domain) !== -1) return 'placeholder-domain';
  if (/\.(test|invalid|example|localhost)$/.test(domain)) return 'placeholder-domain';
  if (EA_ORG.indexOf(e) !== -1) return 'org-inbox';
  return '';
}

function eaHeaderIndex_(sheet) {
  var head = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var idx = {};
  for (var i = 0; i < head.length; i++) idx[String(head[i]).trim()] = i;
  return idx;
}

/* An RSVP row counts only if it is for this clinic and has not been cancelled.
   Anything else - Cancelled, a QA marker - is not a live RSVP. */
function eaLiveRsvp_(row, idx, clinicId) {
  if (String(row[idx['Clinic Date']]).trim() !== clinicId) return false;
  if (String(row[idx['Attendance Status']]).trim() === 'Cancelled') return false;
  return true;
}

/**
 * body: { clinicId, segment }  segment = 'not_rsvpd' | 'rsvpd'
 * Returns { ok, clinicId, segment, count, households:[{email, athletes:[{first,grade}]}],
 *           excluded:{...}, computedAt }
 */
function eventAudience_(body) {
  var clinicId = String(body.clinicId || '').trim();
  var segment = String(body.segment || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clinicId)) return { ok: false, error: 'bad clinicId' };
  if (segment !== 'not_rsvpd' && segment !== 'rsvpd') return { ok: false, error: 'bad segment' };

  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var mSheet = ss.getSheetByName(EA_MASTER);
  var rSheet = ss.getSheetByName(EA_RSVP);
  var mIdx = eaHeaderIndex_(mSheet), rIdx = eaHeaderIndex_(rSheet);
  var mRows = mSheet.getLastRow() > 1
    ? mSheet.getRange(2, 1, mSheet.getLastRow() - 1, mSheet.getLastColumn()).getValues() : [];
  var rRows = rSheet.getLastRow() > 1
    ? rSheet.getRange(2, 1, rSheet.getLastRow() - 1, rSheet.getLastColumn()).getValues() : [];

  var excluded = { qa: 0, placeholder: 0, org: 0, malformed: 0, empty: 0, cancelled: 0 };
  function note(reason) {
    if (reason === 'placeholder-domain') excluded.placeholder++;
    else if (reason === 'org-inbox') excluded.org++;
    else if (reason === 'malformed') excluded.malformed++;
    else if (reason === 'empty') excluded.empty++;
  }

  /* ---- who has a LIVE rsvp for this clinic, and with which athletes ---- */
  var rsvpAthletes = {};   /* email -> [{first, grade}] */
  for (var i = 0; i < rRows.length; i++) {
    var row = rRows[i];
    if (EA_QA.test(row.join(' '))) { excluded.qa++; continue; }
    if (eaClinicDate_(row[rIdx['Clinic Date']]) !== clinicId) continue;
    if (String(row[rIdx['Attendance Status']]).trim() === 'Cancelled') { excluded.cancelled++; continue; }
    var re = eaEmail_(row[rIdx['Parent Email']]);
    var rReason = eaSendable_(re);
    if (rReason) { note(rReason); continue; }
    if (!rsvpAthletes[re]) rsvpAthletes[re] = [];
    rsvpAthletes[re].push({
      first: String(row[rIdx['Player First Name']] || '').trim(),
      grade: eaGrade_(row[rIdx['Grade']])
    });
  }

  /* ---- the master audience: registrations plus everyone who has ever
          RSVPed for any clinic. Same definition the Sept 27 campaign used. */
  var masterAthletes = {};
  for (var j = 0; j < mRows.length; j++) {
    var m = mRows[j];
    if (EA_QA.test(m.join(' '))) { excluded.qa++; continue; }
    var me = eaEmail_(m[mIdx['Parent Email']]);
    var mReason = eaSendable_(me);
    if (mReason) { note(mReason); continue; }
    if (!masterAthletes[me]) masterAthletes[me] = [];
    var sp = splitFull_(m[mIdx['Player Full Name']]);
    masterAthletes[me].push({ first: sp.first, grade: eaGrade_(m[mIdx['Grade']]) });
  }
  for (var k = 0; k < rRows.length; k++) {
    var rr = rRows[k];
    if (EA_QA.test(rr.join(' '))) continue;
    var ee = eaEmail_(rr[rIdx['Parent Email']]);
    if (eaSendable_(ee)) continue;
    if (!masterAthletes[ee]) masterAthletes[ee] = [];
  }

  /* ---- assemble the requested segment ---- */
  var households = [];
  if (segment === 'rsvpd') {
    Object.keys(rsvpAthletes).forEach(function (e) {
      households.push({ email: e, athletes: eaDedupe_(rsvpAthletes[e]) });
    });
  } else {
    Object.keys(masterAthletes).forEach(function (e) {
      if (rsvpAthletes[e]) return;                 /* already RSVPed: not this segment */
      households.push({ email: e, athletes: eaDedupe_(masterAthletes[e]) });
    });
  }
  households.sort(function (a, b) { return a.email < b.email ? -1 : 1; });

  return {
    ok: true,
    clinicId: clinicId,
    segment: segment,
    count: households.length,
    households: households,
    rsvpdCount: Object.keys(rsvpAthletes).length,
    masterCount: Object.keys(masterAthletes).length,
    excluded: excluded,
    computedAt: new Date().toISOString()
  };
}

/* One athlete filed twice is one athlete. Keyed on normalised name + grade so
   a household with three duplicate master rows does not get named three times. */
function eaDedupe_(list) {
  var seen = {}, out = [];
  for (var i = 0; i < list.length; i++) {
    var a = list[i];
    if (!a.first) continue;
    var key = mrNorm_(a.first) + '|' + a.grade;
    if (seen[key]) continue;
    seen[key] = true;
    out.push(a);
  }
  return out;
}

/* Runnable from the editor: counts only, no addresses in the log. */
function eventAudienceReport() {
  ['2026-10-11', '2026-10-25'].forEach(function (id) {
    var a = eventAudience_({ clinicId: id, segment: 'not_rsvpd' });
    var b = eventAudience_({ clinicId: id, segment: 'rsvpd' });
    Logger.log(id + '  not_rsvpd=' + a.count + '  rsvpd=' + b.count +
               '  master=' + a.masterCount + '  excluded=' + JSON.stringify(a.excluded));
    Logger.log('    live clinic-date keys seen: ' + JSON.stringify(eaClinicDateKeys_()));
  });
}

/* Diagnostic: every distinct Clinic Date key in the sheet, as this module
   reads it. If a clinic id is missing here, the normaliser is the problem. */
function eaClinicDateKeys_() {
  var sh = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(EA_RSVP);
  var idx = eaHeaderIndex_(sh);
  if (sh.getLastRow() < 2) return [];
  var rows = sh.getRange(2, idx['Clinic Date'] + 1, sh.getLastRow() - 1, 1).getValues();
  var seen = {};
  for (var i = 0; i < rows.length; i++) seen[eaClinicDate_(rows[i][0])] = (seen[eaClinicDate_(rows[i][0])] || 0) + 1;
  return seen;
}
