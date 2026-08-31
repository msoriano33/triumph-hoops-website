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

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ==========================================================================
   JUNIOR WOLVES — TOWN HALL AUDIENCE + RSVP
   --------------------------------------------------------------------------
   Adds to the existing registration script. Nothing below touches
   MASTER REGISTRATIONS except to READ parent contacts from it.

     buildTownHallAudience()  — build/refresh the TOWN HALL RSVP tab
     doGet(e)                 — one-tap RSVP capture (extended below)
     townHallSummary()        — head-count totals in the log
     sendTownHallTest()       — send ONE email to the Triumph inbox
     sendTownHallLive()       — send to every unsent contact (guarded)

   Privacy: the RSVP link carries a random 16-char token only. No email
   address, name or player name ever appears in a URL.
   ========================================================================== */

var RSVP_SHEET = 'TOWN HALL RSVP';

/* Town Hall details. Not secrets — these go out to families in the email,
   so they live in code where they are version-controlled and reviewable. */
var TOWNHALL_VENUE = 'South Lobby<br>Niles West High School<br>5701 Oakton St, Skokie, IL 60077';
var TOWNHALL_VIRTUAL_URL = 'https://www.canvaqr.com/RGQ6_f0uss';
var EMAIL_TEMPLATE_URL =
  'https://raw.githubusercontent.com/msoriano33/triumph-hoops-website/main/ops/townhall-email.html';

/* Historical Niles West feeder-feedback contacts (2025-26). These are LEADS,
   not registrations, and are deliberately kept out of MASTER REGISTRATIONS. */
var HISTORICAL_FEEDER = [
'ahmedst23@gmail.com','amandaruthsharon@gmail.com','anthonymoodyii@gmail.com','basheer.hassan@gmail.com',
'bundocjehramie@yahoo.com','carol.dominguez198502@gmail.com','cmoy33@gmail.com','cmsanti05@gmail.com',
'cynthiaalexander48@gmail.com','dahliatamras@gmail.com','danieljurban@gmail.com','dbrown712@gmail.com',
'desiree.jara@gmail.com','didimaric@yahoo.com','doctorsufa@gmail.com','ejchan@gmail.com',
'elaadi17@gmail.com','gabadilla@hotmail.com','jas.reavy@gmail.com','joelarzu@gmail.com',
'kimdurband@gmail.com','kimkre8s@gmail.com','kjensen1313@hotmail.com','konstantosp@yahoo.com',
'korey.pressburger@gmail.com','kristynbair@gmail.com','laurapriban@gmail.com','leenahamdi909@gmail.com',
'maya.vujosevich@gmail.com','micsne@d219.org','mlbybee@gmail.com','msroulam@gmail.com',
'notisotiropoulos46@gmail.com','orasa1@gmail.com','p.cullen@sbcglobal.net','parwani0830@yahoo.com',
'petesiatos@gmail.com','pramasujita@gmail.com','rsuleiman831@gmail.com','sibrahim23@yahoo.com',
'sucrets.home@gmail.com','suzannembartels@gmail.com','syazdani8@gmail.com','taniabella1@aol.com',
'the.alamaniacs@gmail.com','tuyen.chicagocre@gmail.com','venus.delarmente@gmail.com',
'vm.michelle@gmail.com','youngheechos@gmail.com'
];

var RSVP_HEADERS = ['Token','Parent / Family','Player','Email','Contact Source',
                    'RSVP Status','RSVP Timestamp','Email Sent At','Notes'];

var RSVP_LABEL = { in: 'In Person', vr: 'Virtual', no: "Can't Attend" };

function normEmail_(v) { return String(v == null ? '' : v).trim().toLowerCase(); }
function validEmail_(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e); }

/* ---------------------------------------------------------------------------
   Build the audience. Safe to re-run: existing rows keep their token and any
   RSVP already recorded; only genuinely new contacts are appended.
   --------------------------------------------------------------------------- */
function buildTownHallAudience() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(RSVP_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(RSVP_SHEET);
    sheet.getRange(1, 1, 1, RSVP_HEADERS.length).setValues([RSVP_HEADERS]);
  }

  /* --- existing rows, so a rebuild never loses an RSVP --- */
  var existing = {};
  var last = sheet.getLastRow();
  if (last > 1) {
    sheet.getRange(2, 1, last - 1, RSVP_HEADERS.length).getValues().forEach(function (r, i) {
      if (r[3]) existing[normEmail_(r[3])] = { row: i + 2, token: r[0] };
    });
  }

  /* --- source A: current Junior Wolves contacts from MASTER REGISTRATIONS --- */
  var reg = ss.getSheetByName(SHEET_NAME);
  var current = {};
  var regLast = reg.getLastRow();
  if (regLast > 1) {
    reg.getRange(2, 1, regLast - 1, 16).getValues().forEach(function (r) {
      var email = normEmail_(r[9]);          // J Parent Email
      var status = String(r[15] || '');      // P Registration Status
      if (!validEmail_(email)) return;
      if (/cancelled|duplicate|withdrawn/i.test(status)) return;   // excludes the QA test row
      if (!current[email]) current[email] = { parent: r[8] || '', players: [] };
      if (r[5]) current[email].players.push(r[5]);                 // F Player Full Name
    });
  }

  /* --- source B: historical feeder list, normalised + deduped --- */
  var historical = {};
  HISTORICAL_FEEDER.forEach(function (e) {
    var n = normEmail_(e);
    if (validEmail_(n)) historical[n] = true;
  });

  /* --- merge: email is the deduplication key, one row per family --- */
  var all = {};
  Object.keys(current).forEach(function (e) {
    all[e] = { email: e, parent: current[e].parent,
               player: current[e].players.join(', '), source: 'CURRENT JUNIOR WOLVES' };
  });
  Object.keys(historical).forEach(function (e) {
    if (all[e]) { all[e].source = 'BOTH'; }
    else { all[e] = { email: e, parent: '', player: '', source: 'HISTORICAL FEEDER FEEDBACK' }; }
  });

  var emails = Object.keys(all).sort();
  var appended = 0, updated = 0;

  emails.forEach(function (e) {
    var rec = all[e];
    if (existing[e]) {
      /* refresh name/player/source only — never touch token or RSVP columns */
      var row = existing[e].row;
      sheet.getRange(row, 2, 1, 4).setValues([[rec.parent, rec.player, rec.email, rec.source]]);
      updated++;
    } else {
      var token = Utilities.getUuid().replace(/-/g, '').substring(0, 16);
      sheet.appendRow([token, rec.parent, rec.player, rec.email, rec.source,
                       'No Response', '', '', '']);
      appended++;
    }
  });

  formatRsvpSheet_(sheet);

  var counts = countSources_(sheet);
  Logger.log('TOWN HALL AUDIENCE BUILT');
  Logger.log('  appended new contacts : ' + appended);
  Logger.log('  refreshed existing    : ' + updated);
  Logger.log('  ---------------------------------');
  Logger.log('  CURRENT JUNIOR WOLVES : ' + counts['CURRENT JUNIOR WOLVES']);
  Logger.log('  HISTORICAL FEEDER     : ' + counts['HISTORICAL FEEDER FEEDBACK']);
  Logger.log('  BOTH (in both lists)  : ' + counts['BOTH']);
  Logger.log('  TOTAL UNIQUE FAMILIES : ' + (sheet.getLastRow() - 1));
  return 'audience built: ' + (sheet.getLastRow() - 1) + ' unique recipients';
}

function countSources_(sheet) {
  var c = { 'CURRENT JUNIOR WOLVES': 0, 'HISTORICAL FEEDER FEEDBACK': 0, 'BOTH': 0 };
  var last = sheet.getLastRow();
  if (last < 2) return c;
  sheet.getRange(2, 5, last - 1, 1).getValues().forEach(function (r) {
    if (c[r[0]] !== undefined) c[r[0]]++;
  });
  return c;
}

function formatRsvpSheet_(sheet) {
  var header = sheet.getRange(1, 1, 1, RSVP_HEADERS.length);
  header.setValues([RSVP_HEADERS]).setFontWeight('bold').setFontSize(10)
        .setBackground('#0b0b0c').setFontColor('#ffffff').setVerticalAlignment('middle').setWrap(true);
  sheet.setRowHeight(1, 42);
  sheet.setFrozenRows(1);
  var f = sheet.getFilter(); if (f) f.remove();
  sheet.getRange(1, 1, Math.max(sheet.getMaxRows(), 2), RSVP_HEADERS.length).createFilter();

  var rows = Math.max(sheet.getMaxRows() - 1, 1);
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['No Response', 'In Person', 'Virtual', "Can't Attend"], true)
    .setAllowInvalid(false).build();
  sheet.getRange(2, 6, rows, 1).setDataValidation(rule);

  var w = { 1: 150, 2: 190, 3: 200, 4: 240, 5: 200, 6: 130, 7: 165, 8: 165, 9: 220 };
  Object.keys(w).forEach(function (c) { sheet.setColumnWidth(Number(c), w[c]); });
  sheet.getRange(2, 7, rows, 2).setNumberFormat('yyyy-mm-dd hh:mm');

  /* Live head-count panel — always current, no manual counting */
  var n = 'K';
  sheet.getRange('K1').setValue('HEAD COUNT').setFontWeight('bold')
       .setBackground('#0b0b0c').setFontColor('#ffffff');
  var panel = [
    ['Total invited',   '=COUNTA(D2:D)'],
    ['In person',       '=COUNTIF(F2:F,"In Person")'],
    ['Virtual',         '=COUNTIF(F2:F,"Virtual")'],
    ["Can't attend",    '=COUNTIF(F2:F,"Can\'t Attend")'],
    ['No response',     '=COUNTIF(F2:F,"No Response")'],
    ['Responded',       '=COUNTA(D2:D)-COUNTIF(F2:F,"No Response")'],
    ['Emails sent',     '=COUNTA(H2:H)']
  ];
  sheet.getRange(2, 11, panel.length, 2).setValues(panel);
  sheet.getRange(2, 11, panel.length, 1).setFontWeight('bold');
  sheet.setColumnWidth(11, 150); sheet.setColumnWidth(12, 90);
}

function townHallSummary() {
  var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(RSVP_SHEET);
  var last = sheet.getLastRow();
  var vals = last > 1 ? sheet.getRange(2, 1, last - 1, 9).getValues() : [];
  var t = { 'In Person': 0, 'Virtual': 0, "Can't Attend": 0, 'No Response': 0 };
  var sent = 0;
  vals.forEach(function (r) { if (t[r[5]] !== undefined) t[r[5]]++; if (r[7]) sent++; });
  Logger.log('TOTAL INVITED : ' + vals.length);
  Logger.log('EMAILS SENT   : ' + sent);
  Logger.log('IN PERSON     : ' + t['In Person']);
  Logger.log('VIRTUAL       : ' + t['Virtual']);
  Logger.log("CAN'T ATTEND  : " + t["Can't Attend"]);
  Logger.log('NO RESPONSE   : ' + t['No Response']);
  return t;
}

/* ---------------------------------------------------------------------------
   RSVP capture. Idempotent by design: the token identifies exactly one row,
   and the handler only ever UPDATES that row. Repeated taps — or a mail client
   pre-fetching the link — can never create a second record.
   --------------------------------------------------------------------------- */
function recordRsvp_(token, action) {
  var label = RSVP_LABEL[action];
  if (!label || !/^[0-9a-f]{16}$/.test(String(token))) return null;

  var lock = LockService.getScriptLock();
  try { lock.waitLock(15000); } catch (e) { return null; }
  try {
    var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(RSVP_SHEET);
    var last = sheet.getLastRow();
    if (last < 2) return null;
    var tokens = sheet.getRange(2, 1, last - 1, 1).getValues();
    for (var i = 0; i < tokens.length; i++) {
      if (String(tokens[i][0]) === String(token)) {
        var row = i + 2;
        var previous = sheet.getRange(row, 6).getValue();
        sheet.getRange(row, 6).setValue(label);
        sheet.getRange(row, 7).setValue(new Date());
        return { label: label, changed: previous !== label && previous !== 'No Response' };
      }
    }
    return null;
  } finally { lock.releaseLock(); }
}

function rsvpPage_(title, message, tone) {
  var accent = tone === 'error' ? '#a1a1aa' : '#ff3b52';
  var html =
  '<!doctype html><html><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1"><title>' + title + '</title></head>' +
  '<body style="margin:0;background:#0b0b0c;font-family:Arial,Helvetica,sans-serif;">' +
  '<div style="max-width:520px;margin:0 auto;padding:64px 26px;">' +
  '<div style="font-size:12px;letter-spacing:2.4px;text-transform:uppercase;color:#ffffff;font-weight:bold;">' +
  'Niles West Junior Wolves</div>' +
  '<div style="height:3px;background:#c8102e;margin:18px 0 26px;"></div>' +
  '<div style="font-size:11px;letter-spacing:2.4px;text-transform:uppercase;color:' + accent +
  ';font-weight:bold;">Town Hall</div>' +
  '<h1 style="font-family:\'Arial Black\',Arial,sans-serif;font-size:30px;line-height:34px;color:#fff;' +
  'text-transform:uppercase;margin:10px 0 16px;">' + title + '</h1>' +
  '<p style="font-size:16px;line-height:25px;color:#e4e4e7;margin:0 0 26px;">' + message + '</p>' +
  '<p style="font-size:14px;line-height:22px;color:#a1a1aa;margin:0;">Wednesday, September 2 &middot; 6:30 PM<br>' +
  'Questions? <a href="mailto:triumphhoopsacademy@gmail.com" style="color:#ff3b52;">triumphhoopsacademy@gmail.com</a></p>' +
  '<div style="height:1px;background:#2a2a2f;margin:34px 0 18px;"></div>' +
  '<div style="font-family:\'Arial Black\',Arial,sans-serif;font-size:14px;color:#fff;text-transform:uppercase;">' +
  'Earn your place in the pack.</div>' +
  '<div style="font-size:11px;letter-spacing:2px;color:#ff3b52;font-weight:bold;text-transform:uppercase;' +
  'padding-top:6px;">The Wolf Way</div>' +
  '</div></body></html>';
  return HtmlService.createHtmlOutput(html)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setTitle('Junior Wolves Town Hall RSVP');
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.r && p.a) {
    var res = recordRsvp_(p.r, p.a);
    if (!res) {
      return rsvpPage_('Link not recognised',
        "We couldn't match that RSVP link. Reply to this email and we'll add you to the list by hand.",
        'error');
    }
    if (res.label === 'In Person') {
      return rsvpPage_("You're in.",
        "We've got you down for <strong style=\"color:#fff\">attending in person</strong>. " +
        "We'll send the room details before Wednesday.");
    }
    if (res.label === 'Virtual') {
      return rsvpPage_("You're in.",
        "We've got you down for <strong style=\"color:#fff\">joining online</strong>. " +
        "We'll email the meeting link before Wednesday.");
    }
    return rsvpPage_('Thanks for letting us know.',
      "You're marked as <strong style=\"color:#fff\">unable to attend</strong>. " +
      "We'll follow up afterwards with everything covered, so you won't miss anything.");
  }
  return json({ ok: true, service: 'Junior Wolves registration intake' });
}

/* ---------------------------------------------------------------------------
   Sending. Individual sends only — never CC or BCC, so no recipient can see
   another family's address, and each link is personal to one row.
   --------------------------------------------------------------------------- */
function getEmailHtml_() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('townhall_html');
  if (cached) return cached;
  var html = UrlFetchApp.fetch(EMAIL_TEMPLATE_URL + '?cb=' + Date.now()).getContentText();
  cache.put('townhall_html', html, 21600);
  return html;
}

function renderTownHall_(token) {
  if (!TOWNHALL_VENUE || !TOWNHALL_VIRTUAL_URL) {
    throw new Error('Town hall venue and/or virtual link not set.');
  }
  var virtualHtml =
    '<a href="' + TOWNHALL_VIRTUAL_URL + '" style="color:#ff3b52;text-decoration:underline;">' +
    'Join the Town Hall online</a>';
  return getEmailHtml_()
    .replace(/\{\{BASE\}\}/g, ScriptApp.getService().getUrl())
    .replace(/\{\{TOKEN\}\}/g, token)
    .replace(/\{\{VENUE\}\}/g, TOWNHALL_VENUE)
    .replace(/\{\{VIRTUAL\}\}/g, virtualHtml);
}

var TOWNHALL_SUBJECT = 'Junior Wolves Town Hall + Meet the Coaches — Wednesday 6:30 PM';

var TEST_SOURCE = 'TEST - QA';
var TEST_EMAIL = 'triumphhoopsacademy@gmail.com';

/* Gives the QA test its own real row, so the three RSVP buttons in the test
   email genuinely work end to end and can be tapped on a phone. The row is
   tagged TEST - QA and is skipped by the live send. */
function ensureTestRow_() {
  var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(RSVP_SHEET);
  var last = sheet.getLastRow();
  if (last > 1) {
    var vals = sheet.getRange(2, 1, last - 1, 5).getValues();
    for (var i = 0; i < vals.length; i++) {
      if (vals[i][4] === TEST_SOURCE) return vals[i][0];
    }
  }
  var token = Utilities.getUuid().replace(/-/g, '').substring(0, 16);
  sheet.appendRow([token, 'Triumph QA', 'QA test row', TEST_EMAIL, TEST_SOURCE,
                   'No Response', '', '', 'Test row for Town Hall email QA. Not a real family.']);
  return token;
}

function sendTownHallTest() {
  var token = ensureTestRow_();
  MailApp.sendEmail({
    to: TEST_EMAIL,
    subject: '[TEST] ' + TOWNHALL_SUBJECT,
    htmlBody: renderTownHall_(token),
    name: 'Niles West Junior Wolves',
    replyTo: TEST_EMAIL
  });
  Logger.log('TEST EMAIL SENT to ' + TEST_EMAIL);
  Logger.log('test RSVP token: ' + token + '  (all three buttons are live)');
  Logger.log('remaining daily quota: ' + MailApp.getRemainingDailyQuota());
  return 'test sent, token ' + token;
}

function sendTownHallLive() {
  var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(RSVP_SHEET);
  var last = sheet.getLastRow();
  if (last < 2) return 'no recipients';
  var rows = sheet.getRange(2, 1, last - 1, 9).getValues();
  var quota = MailApp.getRemainingDailyQuota();
  var sent = 0, skipped = 0;

  for (var i = 0; i < rows.length; i++) {
    var token = rows[i][0], email = rows[i][3], already = rows[i][7];
    if (rows[i][4] === TEST_SOURCE) { skipped++; continue; }   /* QA row, never a real family */
    if (already) { skipped++; continue; }            /* never send twice */
    if (!validEmail_(normEmail_(email))) { skipped++; continue; }
    if (sent >= quota - 2) break;                    /* stay inside the daily quota */
    MailApp.sendEmail({
      to: email,
      subject: TOWNHALL_SUBJECT,
      htmlBody: renderTownHall_(token),
      name: 'Niles West Junior Wolves',
      replyTo: 'triumphhoopsacademy@gmail.com'
    });
    sheet.getRange(i + 2, 8).setValue(new Date());   /* stamp immediately */
    sent++;
  }
  Logger.log('sent: ' + sent + ' | skipped (already sent / invalid): ' + skipped +
             ' | remaining quota: ' + MailApp.getRemainingDailyQuota());
  return 'sent ' + sent;
}
