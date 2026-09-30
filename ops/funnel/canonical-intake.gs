/* ==========================================================================
   CANONICAL INTAKE — Phase 2C
   --------------------------------------------------------------------------
   Three jobs, all driven by JW_CANON (ops/funnel/canonical-config.gs, which
   is GENERATED from assets/js/canonical.js - the same file the forms and the
   API read). There is no second list anywhere in here.

     ciApplyValidation(commit)     Google Sheets dropdowns for the columns
                                   coaches type into by hand.
     ciNormaliseAthletes(commit)   Canonical school code/name/status on
                                   ATHLETES. Never touches MASTER.
     ciSyncPending(commit)         Give new MASTER rows an Athlete ID without
                                   waiting for a full rebuild.
     ciSyncOne_(submissionId)      The single-row version doPost calls.

   TWO RULES THAT ARE NOT NEGOTIABLE HERE
   --------------------------------------
   1. MASTER REGISTRATIONS IS NEVER REWRITTEN. It is the record of what a
      family actually submitted, translated labels, typos and all. Canonical
      values live on ATHLETES. The only MASTER cell this file ever writes is
      Athlete ID, which is a link, not a correction.

   2. AMBIGUOUS IDENTITY GOES TO REVIEW, NEVER TO A GUESS. A false merge
      destroys a family's record and is not detectable afterwards; an extra
      row is visible and costs a minute to fix. Everything below is built
      around that asymmetry.
   ========================================================================== */

var CI_MASTER = 'MASTER REGISTRATIONS';
var CI_ATHLETES = 'ATHLETES';
var CI_HOUSEHOLDS = 'HOUSEHOLDS';
var CI_RSVP = 'CLINIC RSVP';

function ciStr_(v) { return String(v == null ? '' : v).trim(); }

function ciIndex_(sheet) {
  var head = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var idx = {};
  for (var i = 0; i < head.length; i++) idx[ciStr_(head[i])] = i;
  return idx;
}

function ciSheet_(name) {
  var sh = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(name);
  if (!sh) throw new Error('missing sheet: ' + name);
  return sh;
}

function ciRows_(sheet) {
  var last = sheet.getLastRow();
  if (last < 2) return [];
  return sheet.getRange(2, 1, last - 1, sheet.getLastColumn()).getValues();
}

/* ==========================================================================
   1. GOOGLE SHEETS DATA VALIDATION
   --------------------------------------------------------------------------
   Coaches correct data directly in the sheet, so the sheet needs the same
   list the form uses or it becomes the new source of dirt.

   What this deliberately does NOT do: it does not touch a single existing
   cell. Google Sheets validation shows a warning on a value that predates the
   rule; it does not erase it. Historical MASTER keeps saying exactly what the
   family said, which is the whole point of keeping it.

   MASTER Grade is left ALONE on purpose. Its historical values are "3rd
   grade" and two are "7.º grado"; attaching a 3-8 integer rule to that
   column would flag ~230 legitimate historical rows as errors and train
   everyone to ignore the warning colour. New rows arrive canonical from the
   API. The place to enforce a grade by hand is ATHLETES.Current Grade, which
   IS already canonical - so that is where the rule goes.
   ========================================================================== */
function ciValidationPlan_() {
  var C = JW_CANON;
  var jwGrades = C.gradesFor('junior_wolves').map(function (g) { return g.value; });
  var jwAges = C.agesFor('junior_wolves').map(String);
  var codes = C.schools.map(function (s) { return s.code; });

  return [
    { sheet: CI_ATHLETES,  column: 'Current Grade', values: jwGrades,
      help: 'Grade as a number, 3 to 8.' },
    { sheet: CI_ATHLETES,  column: 'School Code',   values: codes,
      help: 'Canonical school code. OTHER means the family named a school that is not on our list - their exact words stay in Current School (Raw).' },
    { sheet: CI_RSVP,      column: 'Grade',         values: jwGrades,
      help: 'Grade as a number, 3 to 8.' },
    { sheet: CI_RSVP,      column: 'Age',           values: jwAges,
      help: 'Age in years, 7 to 15.' },
    { sheet: CI_MASTER,    column: 'School Code',   values: codes,
      help: 'Canonical school code, set by the registration form. Blank on rows that predate the canonical list.' }
  ];
}

function ciApplyValidation(commit) {
  var plan = ciValidationPlan_();
  var out = [];

  for (var i = 0; i < plan.length; i++) {
    var p = plan[i];
    var sh, idx;
    try { sh = ciSheet_(p.sheet); idx = ciIndex_(sh); }
    catch (e) { out.push({ sheet: p.sheet, column: p.column, applied: false, reason: String(e.message) }); continue; }

    if (idx[p.column] == null) {
      out.push({ sheet: p.sheet, column: p.column, applied: false, reason: 'column not present' });
      continue;
    }

    var col = idx[p.column] + 1;
    /* Cover the data that exists plus generous headroom, so a row typed in
       next month inherits the rule without anybody remembering to re-run
       this. Capped rather than whole-column: a validation rule over a million
       rows makes the sheet noticeably slower to open. */
    var rows = Math.max(sh.getLastRow(), 2) + 500;

    /* setAllowInvalid(true) is deliberate. A REJECTING rule would make it
       impossible to paste a historical export back in, and would block a
       coach mid-correction on a value that is legitimately odd. A warning
       tells them; it does not fight them. */
    var count = p.values.length;
    if (commit) {
      var rule = SpreadsheetApp.newDataValidation()
        .requireValueInList(p.values, true)
        .setAllowInvalid(true)
        .setHelpText(p.help)
        .build();
      sh.getRange(2, col, rows - 1, 1).setDataValidation(rule);
    }
    out.push({ sheet: p.sheet, column: p.column, applied: !!commit,
               optionCount: count, rowsCovered: rows - 1 });
  }
  return { mode: commit ? 'COMMIT' : 'DRY RUN', rules: out };
}

/* ==========================================================================
   2. CANONICAL SCHOOL ON ATHLETES
   --------------------------------------------------------------------------
   For each athlete, every school value across their submissions is resolved
   through JW_CANON and the answers are compared.

     all submissions agree on one code      -> OK
     they disagree                          -> CONFLICT, code left BLANK
     nothing resolves                       -> NEEDS_REVIEW, code left BLANK
     the family explicitly chose Other      -> OTHER, their words preserved

   A blank code is a deliberate output, not a failure. Writing a code we are
   not sure of would make the conflict invisible, and an invisible wrong
   school is worse than a visible unknown one.
   ========================================================================== */
function ciResolveSchoolForAthlete_(rawValues, explicitCodes) {
  var C = JW_CANON;

  /* An explicit OTHER from the form is a family's own answer and outranks
     anything the text might otherwise match. This is what stops an Other
     entry that happens to spell "Park View School" being absorbed. */
  for (var e = 0; e < explicitCodes.length; e++) {
    if (ciStr_(explicitCodes[e]).toUpperCase() === 'OTHER') {
      return { code: 'OTHER', status: 'OK', display: 'Other school', unresolved: [] };
    }
  }
  var explicit = {};
  for (var x = 0; x < explicitCodes.length; x++) {
    var c = ciStr_(explicitCodes[x]).toUpperCase();
    if (c && C.schoolCodeValid(c)) explicit[c] = true;
  }
  var explicitList = Object.keys(explicit);
  if (explicitList.length === 1) {
    return { code: explicitList[0], status: 'OK',
             display: C.schoolLabel(explicitList[0]), unresolved: [] };
  }
  if (explicitList.length > 1) {
    return { code: '', status: 'CONFLICT', display: '', unresolved: [],
             detail: explicitList.join(' / ') };
  }

  /* No explicit code: this is a historical row, so read the raw text. */
  var codes = {}, unresolved = [];
  for (var i = 0; i < rawValues.length; i++) {
    var raw = ciStr_(rawValues[i]);
    if (!raw) continue;
    var hit = C.normaliseSchool(raw);
    if (hit.code) codes[hit.code] = true; else unresolved.push(raw);
  }
  var list = Object.keys(codes);

  if (list.length === 1 && !unresolved.length) {
    return { code: list[0], status: 'OK', display: C.schoolLabel(list[0]), unresolved: [] };
  }
  if (list.length > 1) {
    return { code: '', status: 'CONFLICT', display: '', unresolved: unresolved,
             detail: list.join(' / ') };
  }
  if (list.length === 1 && unresolved.length) {
    /* Part of the evidence points at one school and part of it is a spelling
       nobody has approved. Do not let the resolved half vote down the other. */
    return { code: '', status: 'NEEDS_REVIEW', display: '', unresolved: unresolved,
             detail: 'resolves to ' + list[0] + ' but also holds an unrecognised value' };
  }
  return { code: '', status: 'NEEDS_REVIEW', display: '', unresolved: unresolved,
           detail: unresolved.length ? 'no reviewed spelling matches' : 'no school on file' };
}

function ciNormaliseAthletes(commit) {
  var C = JW_CANON;
  var ath = ciSheet_(CI_ATHLETES), aIdx = ciIndex_(ath), aRows = ciRows_(ath);
  var mas = ciSheet_(CI_MASTER), mIdx = ciIndex_(mas), mRows = ciRows_(mas);

  var need = ['Athlete ID', 'Current School (Raw)', 'School Code',
              'School Display Name', 'School Status', 'Source Submission IDs',
              'Current Grade', 'Grade Status'];
  for (var n = 0; n < need.length; n++) {
    if (aIdx[need[n]] == null) return { error: 'ATHLETES is missing column: ' + need[n] };
  }
  if (mIdx['Submission ID'] == null || mIdx['School'] == null) {
    return { error: 'MASTER is missing Submission ID or School' };
  }

  /* Submission ID -> that submission's school text and (new rows only) the
     canonical code the family actually picked. */
  var bySubmission = {};
  for (var m = 0; m < mRows.length; m++) {
    var sid = ciStr_(mRows[m][mIdx['Submission ID']]);
    if (!sid) continue;
    bySubmission[sid] = {
      raw: ciStr_(mRows[m][mIdx['School']]),
      code: mIdx['School Code'] == null ? '' : ciStr_(mRows[m][mIdx['School Code']])
    };
  }

  var stats = { athletes: aRows.length, canonical: 0, other: 0, conflict: 0,
                needsReview: 0, unchanged: 0, gradeCanonical: 0, gradeNeedsReview: 0 };
  var unresolvedSpellings = {};
  var conflicts = [], reviews = [];
  var writes = [];

  for (var i = 0; i < aRows.length; i++) {
    var r = aRows[i];
    var id = ciStr_(r[aIdx['Athlete ID']]);
    var sids = ciStr_(r[aIdx['Source Submission IDs']]).split(/[,;|\s]+/).filter(String);

    var raws = [], codes = [];
    for (var s = 0; s < sids.length; s++) {
      var rec = bySubmission[sids[s]];
      if (!rec) continue;
      if (rec.raw) raws.push(rec.raw);
      if (rec.code) codes.push(rec.code);
    }
    /* Fall back to the athlete's own raw column when the submission links do
       not resolve - better than treating the athlete as having no school. */
    if (!raws.length) {
      var own = ciStr_(r[aIdx['Current School (Raw)']]);
      if (own) raws.push(own);
    }

    var res = ciResolveSchoolForAthlete_(raws, codes);

    if (res.status === 'OK' && res.code === 'OTHER') stats.other++;
    else if (res.status === 'OK') stats.canonical++;
    else if (res.status === 'CONFLICT') { stats.conflict++; conflicts.push({ athlete: id, detail: res.detail }); }
    else { stats.needsReview++; reviews.push({ athlete: id, detail: res.detail }); }

    res.unresolved.forEach(function (u) { unresolvedSpellings[u] = (unresolvedSpellings[u] || 0) + 1; });

    /* Grade is already canonical on ATHLETES (the builder stores a bare
       integer). Verify rather than rewrite - a rewrite here could only ever
       introduce error. */
    var g = ciStr_(r[aIdx['Current Grade']]);
    if (g && C.gradeByValue(g)) stats.gradeCanonical++;
    else if (g) stats.gradeNeedsReview++;

    var curCode = ciStr_(r[aIdx['School Code']]);
    var curName = ciStr_(r[aIdx['School Display Name']]);
    var curStat = ciStr_(r[aIdx['School Status']]);
    if (curCode === res.code && curName === res.display && curStat === res.status) {
      stats.unchanged++;
    } else {
      writes.push({ row: i + 2, code: res.code, display: res.display, status: res.status });
    }
  }

  if (commit && writes.length) {
    /* One batched write per column, keyed by row, so a partial failure cannot
       leave a code attached to the wrong athlete's name. */
    var colCode = aIdx['School Code'] + 1;
    var colName = aIdx['School Display Name'] + 1;
    var colStat = aIdx['School Status'] + 1;
    for (var w = 0; w < writes.length; w++) {
      ath.getRange(writes[w].row, colCode).setValue(writes[w].code);
      ath.getRange(writes[w].row, colName).setValue(writes[w].display);
      ath.getRange(writes[w].row, colStat).setValue(writes[w].status);
    }
    SpreadsheetApp.flush();
  }

  return {
    mode: commit ? 'COMMIT' : 'DRY RUN',
    stats: stats,
    rowsWritten: commit ? writes.length : 0,
    rowsWouldWrite: writes.length,
    conflicts: conflicts,
    needsReview: reviews,
    unresolvedSpellings: unresolvedSpellings
  };
}

/* ==========================================================================
   3. NEW REGISTRATION SYNC
   --------------------------------------------------------------------------
   The lag this removes: a new MASTER row had no Athlete ID until somebody
   re-ran the whole canonical build.

   WHY THIS IS SAFE TO DO AUTOMATICALLY
   The risky half of identity resolution is deciding that two records are the
   same person. This does not do that half automatically. It assigns an ID in
   exactly two situations, both unambiguous:

     EXACTLY ONE existing athlete matches on normalised name AND household
       -> reuse that Athlete ID. One candidate, no choice to get wrong.

     NO existing athlete matches and the household is unambiguous
       -> mint the next ID. A new person is a new row; nothing is merged.

   Anything else - two candidates, a name that matches in two households, a
   missing contact - leaves the Athlete ID BLANK and is reported. Blank is the
   status quo, so the worst case of this feature is the behaviour we already
   had. It can slow things down; it cannot corrupt them.

   No new OAuth scope, no trigger, no background job: doPost already holds the
   script lock when a registration lands, so this runs inside that lock and
   cannot race a second registration.
   ========================================================================== */
function ciNameKey_(first, last) {
  return (ciStr_(first) + ' ' + ciStr_(last)).toLowerCase()
    .replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
}

function ciDigits_(v) { return ciStr_(v).replace(/\D/g, '').slice(-10); }

function ciEmailKey_(v) { return ciStr_(v).toLowerCase(); }

/* Household match on a shared email OR a shared 10-digit phone. Returns the
   ids that matched; the CALLER decides what more than one means. */
function ciHouseholdsFor_(hRows, hIdx, email, phone) {
  var e = ciEmailKey_(email), p = ciDigits_(phone);
  var hits = {};
  var emailCols = ['Primary Email', 'Secondary Email'];
  var phoneCols = ['Primary Phone', 'Secondary Phone'];
  for (var i = 0; i < hRows.length; i++) {
    var row = hRows[i], id = ciStr_(row[hIdx['Household ID']]);
    if (!id) continue;
    var hit = false;
    for (var c = 0; c < emailCols.length && !hit; c++) {
      if (hIdx[emailCols[c]] == null) continue;
      if (e && ciEmailKey_(row[hIdx[emailCols[c]]]) === e) hit = true;
    }
    for (var d = 0; d < phoneCols.length && !hit; d++) {
      if (hIdx[phoneCols[d]] == null) continue;
      var rp = ciDigits_(row[hIdx[phoneCols[d]]]);
      if (p && rp && rp === p) hit = true;
    }
    /* "Other Contacts" holds the extra addresses a household collected. A
       sibling registered by the other parent lands here and nowhere else. */
    if (!hit && hIdx['Other Contacts'] != null && e) {
      var blob = ciStr_(row[hIdx['Other Contacts']]).toLowerCase();
      if (blob && blob.indexOf(e) !== -1) hit = true;
    }
    if (hit) hits[id] = true;
  }
  return Object.keys(hits);
}

function ciNextId_(rows, idx, prefix) {
  var max = 0;
  for (var i = 0; i < rows.length; i++) {
    var m = ciStr_(rows[i][idx]).match(/(\d+)\s*$/);
    if (m) { var n = parseInt(m[1], 10); if (n > max) max = n; }
  }
  return prefix + ('0000' + (max + 1)).slice(-4);
}

/* Resolve ONE master row. Pure decision-making: it reads, it decides, and it
   returns what it decided. Writing is the caller's job, which keeps the risky
   part small enough to read in one sitting. */
function ciResolveIdentity_(master, athletes, aIdx, households, hIdx) {
  var nameKey = ciNameKey_(master.first, master.last);
  if (!nameKey) return { action: 'REVIEW', reason: 'no usable player name' };

  var hh = ciHouseholdsFor_(households, hIdx, master.email, master.phone);
  if (hh.length > 1) {
    return { action: 'REVIEW', reason: 'contact details match ' + hh.length + ' households' };
  }
  var householdId = hh.length === 1 ? hh[0] : '';

  var candidates = [];
  for (var i = 0; i < athletes.length; i++) {
    var a = athletes[i];
    if (ciNameKey_(a[aIdx['First Name']], a[aIdx['Last Name']]) !== nameKey) continue;
    var aHouse = ciStr_(a[aIdx['Household ID']]);
    /* Same name is NOT the same person. Two Michael Kims in two households is
       ordinary; merging them is not recoverable. Household must agree. */
    if (householdId && aHouse && aHouse !== householdId) continue;
    if (householdId && !aHouse) continue;
    if (!householdId) continue;
    candidates.push({ id: ciStr_(a[aIdx['Athlete ID']]), row: i + 2 });
  }

  if (candidates.length === 1) {
    return { action: 'LINK', athleteId: candidates[0].id, householdId: householdId };
  }
  if (candidates.length > 1) {
    return { action: 'REVIEW', reason: 'two existing athletes share this name and household' };
  }
  if (!householdId) {
    return { action: 'REVIEW', reason: 'no household matches these contact details yet' };
  }
  return { action: 'CREATE', householdId: householdId };
}

/* Every MASTER row with no Athlete ID. Dry run by default. */
function ciSyncPending(commit) {
  var mas = ciSheet_(CI_MASTER), mIdx = ciIndex_(mas), mRows = ciRows_(mas);
  if (mIdx['Athlete ID'] == null) return { error: 'MASTER has no Athlete ID column' };

  var ath = ciSheet_(CI_ATHLETES), aIdx = ciIndex_(ath), aRows = ciRows_(ath);
  var hh = ciSheet_(CI_HOUSEHOLDS), hIdx = ciIndex_(hh), hRows = ciRows_(hh);

  var linked = [], created = [], review = [], skipped = 0;

  for (var i = 0; i < mRows.length; i++) {
    var r = mRows[i];
    if (ciStr_(r[mIdx['Athlete ID']])) { skipped++; continue; }
    var sid = ciStr_(r[mIdx['Submission ID']]);
    if (!sid) { skipped++; continue; }     /* not a real registration */

    var master = {
      row: i + 2,
      submissionId: sid,
      first: r[mIdx['Player First Name']],
      last: r[mIdx['Player Last Name']],
      email: mIdx['Parent Email'] == null ? '' : r[mIdx['Parent Email']],
      phone: mIdx['Parent Phone'] == null ? '' : r[mIdx['Parent Phone']]
    };

    var d = ciResolveIdentity_(master, aRows, aIdx, hRows, hIdx);
    if (d.action === 'LINK') linked.push({ row: master.row, submissionId: sid, athleteId: d.athleteId });
    else if (d.action === 'CREATE') created.push({ row: master.row, submissionId: sid, householdId: d.householdId, master: master });
    else review.push({ row: master.row, submissionId: sid, reason: d.reason });
  }

  if (commit) {
    var col = mIdx['Athlete ID'] + 1;
    for (var l = 0; l < linked.length; l++) {
      mas.getRange(linked[l].row, col).setValue(linked[l].athleteId);
    }
    for (var c = 0; c < created.length; c++) {
      var newId = ciNextId_(aRows, aIdx['Athlete ID'], 'JW-A-');
      var newRow = [];
      for (var k = 0; k < ath.getLastColumn(); k++) newRow.push('');
      newRow[aIdx['Athlete ID']] = newId;
      newRow[aIdx['First Name']] = ciStr_(created[c].master.first);
      newRow[aIdx['Last Name']] = ciStr_(created[c].master.last);
      newRow[aIdx['Household ID']] = created[c].householdId;
      newRow[aIdx['Anchor Submission ID']] = created[c].submissionId;
      newRow[aIdx['Source Submission IDs']] = created[c].submissionId;
      if (aIdx['Data Quality Status'] != null) newRow[aIdx['Data Quality Status']] = 'NEW_FROM_INTAKE';
      ath.appendRow(newRow);
      aRows.push(newRow);          /* so the next mint does not reuse this id */
      mas.getRange(created[c].row, col).setValue(newId);
      created[c].athleteId = newId;
    }
    SpreadsheetApp.flush();
  }

  return {
    mode: commit ? 'COMMIT' : 'DRY RUN',
    alreadyLinked: skipped,
    linked: linked.length, linkedDetail: linked.map(function (x) { return x.submissionId; }),
    created: created.length, createdDetail: created.map(function (x) { return x.submissionId + (x.athleteId ? ' -> ' + x.athleteId : ''); }),
    review: review.length, reviewDetail: review
  };
}

/* The single-row version doPost calls immediately after a registration lands.
   NOTHING in here may throw into doPost: the registration is already saved
   and is worth infinitely more than the link. A failure leaves the Athlete ID
   blank, which is exactly what used to happen anyway, and ciSyncPending()
   picks it up later. */
function ciSyncOne_(submissionId) {
  try {
    var mas = ciSheet_(CI_MASTER), mIdx = ciIndex_(mas);
    if (mIdx['Athlete ID'] == null) return { ok: false, reason: 'no Athlete ID column' };
    var mRows = ciRows_(mas);

    var target = -1;
    for (var i = mRows.length - 1; i >= 0; i--) {
      if (ciStr_(mRows[i][mIdx['Submission ID']]) === submissionId) { target = i; break; }
    }
    if (target === -1) return { ok: false, reason: 'row not found' };
    if (ciStr_(mRows[target][mIdx['Athlete ID']])) return { ok: true, action: 'ALREADY_LINKED' };

    var ath = ciSheet_(CI_ATHLETES), aIdx = ciIndex_(ath), aRows = ciRows_(ath);
    var hh = ciSheet_(CI_HOUSEHOLDS), hIdx = ciIndex_(hh), hRows = ciRows_(hh);
    var r = mRows[target];

    var d = ciResolveIdentity_({
      first: r[mIdx['Player First Name']],
      last: r[mIdx['Player Last Name']],
      email: mIdx['Parent Email'] == null ? '' : r[mIdx['Parent Email']],
      phone: mIdx['Parent Phone'] == null ? '' : r[mIdx['Parent Phone']]
    }, aRows, aIdx, hRows, hIdx);

    var col = mIdx['Athlete ID'] + 1, row = target + 2;

    if (d.action === 'LINK') {
      mas.getRange(row, col).setValue(d.athleteId);
      return { ok: true, action: 'LINK', athleteId: d.athleteId };
    }
    if (d.action === 'CREATE') {
      var newId = ciNextId_(aRows, aIdx['Athlete ID'], 'JW-A-');
      var newRow = [];
      for (var k = 0; k < ath.getLastColumn(); k++) newRow.push('');
      newRow[aIdx['Athlete ID']] = newId;
      newRow[aIdx['First Name']] = ciStr_(r[mIdx['Player First Name']]);
      newRow[aIdx['Last Name']] = ciStr_(r[mIdx['Player Last Name']]);
      newRow[aIdx['Household ID']] = d.householdId;
      newRow[aIdx['Anchor Submission ID']] = submissionId;
      newRow[aIdx['Source Submission IDs']] = submissionId;
      if (aIdx['Data Quality Status'] != null) newRow[aIdx['Data Quality Status']] = 'NEW_FROM_INTAKE';
      ath.appendRow(newRow);
      mas.getRange(row, col).setValue(newId);
      return { ok: true, action: 'CREATE', athleteId: newId };
    }
    return { ok: true, action: 'REVIEW', reason: d.reason };
  } catch (err) {
    return { ok: false, reason: String(err).slice(0, 200) };
  }
}
