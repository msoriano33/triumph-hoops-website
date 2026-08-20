/**
 * JUNIOR WOLVES — 2026–27 REGISTRATION + TRYOUT MASTER
 * Apps Script bound to the master spreadsheet.
 *
 * Two jobs:
 *   1. setupWorkbook()  — run ONCE from the editor to build the sheet.
 *   2. doPost(e)        — receives registrations from triumphhoopsacademy.com.
 *
 * The website calls this deployment's /exec URL with a shared secret.
 * Nothing here is public: the secret lives in Script Properties, and the
 * website keeps its copy in a Vercel environment variable.
 */

/* The master workbook this script writes to. Standalone project, so the
   spreadsheet is opened by ID rather than assumed to be the active one. */
var SPREADSHEET_ID = '1DrQxemfb39NtOkpb_uEziuK1kmyT7Tc0qzqyLHNVvVk';
var SHEET_NAME = 'MASTER REGISTRATIONS';
var DEDUPE_WINDOW_MS = 2 * 60 * 1000;   // rapid re-posts of the same person
var SECRET_PROP = 'SHEETS_WEBHOOK_SECRET';

var HEADERS = [
  'Submission ID', 'Timestamp', 'Registration Source',
  'Player First Name', 'Player Last Name', 'Player Full Name',
  'Grade', 'School',
  'Parent / Guardian Name', 'Parent Email', 'Parent Phone',
  'Basketball Experience', 'Current / Previous Team', 'Additional Notes',
  'Eligibility Acknowledged', 'Registration Status',
  'Tryout Number', 'Tryout Attendance', 'Evaluation Score',
  'Ball Handling', 'Shooting', 'Finishing', 'Defense',
  'Basketball IQ / Decision Making', 'Effort / Competitiveness', 'Coachability',
  'Coach Notes', 'Recommended Level', 'Final Placement',
  'Offer Status', 'Accepted', 'Payment Status',
  'Follow-Up Status', 'Follow-Up Notes', 'Last Updated'
];

var DROPDOWNS = {
  16: ['REGISTERED', 'Withdrawn', 'Duplicate', 'Cancelled'],
  18: ['Not Checked In', 'Present', 'Absent'],
  28: ['A Team', 'B Team', 'Development Pathway', 'Continue Training', 'TBD'],
  29: ['A Team', 'B Team', 'Development', 'Not Placed', 'TBD'],
  30: ['Not Reviewed', 'Offer Pending', 'Offered', 'Declined', 'Waitlist', 'No Offer'],
  31: ['Pending', 'Yes', 'No'],
  32: ['Not Due', 'Pending', 'Partial', 'Paid'],
  33: ['New', 'Contacted', 'Needs Follow-Up', 'Complete']
};

/* Scores 1–5, left blank until a coach fills them in. */
var SCORE_COLUMNS = [20, 21, 22, 23, 24, 25, 26];

var WIDTHS = {
  1: 150, 2: 165, 3: 190, 4: 130, 5: 140, 6: 180, 7: 90, 8: 190,
  9: 190, 10: 220, 11: 130, 12: 200, 13: 180, 14: 280, 15: 150, 16: 140,
  17: 110, 18: 140, 19: 130, 27: 300, 34: 280, 35: 165
};

function setupWorkbook() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  ss.rename('JUNIOR WOLVES — 2026–27 REGISTRATION + TRYOUT MASTER');

  var sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  if (ss.getSheets()[0].getName() !== SHEET_NAME) ss.setActiveSheet(sheet), ss.moveActiveSheet(1);

  // Header row
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  var header = sheet.getRange(1, 1, 1, HEADERS.length);
  header.setFontWeight('bold').setFontSize(10)
        .setBackground('#0b0b0c').setFontColor('#ffffff')
        .setVerticalAlignment('middle').setWrap(true);
  sheet.setRowHeight(1, 46);
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(1);

  // Visual divide: website-submitted (A–P) vs internal (Q–AI)
  sheet.getRange(1, 17, 1, HEADERS.length - 16).setBackground('#7a0016');

  // Filter across the whole table
  var existing = sheet.getFilter();
  if (existing) existing.remove();
  sheet.getRange(1, 1, Math.max(sheet.getMaxRows(), 2), HEADERS.length).createFilter();

  // Dropdowns
  var rows = Math.max(sheet.getMaxRows() - 1, 1);
  Object.keys(DROPDOWNS).forEach(function (col) {
    var rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(DROPDOWNS[col], true).setAllowInvalid(false).build();
    sheet.getRange(2, Number(col), rows, 1).setDataValidation(rule);
  });
  SCORE_COLUMNS.forEach(function (col) {
    var rule = SpreadsheetApp.newDataValidation()
      .requireNumberBetween(1, 5).setAllowInvalid(false)
      .setHelpText('Score 1–5').build();
    sheet.getRange(2, col, rows, 1).setDataValidation(rule);
  });

  // Widths + readability
  Object.keys(WIDTHS).forEach(function (c) { sheet.setColumnWidth(Number(c), WIDTHS[c]); });
  for (var c = 20; c <= 26; c++) sheet.setColumnWidth(c, 95);
  sheet.getRange(2, 1, rows, HEADERS.length).setVerticalAlignment('top');
  sheet.getRange(2, 14, rows, 1).setWrap(true);   // Additional Notes
  sheet.getRange(2, 27, rows, 1).setWrap(true);   // Coach Notes
  sheet.getRange(2, 34, rows, 1).setWrap(true);   // Follow-Up Notes
  sheet.getRange(2, 2, rows, 1).setNumberFormat('yyyy-mm-dd hh:mm');
  sheet.getRange(2, 35, rows, 1).setNumberFormat('yyyy-mm-dd hh:mm');

  // Grade shading makes grade-by-grade scanning easy without a pivot
  var gradeRange = sheet.getRange(2, 7, rows, 1);
  sheet.setConditionalFormatRules([]);
  var shades = { '3rd grade': '#eef4ff', '4th grade': '#e9f7ef', '5th grade': '#fff6e5',
                 '6th grade': '#fdecea', '7th grade': '#f3e8fd', '8th grade': '#e6f6f8' };
  var rules = Object.keys(shades).map(function (g) {
    return SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo(g).setBackground(shades[g]).setRanges([gradeRange]).build();
  });
  sheet.setConditionalFormatRules(rules);

  buildReadme(ss);
  installEditTrigger();
  return 'Workbook ready: ' + ss.getUrl();
}

function installEditTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'onEditHandler') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('onEditHandler').forSpreadsheet(SPREADSHEET_ID).onEdit().create();
}

function buildReadme(ss) {
  var name = 'README / FIELD GUIDE';
  var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  sheet.clear();
  var lines = [
    ['JUNIOR WOLVES — 2026–27 REGISTRATION + TRYOUT MASTER', ''],
    ['', ''],
    ['Columns A–P', 'Submitted by the family on triumphhoopsacademy.com/junior-wolves. Do not edit — these are the record of what was actually submitted.'],
    ['Columns Q–AI', 'Internal only. Coaches fill these in. Never shown to parents, never submitted from the website.'],
    ['', ''],
    ['Registration Status', 'New online registrations arrive as REGISTERED automatically.'],
    ['Tryout Attendance', 'Arrives as "Not Checked In". Change to Present / Absent at the door.'],
    ['Evaluation scores (T–Z)', 'Ball Handling, Shooting, Finishing, Defense, Basketball IQ, Effort, Coachability. Score 1–5.'],
    ['Evaluation Score (S)', 'Overall score. Enter by hand, or a formula if you prefer an average.'],
    ['Recommended Level (AB)', 'What the evaluators suggest. Arrives as TBD.'],
    ['Final Placement (AC)', 'What was actually decided. Arrives as TBD.'],
    ['Last Updated (AI)', 'Stamped automatically whenever any row is edited.'],
    ['', ''],
    ['To work one grade at a time', 'Click the filter arrow on Grade (column G) and tick a single grade. Everything below stays in sync.'],
    ['To build a check-in list', 'Filter by Grade, sort by Player Last Name, then File > Print with only the columns you need.'],
    ['Duplicate protection', 'The same player from the same parent email inside 2 minutes will not create a second row. A genuine updated registration later WILL create a new row — keep the newer one and mark the older Duplicate.'],
    ['', ''],
    ['If rows stop arriving', 'Check Extensions > Apps Script > Deployments, and that SHEETS_WEBHOOK_URL in Vercel matches the current /exec URL. See SETUP.md in the website repo.']
  ];
  sheet.getRange(1, 1, lines.length, 2).setValues(lines);
  sheet.getRange(1, 1, 1, 2).setFontWeight('bold').setFontSize(12);
  sheet.getRange(3, 1, lines.length, 1).setFontWeight('bold');
  sheet.setColumnWidth(1, 220); sheet.setColumnWidth(2, 700);
  sheet.getRange(1, 2, lines.length, 1).setWrap(true);
  sheet.getRange(1, 1, lines.length, 2).setVerticalAlignment('top');
}

/** Stamp Last Updated whenever a coach edits a row.
    Installed as a trigger by setupWorkbook() because this is a standalone
    project — a simple onEdit only fires in a bound script. */
function onEditHandler(e) {
  try {
    var sheet = e.range.getSheet();
    if (sheet.getName() !== SHEET_NAME) return;
    var row = e.range.getRow();
    if (row < 2) return;
    if (e.range.getColumn() === HEADERS.length) return; // don't loop on itself
    sheet.getRange(row, HEADERS.length).setValue(new Date());
  } catch (err) { /* never block a coach's edit */ }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (err) { return json({ ok: false, error: 'busy' }); }

  try {
    var body = JSON.parse(e.postData.contents);
    var expected = PropertiesService.getScriptProperties().getProperty(SECRET_PROP);
    if (!expected || body.secret !== expected) return json({ ok: false, error: 'unauthorized' });

    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) return json({ ok: false, error: 'sheet missing' });

    var last = sheet.getLastRow();

    // Idempotency + a short duplicate window, scanning only recent rows.
    if (last > 1) {
      var scanFrom = Math.max(2, last - 40);
      var recent = sheet.getRange(scanFrom, 1, last - scanFrom + 1, 10).getValues();
      var now = new Date().getTime();
      for (var i = 0; i < recent.length; i++) {
        var r = recent[i];
        if (r[0] && r[0] === body.submissionId) {
          return json({ ok: true, row: scanFrom + i, duplicate: true });
        }
        var when = r[1] instanceof Date ? r[1].getTime() : 0;
        var samePerson = r[2] === body.source &&
                         String(r[9]).toLowerCase() === String(body.parentEmail).toLowerCase() &&
                         String(r[5]).toLowerCase() === String(body.playerFullName).toLowerCase();
        if (samePerson && when && (now - when) < DEDUPE_WINDOW_MS) {
          return json({ ok: true, row: scanFrom + i, duplicate: true });
        }
      }
    }

    var stamp = body.submittedAt ? new Date(body.submittedAt) : new Date();
    var row = [
      body.submissionId, stamp, body.submissionType || body.source,
      body.playerFirstName, body.playerLastName, body.playerFullName,
      body.grade, body.school,
      body.parentName, body.parentEmail, body.parentPhone,
      body.experience, body.currentTeam, body.notes,
      body.eligibilityAcknowledged, 'REGISTERED',
      '', 'Not Checked In', '',
      '', '', '', '', '', '', '',
      '', 'TBD', 'TBD',
      'Not Reviewed', 'Pending', 'Not Due',
      'New', '', new Date()
    ];

    sheet.appendRow(row);
    return json({ ok: true, row: sheet.getLastRow(), duplicate: false });
  } catch (err) {
    return json({ ok: false, error: String(err).slice(0, 200) });
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  return json({ ok: true, service: 'Junior Wolves registration intake' });
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
