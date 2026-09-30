/* ==========================================================================
   ORPHAN LOG-ROW CLEANUP  (2026-09-30)  --  cleaning up after myself
   --------------------------------------------------------------------------
   NOTE ON LOCATION: this code was pasted into CanonicalBuild.gs in the live
   Apps Script project and is driven by CB_STEP ('junkDry' / 'junkDelete').
   It is kept here as the readable source of record. If it is ever re-run,
   reconcile this file against the live editor first.

   WHAT HAPPENED
   Between the Vercel deploy of the confirmation-logging client and the Apps
   Script V10 deploy at 11:16 on 2026-09-30, confirmation_log POSTs reached
   doPost still running Version 9. V9 had no confirmation_log branch, so those
   POSTs fell through to the DEFAULT REGISTRATION PATH and appended a
   near-empty row: hardcoded column defaults plus the idempotency key parked
   in Additional Notes. Six rows, 08:47:03 to 09:55:48. These rows are mine.
   No family created them.

   ROOT CAUSE, STILL LIVE: doPost has no unknown-kind guard. An unrecognised
   'kind' is indistinguishable from a real registration POST, which carries no
   'kind' at all. Families are not exposed to this - a parent's browser never
   sends a kind - but any future version skew between the API and the deployed
   Apps Script version can repeat it. Reported, not fixed, pending approval.

   IDENTITY - all five required, none of them a row number:
     1. Submission ID blank
     2. Parent Email blank
     3. Player Full Name blank AND Player First Name blank
     4. Grade blank AND School blank
     5. Additional Notes matches ^idem=jw-confirm-
   validate() rejects any registration missing parent name, email, jersey or
   shorts size, and doPost stamps a Submission ID on every real write, so no
   real registration can satisfy 1-4. Signal 5 is a value only the logging
   client can produce; a parent cannot type it into a form.

   CORROBORATION - also required, reported when it fails:
     - timestamp inside the V9/V10 window (2026-09-30 08:00 to 11:16)
     - exactly 11 populated columns
   A candidate failing corroboration is AMBIGUOUS and NOTHING is deleted.

   Rows with SOME but not all of the six identity fields blank are counted and
   reported separately. If that count is ever non-zero the clean split this
   rule depends on no longer holds and the result must be read by a human
   before anything is deleted. At run time it was zero: the six orphans had
   all six blank, and no other row in MASTER had more than two.

   RESULT: dry run 6 candidates / 0 ambiguous / 0 partial. Commit deleted 6
   (239 -> 233 data rows), 0 skipped on recheck, 0 remaining.
   ========================================================================== */
var JUNK_NOTE = /^idem=jw-confirm-/;
var JUNK_FROM = new Date(2026, 8, 30, 8, 0, 0);
var JUNK_TO   = new Date(2026, 8, 30, 11, 16, 0);
var JUNK_KEYS = ['Submission ID', 'Parent Email', 'Player Full Name',
                 'Player First Name', 'Grade', 'School'];

function junkCell_(idx, row, name) {
  if (idx[name] == null) return '';
  var v = row[idx[name]];
  return String(v == null ? '' : v).trim();
}

function junkScan_() {
  var sh = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('MASTER REGISTRATIONS');
  var idx = eaHeaderIndex_(sh);
  var last = sh.getLastRow();
  if (last < 2) return { total: 0, candidates: [], ambiguous: [], partialBlank: [] };
  var rows = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();

  var candidates = [], ambiguous = [], partial = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i], n = i + 2;
    var blank = 0;
    for (var k = 0; k < JUNK_KEYS.length; k++) {
      if (junkCell_(idx, r, JUNK_KEYS[k]) === '') blank++;
    }
    if (blank === 0) continue;
    if (blank < JUNK_KEYS.length) { partial.push({ row: n, blankFields: blank }); continue; }

    var why = [];
    if (!JUNK_NOTE.test(junkCell_(idx, r, 'Additional Notes'))) {
      why.push('Additional Notes is not a confirmation-log idempotency key');
    }
    var raw = idx['Timestamp'] == null ? null : r[idx['Timestamp']];
    var d = (raw instanceof Date) ? raw : new Date(raw);
    var dateOk = d && !isNaN(d.getTime()) && d >= JUNK_FROM && d <= JUNK_TO;
    if (!dateOk) why.push('timestamp outside the V9/V10 deploy window');
    var pop = 0;
    for (var j = 0; j < r.length; j++) {
      if (String(r[j] == null ? '' : r[j]).trim() !== '') pop++;
    }
    if (pop !== 11) why.push('populated column count is ' + pop + ', expected 11');

    var rec = {
      row: n,
      populated: pop,
      when: dateOk ? Utilities.formatDate(d, 'America/Chicago', 'yyyy-MM-dd HH:mm:ss') : String(raw)
    };
    if (why.length) { rec.why = why.join(' + '); ambiguous.push(rec); }
    else candidates.push(rec);
  }
  return { total: last - 1, candidates: candidates, ambiguous: ambiguous, partialBlank: partial };
}

/* Re-reads the row immediately before deleting it. Row numbers are only a
   cursor; the content check is the authority. A registration that lands
   mid-run, or a row that shifted, is skipped rather than destroyed. */
function junkRecheckOk_(sh, n) {
  var idx = eaHeaderIndex_(sh);
  var r = sh.getRange(n, 1, 1, sh.getLastColumn()).getValues()[0];
  for (var k = 0; k < JUNK_KEYS.length; k++) {
    if (junkCell_(idx, r, JUNK_KEYS[k]) !== '') return false;
  }
  return JUNK_NOTE.test(junkCell_(idx, r, 'Additional Notes'));
}

function junkCleanup(commit) {
  var s = junkScan_();
  if (!commit) {
    return { mode: 'DRY RUN', dataRows: s.total, wouldDelete: s.candidates.length,
             candidates: s.candidates, ambiguous: s.ambiguous.length,
             ambiguousDetail: s.ambiguous, partialBlankRows: s.partialBlank.length,
             partialBlankDetail: s.partialBlank };
  }
  if (s.ambiguous.length) {
    return { mode: 'REFUSED', reason: 'ambiguous candidate(s) present', deleted: 0,
             ambiguousDetail: s.ambiguous };
  }
  if (s.partialBlank.length) {
    return { mode: 'REFUSED', reason: 'partially-blank row(s) present - identity split no longer clean',
             deleted: 0, partialBlankDetail: s.partialBlank };
  }
  if (!s.candidates.length) return { mode: 'NOOP', deleted: 0, dataRows: s.total };

  var sh = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('MASTER REGISTRATIONS');
  var before = sh.getLastRow() - 1;
  var desc = s.candidates.map(function (x) { return x.row; }).sort(function (a, b) { return b - a; });
  var deleted = [], skipped = [];
  for (var i = 0; i < desc.length; i++) {
    if (!junkRecheckOk_(sh, desc[i])) { skipped.push(desc[i]); continue; }
    sh.deleteRow(desc[i]);
    deleted.push(desc[i]);
  }
  SpreadsheetApp.flush();
  var after = junkScan_();
  return { mode: 'COMMIT', dataRowsBefore: before, dataRowsAfter: sh.getLastRow() - 1,
           deleted: deleted.length, deletedRows: deleted, skippedOnRecheck: skipped,
           remainingCandidates: after.candidates.length,
           remainingPartialBlank: after.partialBlank.length };
}
