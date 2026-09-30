/* ==========================================================================
   JUNIOR WOLVES — CONFIRMATION AUDIT TRAIL  (added 2026-09-30)
   --------------------------------------------------------------------------
   The Wednesday audit found the single biggest weakness in the system: when a
   confirmation email is sent, nothing durable records that it happened. The
   API returned the outcome to the browser and wrote it to a console log that
   is not retained, so "did this family get a confirmation?" could only be
   answered by reading git history.

   This file fixes that. Every confirmation attempt - accepted, failed or
   skipped - appends one row to a CONFIRMATION LOG tab.

   ---------------------------------------------------------------------
   ACCEPTED IS NOT DELIVERED
   ---------------------------------------------------------------------
   Resend returning 200 means Resend queued the message. It does NOT mean the
   message reached an inbox. The log makes that distinction STRUCTURAL rather
   than a footnote:

     Outcome            ACCEPTED - the provider took it
     Delivery Evidence  always blank until delivery webhooks exist

   Nothing in this file will ever write DELIVERED. The only thing that could
   is a Resend webhook receiver, which is deliberately not built yet.

   ---------------------------------------------------------------------
   WHY APPEND-ONLY, AND HOW EXACTLY-ONCE IS ACTUALLY GUARANTEED
   ---------------------------------------------------------------------
   The log never edits a row and never decides whether a send may proceed.
   It is evidence, not a lock. Exactly-once is enforced where it can actually
   be enforced - at the provider - by a DETERMINISTIC idempotency key derived
   from the record id:

       jw-confirm-<recordType>-<recordId>

   Both the live API and the reconciliation sweeper use that same key, so even
   if the two raced each other, Resend would still send one message. The log
   then explains what happened; it does not have to prevent it.

   NO CREDENTIALS and NO MESSAGE BODIES are stored here - a recipient address,
   an outcome, a provider id and a reason code, nothing more.
   ========================================================================== */

var CL_SHEET = 'CONFIRMATION LOG';

var CL_HEADERS = [
  'Log ID', 'Logged At', 'Attempted At',
  'Record Type', 'Record ID', 'Athlete ID',
  'Recipient', 'Confirmation Type',
  'Outcome', 'Delivery Evidence',
  'Provider', 'Provider Message ID', 'Provider Status',
  'Failure Reason', 'Attempt', 'Sent By', 'Notes'
];

/* The only outcomes this system may record. Anything else is rejected, so a
   typo in a caller cannot quietly invent a new status. */
var CL_OUTCOMES = [
  'ACCEPTED',                  /* provider queued it. NOT delivered.        */
  'FAILED',                    /* provider refused or the call errored      */
  'SKIPPED_DUPLICATE',         /* idempotency/duplicate row - nothing sent  */
  'SKIPPED_NO_ADDRESS',        /* no usable email on the record             */
  'SKIPPED_INVALID_ADDRESS',   /* malformed or placeholder domain           */
  'SKIPPED_UNVERIFIED_WRITE',  /* sheet write not confirmed in time         */
  'SKIPPED_NOT_ELIGIBLE'       /* rule says this record gets no confirmation*/
];

var CL_TYPES = ['tryout_registration', 'clinic_rsvp', 'jw_interest'];

function clStr_(v) { return String(v == null ? '' : v).trim(); }

function clSheet_() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sh = ss.getSheetByName(CL_SHEET);
  if (!sh) {
    sh = ss.insertSheet(CL_SHEET);
    sh.getRange(1, 1, 1, CL_HEADERS.length).setValues([CL_HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.setColumnWidth(1, 90);   sh.setColumnWidth(2, 150); sh.setColumnWidth(3, 150);
    sh.setColumnWidth(5, 170);  sh.setColumnWidth(7, 220); sh.setColumnWidth(8, 180);
    sh.setColumnWidth(9, 190);  sh.setColumnWidth(10, 140); sh.setColumnWidth(12, 240);
    /* A permanent, visible reminder of the distinction this whole tab exists
       to protect. */
    sh.getRange(1, 10).setNote(
      'ACCEPTED means the email provider queued the message.\n' +
      'It does NOT mean it reached an inbox.\n' +
      'This column stays blank until delivery webhooks are built.');
  }
  return sh;
}

function clIndex_(sh) {
  var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var idx = {};
  for (var i = 0; i < head.length; i++) idx[clStr_(head[i])] = i;
  return idx;
}

function clRows_() {
  var sh = clSheet_();
  if (sh.getLastRow() < 2) return { sheet: sh, idx: clIndex_(sh), rows: [] };
  return {
    sheet: sh, idx: clIndex_(sh),
    rows: sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues()
  };
}

/* Has this exact record already got an ACCEPTED confirmation of this type?
   Used by the sweeper to decide what still needs sending, and reported back
   to the API so a caller can see it was already covered. */
function clAlreadyAccepted_(recordId, confirmationType) {
  var d = clRows_();
  var cR = d.idx['Record ID'], cT = d.idx['Confirmation Type'], cO = d.idx['Outcome'];
  for (var i = 0; i < d.rows.length; i++) {
    if (clStr_(d.rows[i][cR]) === clStr_(recordId) &&
        clStr_(d.rows[i][cT]) === clStr_(confirmationType) &&
        clStr_(d.rows[i][cO]) === 'ACCEPTED') return true;
  }
  return false;
}

/**
 * doPost kind: 'confirmation_log'
 * body: { recordType, recordId, athleteId?, recipient, confirmationType,
 *         outcome, providerMessageId?, providerStatus?, failureReason?,
 *         attempt?, sentBy?, attemptedAt?, notes? }
 *
 * Append-only. Never edits, never deletes, never decides.
 */
function confirmationLog_(body) {
  var outcome = clStr_(body.outcome).toUpperCase();
  if (CL_OUTCOMES.indexOf(outcome) === -1) {
    return { ok: false, error: 'unknown outcome: ' + outcome };
  }
  var recordType = clStr_(body.recordType);
  if (CL_TYPES.indexOf(recordType) === -1) {
    return { ok: false, error: 'unknown recordType: ' + recordType };
  }
  var recordId = clStr_(body.recordId);
  if (!recordId) return { ok: false, error: 'recordId is required' };

  var sh = clSheet_();
  var n = Math.max(0, sh.getLastRow() - 1) + 1;
  var logId = 'CL-' + ('000000' + n).slice(-6);

  sh.appendRow([
    logId,
    new Date(),
    clStr_(body.attemptedAt) || new Date(),
    recordType,
    recordId,
    clStr_(body.athleteId),
    clStr_(body.recipient),
    clStr_(body.confirmationType),
    outcome,
    '',                                   /* Delivery Evidence - never set here */
    clStr(body.provider) || 'resend',
    clStr_(body.providerMessageId),
    clStr_(body.providerStatus),
    clStr_(body.failureReason),
    body.attempt ? Number(body.attempt) : 1,
    clStr_(body.sentBy) || 'api',
    clStr_(body.notes).slice(0, 300)
  ]);

  return { ok: true, logId: logId, outcome: outcome };
}

/* small alias so a missing provider field cannot throw */
function clStr(v) { return clStr_(v); }

/* ==========================================================================
   THE GAP REPORT
   Which records SHOULD have a confirmation and have no evidence of one.
   Read-only. This is the question the Wednesday audit could not answer.
   ========================================================================== */

/* Automation go-live moments, from the commits that introduced them.
   A record older than its system's go-live was never eligible and is NOT a
   gap - it is history. */
var CL_LIVE = {
  clinic_rsvp:         new Date(2026, 8, 29, 7, 38, 0),
  tryout_registration: new Date(2026, 8, 29, 8, 50, 40),
  jw_interest:         null    /* set when the interest email ships */
};

/* HARD FLOOR. The sweeper may never touch anything before this instant, no
   matter what the gap report says. Historical families are not to be emailed
   a confirmation months later. */
var CL_SWEEP_FLOOR = new Date(2026, 8, 29, 7, 0, 0);

function clDate_(v) {
  if (v instanceof Date) return v;
  var s = clStr_(v); if (!s) return null;
  var d = new Date(s.replace(/-/g, '/'));
  return isNaN(d.getTime()) ? null : d;
}

function clConfirmationTypeFor_(recordType) {
  return recordType === 'tryout_registration' ? 'tryout_confirmation'
       : recordType === 'clinic_rsvp' ? 'rsvp_confirmation'
       : 'interest_acknowledgement';
}

/* Every record that is eligible for a confirmation right now. */
function clEligible_() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var out = [];

  var m = ss.getSheetByName('MASTER REGISTRATIONS');
  var mIdx = cbHeaderIndex_(m);
  var mRows = m.getLastRow() > 1
    ? m.getRange(2, 1, m.getLastRow() - 1, m.getLastColumn()).getValues() : [];
  mRows.forEach(function (r) {
    var joined = r.join(' ');
    if (!clStr_(joined) || CB_QA.test(joined)) return;
    var em = cbEmail_(r[mIdx['Parent Email']]);
    if (em && cbIsPlaceholder_(em)) return;
    var type = /tryout/i.test(clStr_(r[mIdx['Submission Type']]))
      ? 'tryout_registration' : 'jw_interest';
    var live = CL_LIVE[type];
    if (!live) return;                       /* system not shipped yet */
    var ts = clDate_(r[mIdx['Timestamp']]);
    if (!ts || ts < live) return;            /* predates automation */
    out.push({ recordType: type, recordId: clStr_(r[mIdx['Submission ID']]),
               athleteId: clStr_(r[mIdx['Athlete ID']]), recipient: em, ts: ts });
  });

  var c = ss.getSheetByName('CLINIC RSVP');
  var cIdx = cbHeaderIndex_(c);
  var cRows = c.getLastRow() > 1
    ? c.getRange(2, 1, c.getLastRow() - 1, c.getLastColumn()).getValues() : [];
  cRows.forEach(function (r) {
    var joined = r.join(' ');
    if (!clStr_(joined) || CB_QA.test(joined)) return;
    if (/qa_probe|qa_regression/.test(clStr_(r[cIdx['Source']]))) return;
    if (clStr_(r[cIdx['Attendance Status']]) === 'Cancelled') return;
    var em = cbEmail_(r[cIdx['Parent Email']]);
    if (em && cbIsPlaceholder_(em)) return;
    var ts = clDate_(r[cIdx['Timestamp']]);
    if (!ts || ts < CL_LIVE.clinic_rsvp) return;
    out.push({ recordType: 'clinic_rsvp', recordId: clStr_(r[cIdx['RSVP ID']]),
               athleteId: '', recipient: em, ts: ts });
  });

  return out;
}

/**
 * Read-only. Returns counts, and the record ids with no confirmation
 * evidence. Record ids, never names or addresses, in the returned summary.
 */
function confirmationGap() {
  var eligible = clEligible_();
  var d = clRows_();
  var cR = d.idx['Record ID'], cT = d.idx['Confirmation Type'], cO = d.idx['Outcome'];
  var accepted = {}, anyAttempt = {};
  d.rows.forEach(function (r) {
    var k = clStr_(r[cR]) + '|' + clStr_(r[cT]);
    anyAttempt[k] = true;
    if (clStr_(r[cO]) === 'ACCEPTED') accepted[k] = true;
  });

  var summary = {}, missing = [], attemptedNotAccepted = 0, noAddress = 0;
  eligible.forEach(function (e) {
    var k = e.recordId + '|' + clConfirmationTypeFor_(e.recordType);
    summary[e.recordType] = summary[e.recordType] || { eligible: 0, accepted: 0, noEvidence: 0 };
    summary[e.recordType].eligible++;
    if (accepted[k]) { summary[e.recordType].accepted++; return; }
    if (anyAttempt[k]) attemptedNotAccepted++;
    if (!e.recipient) noAddress++;
    summary[e.recordType].noEvidence++;
    missing.push(e.recordId);
  });

  var out = {
    ok: true,
    logRows: d.rows.length,
    byType: summary,
    totalEligible: eligible.length,
    totalWithoutAcceptedEvidence: missing.length,
    attemptedButNotAccepted: attemptedNotAccepted,
    eligibleWithNoAddress: noAddress,
    missingRecordIds: missing,
    note: 'ACCEPTED means the provider queued it. Delivery is not proven anywhere in this system.',
    checkedAt: new Date().toISOString()
  };
  Logger.log(JSON.stringify(out));
  return out;
}

/* ==========================================================================
   THE SWEEPER  (timeout-safe delivery of exactly one confirmation)
   --------------------------------------------------------------------------
   THE GAP IT CLOSES
     /api/inquiry only sends a confirmation when the sheet write came back
     confirmed inside 6.5s. On a cold Apps Script the row still lands, but the
     API has already given up waiting, so the family gets nothing. The code
     says so itself: "we do not confirm what we cannot see." That is the right
     instinct - it must never claim a registration it cannot verify - but it
     leaves a real family silently unconfirmed.

     The sweeper inverts the evidence. It runs LATER, reads the row straight
     out of the sheet (so the row is proven to exist), checks the log (so no
     accepted confirmation already exists), and only then asks the sender to
     send. Conservative at write time, complete afterwards.

   WHY IT CANNOT DOUBLE-SEND
     1. it skips anything with an ACCEPTED log row
     2. the sender uses the deterministic idempotency key
        jw-confirm-<recordType>-<recordId>, the same key the live API uses,
        so the provider itself collapses a genuine race
     3. it waits CL_MIN_AGE_MIN before touching a record, so it can never
        race the request that created it

   WHY IT CANNOT REACH HISTORICAL FAMILIES
     CL_SWEEP_FLOOR is an absolute floor, independent of the gap report. A
     record older than the floor is never a candidate, so the 122 tryout
     registrations and 144 RSVPs that predate automation can never be swept
     into a months-late confirmation.
   ========================================================================== */

var CL_MIN_AGE_MIN = 10;     /* never touch a record younger than this      */
var CL_MAX_PER_RUN = 20;     /* bounded blast radius per run                */
var CL_SENDER_PROP = 'CONFIRMATION_SENDER_URL';   /* Script Property        */

/* REPORT ONLY FOR NOW.
   The live sender half needs a Vercel endpoint that does not exist yet, and
   wiring the fetch/trigger services in here expands the project's OAuth scopes
   and forces a re-authorisation prompt on the owner's Google account. There is
   nothing to gain from paying that cost before the endpoint exists, so this
   computes the sweep list and stops. The dispatch half is restored in the same
   change as the sender. */
function confirmationSweep(dryRun) {
  var gap = confirmationGap();
  var cutoff = new Date(Date.now() - CL_MIN_AGE_MIN * 60000);
  var byId = {};
  clEligible_().forEach(function (e) { byId[e.recordId] = e; });
  var candidates = gap.missingRecordIds.map(function (id) { return byId[id]; })
    .filter(function (e) {
      if (!e || !e.recipient) return false;
      if (e.ts < CL_SWEEP_FLOOR) return false;   /* HARD historical floor */
      if (e.ts > cutoff) return false;           /* too fresh             */
      return true;
    })
    .slice(0, CL_MAX_PER_RUN);
  var out = {
    ok: true, mode: 'report-only', senderConfigured: false,
    totalGap: gap.totalWithoutAcceptedEvidence,
    sweepCandidates: candidates.length,
    candidateRecordIds: candidates.map(function (c) { return c.recordId; }),
    note: 'nothing is sent from Apps Script; the sender endpoint is not built yet'
  };
  Logger.log(JSON.stringify(out));
  return out;
}
