/* ==========================================================================
   QA ROW CLEANUP  (one-off, 2026-09-29)
   --------------------------------------------------------------------------
   Removes ONLY the synthetic rows created while testing the event lifecycle.
   It never works from a row number: row numbers shift the moment anything is
   deleted, and a stale number is how a real family's record gets destroyed.

   That is not hypothetical. The report that authorised this cleanup named
   MASTER rows 233-239. By the time it ran, a real registration had landed at
   row 240 and a QA row at 241. Deleting the named range plus "the last one"
   would have destroyed a family's registration. Content-based verification is
   the whole point.

   Every candidate must satisfy THREE independent signals:
     1. Player Full Name begins "Qatest "
     2. a QA marker ("QA TEST - DO NOT COUNT") in School, Page, Notes or the
        parent-name column
     3. Parent Email is one of the two approved test inboxes

   Any row failing even one is left untouched and reported, and in that case
   NOTHING in that sheet is deleted. Deletion runs bottom-up.

   Run qaCleanupDryRun() first and read the log. Only then qaCleanupApply().
   ========================================================================== */
var QA_NAME = /^Qatest /i;
var QA_MARK = /QA TEST - DO NOT COUNT/i;
var QA_INBOXES = ['triumphhoopsacademy@gmail.com', 'msoriano33@gmail.com'];

function qaScan_(sheetName) {
  var sh = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(sheetName);
  var idx = eaHeaderIndex_(sh);
  var last = sh.getLastRow();
  if (last < 2) return { sheet: sheetName, total: 0, confirmed: [], rejected: [] };
  var rows = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();

  function cell(row, name) { return idx[name] == null ? '' : String(row[idx[name]] || ''); }

  var confirmed = [], rejected = [];
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i], n = i + 2;
    var name = cell(row, 'Player Full Name').trim();
    if (!QA_NAME.test(name)) continue;

    var marked = QA_MARK.test(cell(row, 'School')) ||
                 QA_MARK.test(cell(row, 'Page')) ||
                 QA_MARK.test(cell(row, 'Notes')) ||
                 QA_MARK.test(cell(row, 'Parent / Guardian')) ||
                 QA_MARK.test(cell(row, 'Parent / Guardian Name'));
    var email = cell(row, 'Parent Email').trim().toLowerCase();
    var inbox = QA_INBOXES.indexOf(email) !== -1;
    var sid = cell(row, 'Submission ID').trim() || cell(row, 'RSVP ID').trim();

    var why = [];
    if (!marked) why.push('no QA marker');
    if (!inbox) why.push('email is not an approved test inbox');

    var rec = { row: n, name: name, id: sid };
    if (why.length) { rec.why = why.join(' + '); rejected.push(rec); }
    else confirmed.push(rec);
  }
  return { sheet: sheetName, total: last - 1, confirmed: confirmed, rejected: rejected };
}

function qaCleanupApply() {
  ['MASTER REGISTRATIONS', 'CLINIC RSVP'].forEach(function (nm) {
    var s = qaScan_(nm);
    if (s.rejected.length) {
      Logger.log('REFUSED for ' + nm + ': ' + s.rejected.length +
                 ' row(s) not positively identified. Nothing deleted in this sheet.');
      return;
    }
    var sh = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(nm);
    var before = sh.getLastRow() - 1;
    var rowsDesc = s.confirmed.map(function (r) { return r.row; }).sort(function (a, b) { return b - a; });
    for (var i = 0; i < rowsDesc.length; i++) sh.deleteRow(rowsDesc[i]);
    SpreadsheetApp.flush();
    Logger.log(nm + ': deleted ' + rowsDesc.length + '  rows ' + JSON.stringify(rowsDesc) +
               '  | data rows ' + before + ' -> ' + (sh.getLastRow() - 1));
  });
  ['MASTER REGISTRATIONS', 'CLINIC RSVP'].forEach(function (nm) {
    var s = qaScan_(nm);
    Logger.log('  ' + nm + ': remaining Qatest rows = ' + (s.confirmed.length + s.rejected.length) +
               '  | total data rows = ' + s.total);
  });
}

function qaCleanupDryRun() {
  ['MASTER REGISTRATIONS', 'CLINIC RSVP'].forEach(function (nm) {
    var s = qaScan_(nm);
    Logger.log(nm + '  total=' + s.total +
               '  CONFIRMED synthetic=' + s.confirmed.length +
               '  REJECTED=' + s.rejected.length);
    s.confirmed.forEach(function (r) {
      Logger.log('   DELETE row ' + r.row + '  ' + r.name + '  ' + r.id);
    });
    s.rejected.forEach(function (r) {
      Logger.log('   KEEP   row ' + r.row + '  ' + r.name + '  REASON: ' + r.why);
    });
  });
}
