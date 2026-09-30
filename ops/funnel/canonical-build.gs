/* ==========================================================================
   PHASE 2A RUNNER
   The editor's function picker is unreliable, so everything is driven from
   ONE entry point that is always the first function in the file. Change
   CB_STEP, save, press Run.

     'structure'  read-only report on MASTER's real shape        (no writes)
     'headers'    the two header-cell corrections                (row 1 only)
     'build'      build ATHLETES / HOUSEHOLDS / CANONICAL OVERRIDES
     'reconcile'  read-back QA                                   (no writes)
     'audience'   QA: live email audience still computes        (no writes)
     'backfillDry' Athlete ID backfill, DRY RUN                   (no writes)
     'backfill'    Athlete ID backfill, for real            (one added column)
     'health'     read-only smoke test of the live paths         (no writes)
     'snapshot'   checksum MASTER + CLINIC RSVP                  (no writes)

   Left on 'snapshot' - a read-only step - so an accidental Run writes nothing.
   ========================================================================== */
var CB_STEP = 'gap';

function cbRun() {
  var out;
  if (CB_STEP === 'structure') out = cbStructureCompact_();
  else if (CB_STEP === 'headers') out = cbFixHeaders();
  else if (CB_STEP === 'build') out = cbBuild();
  else if (CB_STEP === 'reconcile') out = cbReconcile();
  else if (CB_STEP === 'snapshot') out = cbMasterSnapshot();
  else if (CB_STEP === 'audience') {
    /* QA only: proves the live email audience still computes after the header
       correction. Read-only - eventAudience_ never writes. */
    var ids = ['2026-10-11', '2026-10-25'];
    out = { checks: ids.map(function (id) {
      var a = eventAudience_({ clinicId: id, segment: 'not_rsvpd' });
      var b = eventAudience_({ clinicId: id, segment: 'rsvpd' });
      return { clinicId: id, not_rsvpd: a.count, rsvpd: b.count, master: a.masterCount,
               partitionHolds: (a.count + b.count) === a.masterCount, excluded: a.excluded };
    }) };
  }
  else if (CB_STEP === 'backfillDry') out = cbBackfill_(true);
  else if (CB_STEP === 'backfill') out = cbBackfill_(false);
  else if (CB_STEP === 'health') {
    /* Read-only smoke test of the live paths after the backfill.
       eventAudience_ and clinicLookup_ never write and never send. */
    var res = { audience: [], lookup: {} };
    ['2026-10-11', '2026-10-25'].forEach(function (id) {
      var a = eventAudience_({ clinicId: id, segment: 'not_rsvpd' });
      var b = eventAudience_({ clinicId: id, segment: 'rsvpd' });
      res.audience.push({ clinicId: id, not_rsvpd: a.count, rsvpd: b.count,
        master: a.masterCount, partitionHolds: (a.count + b.count) === a.masterCount });
    });
    var miss = clinicLookup_({ clinicId: '2026-10-11', first: 'Zzsynthetic', last: 'Nonexistent', grade: '5th' });
    res.lookup = { ranWithoutError: true, match: miss.match, ok: miss.ok };
    var ss2 = SpreadsheetApp.openById(SPREADSHEET_ID);
    var mm2 = ss2.getSheetByName(CB_MASTER);
    var idx2 = cbHeaderIndex_(mm2);
    res.headerLookupsStillResolve = {
      submissionId: idx2['Submission ID'] !== undefined,
      playerFullName: idx2['Player Full Name'] !== undefined,
      playerLastName: idx2['Player Last Name'] !== undefined,
      grade: idx2['Grade'] !== undefined,
      school: idx2['School'] !== undefined,
      parentEmail: idx2['Parent Email'] !== undefined,
      registrationStatus: idx2['Registration Status'] !== undefined,
      lastUpdated: idx2['Last Updated'] !== undefined,
      submissionType: idx2['Submission Type'] !== undefined,
      playerFirstName: idx2['Player First Name'] !== undefined,
      athleteId: idx2['Athlete ID'] !== undefined,
      columns: mm2.getLastColumn()
    };
    out = res;
  }
  else if (CB_STEP === 'gap') out = confirmationGap();
  else if (CB_STEP === 'sweepDry') out = confirmationSweep(true);
  else out = { error: 'unknown CB_STEP: ' + CB_STEP };
  Logger.log('===BEGIN===');
  Logger.log(JSON.stringify(out));
  Logger.log('===END===');
  return out;
}

/* The full structure report is too large for the execution log, and most of
   it is per-column detail nobody needs twice. This keeps the parts that
   decide whether the header correction is safe. */
function cbStructureCompact_() {
  var full = cbStructureReport();
  return {
    tabs: full.tabs,
    masterRows: full.master.rows,
    masterCols: full.master.cols,
    columns: full.master.columns.map(function (c) {
      return {
        i: c.i, h: c.header, n: c.nonEmpty,
        shapes: c.shapes,
        distinct: c.distinctSeen === undefined ? Object.keys(c.values || {}).length : c.distinctSeen,
        values: c.values || undefined
      };
    }),
    checksum: full.checksum
  };
}

/* ==========================================================================
   JUNIOR WOLVES — CANONICAL DATA LAYER  (Phase 2A, added 2026-09-29)
   --------------------------------------------------------------------------
   Builds the three-table canonical model on top of the existing submission
   log:

     MASTER REGISTRATIONS   the append-only record of what families actually
                            submitted. NEVER edited by this file except for
                            one header-cell correction (cbFixHeaders).
     ATHLETES               one canonical row per child.
     HOUSEHOLDS             one canonical row per family/contact group.

   Plus one control tab:

     CANONICAL OVERRIDES    human decisions. The builder reads it; it never
                            invents entries there beyond NEEDS_REVIEW stubs.

   ---------------------------------------------------------------------
   WHY THERE ARE NO FAMILY RECORDS IN THIS FILE
   ---------------------------------------------------------------------
   Every review decision handed down for the six flagged duplicate sets was
   deliberately re-expressed as a GENERAL RULE rather than a hard-coded record:

     "use the newer phone"        -> canonical phone is the most recent
                                     non-empty submitted value, always.
     "don't pick an email"        -> more than one distinct address in a
                                     household is preserved and flagged.
     "don't pick a grade"         -> conflicting grades leave Current Grade
                                     BLANK and set Grade Status NEEDS_REVIEW.
     "don't fix the typo'd domain"-> a domain one edit away from a common
                                     provider is flagged, never corrected.
     "don't merge the two guardians" -> an ambiguous identity stays split and
                                     is cross-referenced, never merged.

   The result is that this file contains no athlete name, guardian name,
   email address, phone number or family record of any kind. It is safe to
   read, review and store as code. Decisions that genuinely need a human live
   in the CANONICAL OVERRIDES tab inside the private spreadsheet, not here.

   ---------------------------------------------------------------------
   IDENTITY
   ---------------------------------------------------------------------
   IDs are sequential and readable (JW-A-0001 / JW-H-0001) but are NOT derived
   from name, grade, school or row number. Stability across rebuilds comes
   from the ANCHOR SUBMISSION ID: the earliest submission belonging to that
   athlete or household. A rebuild reads the existing tab, keys on the anchor,
   and reuses the ID it already assigned. Only genuinely new records get a new
   number.

   Matching is the conservative method from the duplicate audit:
     households  submissions join only on a shared normalised email OR a
                 shared 10-digit phone (union-find, so A-B and B-C merge).
     athletes    normalised name AND same household. A name alone never
                 merges two children; two names never merge into one.
   A false merge is worse than a temporary split, so anything ambiguous stays
   apart and carries a flag.
   ========================================================================== */

var CB_MASTER   = 'MASTER REGISTRATIONS';
var CB_ATHLETES = 'ATHLETES';
var CB_HOUSE    = 'HOUSEHOLDS';
var CB_OVERRIDE = 'CANONICAL OVERRIDES';

/* Rows that are our own test data, not families. Same expression the audience
   builder uses - the two must agree or the counts will not. */
var CB_QA = /qa test|qa verify|qafunnel|qatest|funnelcheck|do not count/i;

var CB_PLACEHOLDER_DOMAINS = [
  'example.com', 'example.org', 'example.net', 'example.edu',
  'test.com', 'test.test', 'localhost', 'invalid', 'email.com',
  'domain.com', 'yourdomain.com', 'mydomain.com', 'none.com',
  'noemail.com', 'no-email.com', 'nomail.com', 'fake.com', 'sample.com'
];

/* Mailbox providers common enough that a one-character difference is far more
   likely to be a typo than a real domain. Used ONLY to raise a flag - nothing
   in this file ever rewrites an address. */
var CB_COMMON_DOMAINS = [
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com',
  'icloud.com', 'comcast.net', 'sbcglobal.net', 'att.net', 'me.com',
  'live.com', 'msn.com', 'mac.com', 'verizon.net', 'ymail.com'
];

var CB_ORG = ['triumphhoopsacademy@gmail.com', 'msoriano33@gmail.com',
              'noreply@triumphhoopsacademy.com'];

/* ========================================================================
   SMALL HELPERS
   ======================================================================== */

function cbStr_(v) { return String(v == null ? '' : v).trim(); }

function cbNorm_(v) {
  return String(v == null ? '' : v)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^A-Za-z]/g, '')
    .toLowerCase();
}

function cbEmail_(v) { return cbStr_(v).toLowerCase(); }

function cbPhone_(v) {
  var d = cbStr_(v).replace(/\D/g, '');
  if (d.length === 11 && d.charAt(0) === '1') d = d.slice(1);
  return d.length === 10 ? d : '';
}

/* Grade as a bare integer 3-8. Returns '' when it cannot be read.
   NOTE: this is NOT the grade normalisation phase. This only reads what is
   there; nothing is rewritten in MASTER. */
function cbGradeInt_(v) {
  var m = cbStr_(v).match(/(\d+)/);
  if (!m) return '';
  var n = parseInt(m[1], 10);
  return (n >= 1 && n <= 12) ? String(n) : '';
}

function cbValidEmail_(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
}

function cbDomain_(e) {
  var at = String(e).lastIndexOf('@');
  return at === -1 ? '' : String(e).slice(at + 1);
}

function cbIsPlaceholder_(e) {
  var d = cbDomain_(e);
  if (CB_PLACEHOLDER_DOMAINS.indexOf(d) !== -1) return true;
  return /\.(test|invalid|example|localhost)$/.test(d);
}

function cbLev_(a, b) {
  var m = a.length, n = b.length;
  if (Math.abs(m - n) > 1) return 2;
  var prev = [], cur = [], i, j;
  for (j = 0; j <= n; j++) prev[j] = j;
  for (i = 1; i <= m; i++) {
    cur[0] = i;
    for (j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1,
                        prev[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1));
    }
    for (j = 0; j <= n; j++) prev[j] = cur[j];
  }
  return prev[n];
}

/* '' when the address looks fine, otherwise the reason it does not. */
function cbEmailProblem_(e) {
  if (!e) return 'MISSING';
  if (!cbValidEmail_(e)) return 'MALFORMED';
  if (cbIsPlaceholder_(e)) return 'PLACEHOLDER';
  var d = cbDomain_(e);
  for (var i = 0; i < CB_COMMON_DOMAINS.length; i++) {
    if (d === CB_COMMON_DOMAINS[i]) return '';
    if (cbLev_(d, CB_COMMON_DOMAINS[i]) === 1) return 'SUSPECT_DOMAIN';
  }
  return '';
}

/* Does production email this address today? The live audience builder keys on
   address, not household, and skips QA rows, placeholders, malformed
   addresses and Triumph's own inboxes. */
function cbInLiveAudience_(e) {
  if (!e || !cbValidEmail_(e) || cbIsPlaceholder_(e)) return false;
  return CB_ORG.indexOf(e) === -1;
}

function cbHeaderIndex_(sheet) {
  var head = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var idx = {};
  for (var i = 0; i < head.length; i++) {
    var k = cbStr_(head[i]);
    if (k && idx[k] === undefined) idx[k] = i;
  }
  return idx;
}

/* Resolve a column by any of several header spellings, else by a known
   position. Returns -1 when it cannot be resolved at all, and the caller
   refuses to run rather than guessing. */
function cbCol_(idx, names, fallbackPos) {
  for (var i = 0; i < names.length; i++) {
    if (idx[names[i]] !== undefined) return idx[names[i]];
  }
  return (fallbackPos === undefined) ? -1 : fallbackPos;
}

function cbSheet_(ss, name) {
  var sh = ss.getSheetByName(name);
  if (!sh) throw new Error('missing sheet: ' + name);
  return sh;
}

/* A checksum over every DATA row (row 2 down), used to prove that a header
   write changed no family data. */
function cbDataChecksum_(sheet) {
  var last = sheet.getLastRow();
  if (last < 2) return { rows: 0, digest: 'empty' };
  var vals = sheet.getRange(2, 1, last - 1, sheet.getLastColumn()).getValues();
  var flat = vals.map(function (r) {
    return r.map(function (c) {
      return (c instanceof Date) ? c.toISOString() : String(c == null ? '' : c);
    }).join('\u0001');
  }).join('\u0002');
  var sig = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, flat);
  return {
    rows: vals.length,
    cols: sheet.getLastColumn(),
    digest: Utilities.base64EncodeWebSafe(sig)
  };
}

/* ========================================================================
   STEP 0 - STRUCTURE REPORT  (read-only, writes nothing)
   Run this before anything else. It proves what is actually under the two
   broken headers instead of trusting the labels.
   ======================================================================== */
function cbStructureReport() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var out = { tabs: [], master: {} };

  ss.getSheets().forEach(function (sh) {
    out.tabs.push({ name: sh.getName(), rows: sh.getLastRow(), cols: sh.getLastColumn() });
  });

  var m = cbSheet_(ss, CB_MASTER);
  var head = m.getRange(1, 1, 1, m.getLastColumn()).getValues()[0];
  var last = m.getLastRow();
  var rows = last > 1 ? m.getRange(2, 1, last - 1, m.getLastColumn()).getValues() : [];

  /* For each column: its header, how many rows are non-empty, and a
     SHAPE description of the values - never the values themselves. */
  var cols = [];
  for (var c = 0; c < head.length; c++) {
    var nonEmpty = 0, distinct = {}, shapes = {};
    for (var r = 0; r < rows.length; r++) {
      var v = rows[r][c];
      var s = (v instanceof Date) ? 'DATE' : cbStr_(v);
      if (s === '') continue;
      nonEmpty++;
      if (Object.keys(distinct).length < 60) distinct[s] = (distinct[s] || 0) + 1;
      var shape = (v instanceof Date) ? 'date'
        : /^\d+$/.test(s) ? 'integer'
        : /@/.test(s) ? 'email-like'
        : /^\+?[\d\s().-]{7,}$/.test(s) ? 'phone-like'
        : /^\d{4}-\d{2}-\d{2}/.test(s) ? 'iso-date-like'
        : /\s/.test(s) ? 'multi-word'
        : 'single-word';
      shapes[shape] = (shapes[shape] || 0) + 1;
    }
    var distinctCount = Object.keys(distinct).length;
    var col = {
      i: c,
      header: cbStr_(head[c]) || '(BLANK HEADER)',
      nonEmpty: nonEmpty,
      shapes: shapes,
      distinctSampleCapped: distinctCount >= 60
    };
    /* Only show actual values for LOW-CARDINALITY columns, which are
       categories (submission type, status, size) and not family data. */
    if (distinctCount > 0 && distinctCount <= 12) col.values = distinct;
    else col.distinctSeen = distinctCount;
    cols.push(col);
  }
  out.master = { rows: rows.length, cols: head.length, columns: cols };
  out.checksum = cbDataChecksum_(m);
  Logger.log(JSON.stringify(out, null, 1));
  return out;
}

/* ========================================================================
   STEP 1 - HEADER CORRECTION  (writes row 1 only)
   Verifies the data underneath first, refuses if it does not look right,
   and proves afterwards that no data row moved.
   ======================================================================== */
function cbFixHeaders() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var m = cbSheet_(ss, CB_MASTER);
  var head = m.getRange(1, 1, 1, m.getLastColumn()).getValues()[0];
  var last = m.getLastRow();
  var rows = last > 1 ? m.getRange(2, 1, last - 1, m.getLastColumn()).getValues() : [];

  var before = cbDataChecksum_(m);
  var result = { before: before, changes: [], refused: [] };

  /* --- column 2: expected to be the submission type -------------------- */
  var c2 = 2;
  var v2 = {}, n2 = 0;
  rows.forEach(function (r) {
    var s = cbStr_(r[c2]); if (!s) return; n2++; v2[s] = (v2[s] || 0) + 1;
  });
  var d2 = Object.keys(v2);
  var looksLikeType = d2.length > 0 && d2.length <= 6 &&
    d2.every(function (s) { return /junior wolves|interest|tryout|registration/i.test(s); });

  if (cbStr_(head[c2]) !== '') {
    result.refused.push('col 2 already has a header: "' + cbStr_(head[c2]) + '" - left alone');
  } else if (!looksLikeType) {
    result.refused.push('col 2 does not look like a submission type (' + d2.length + ' distinct) - left alone');
  } else {
    m.getRange(1, c2 + 1).setValue('Submission Type');
    result.changes.push({ col: c2, from: '(blank)', to: 'Submission Type', distinctValues: v2 });
  }

  /* --- column 3: labelled Registration Source, expected to be a first name */
  var c3 = 3;
  var single = 0, n3 = 0, emails = 0;
  rows.forEach(function (r) {
    var s = cbStr_(r[c3]); if (!s) return; n3++;
    if (/@/.test(s)) emails++;
    if (!/\s/.test(s)) single++;
  });
  /* A first-name column is overwhelmingly single-token, high cardinality, and
     contains no addresses. A real "source" column would be low cardinality. */
  var distinct3 = {};
  rows.forEach(function (r) { var s = cbStr_(r[c3]); if (s) distinct3[s] = 1; });
  var card3 = Object.keys(distinct3).length;
  /* A first-name column is overwhelmingly single-token, has NO addresses, and
     is high-cardinality RELATIVE to the number of rows. A genuine
     "Registration Source" column would be a handful of repeated values. */
  var looksLikeFirstName = n3 > 0 && emails === 0 && (single / n3) > 0.8 &&
                           card3 > Math.max(10, n3 * 0.25);

  if (cbStr_(head[c3]) !== 'Registration Source') {
    result.refused.push('col 3 header is "' + cbStr_(head[c3]) + '", not "Registration Source" - left alone');
  } else if (!looksLikeFirstName) {
    result.refused.push('col 3 does not look like a first-name column (singleToken=' +
      single + '/' + n3 + ', distinct=' + card3 + ', emails=' + emails + ') - left alone');
  } else {
    m.getRange(1, c3 + 1).setValue('Player First Name');
    result.changes.push({ col: c3, from: 'Registration Source', to: 'Player First Name',
                          singleToken: single + '/' + n3, distinct: card3 });
  }

  SpreadsheetApp.flush();
  result.after = cbDataChecksum_(m);
  result.dataUnchanged = (before.digest === result.after.digest && before.rows === result.after.rows);
  result.newHeader = m.getRange(1, 1, 1, m.getLastColumn()).getValues()[0].map(function (h) {
    return cbStr_(h) || '(BLANK)';
  });
  Logger.log(JSON.stringify(result, null, 1));
  return result;
}

/* ========================================================================
   STEP 2 - READ THE LIVE SUBMISSION LOG
   Pure read. Produces one normalised record per real submission row.
   ======================================================================== */
function cbReadSubmissions_() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var m = cbSheet_(ss, CB_MASTER);
  var idx = cbHeaderIndex_(m);
  var last = m.getLastRow();
  var rows = last > 1 ? m.getRange(2, 1, last - 1, m.getLastColumn()).getValues() : [];

  var col = {
    ts:     cbCol_(idx, ['Timestamp', 'Submitted At', 'Submission Date', 'Date'], 0),
    type:   cbCol_(idx, ['Submission Type'], 2),
    first:  cbCol_(idx, ['Player First Name'], 3),
    lastN:  cbCol_(idx, ['Player Last Name'], -1),
    full:   cbCol_(idx, ['Player Full Name'], -1),
    grade:  cbCol_(idx, ['Grade'], -1),
    school: cbCol_(idx, ['School'], -1),
    parent: cbCol_(idx, ['Parent / Guardian Name', 'Parent/Guardian Name', 'Parent Name'], -1),
    email:  cbCol_(idx, ['Parent Email'], -1),
    phone:  cbCol_(idx, ['Parent Phone', 'Phone', 'Parent / Guardian Phone'], -1),
    sub:    cbCol_(idx, ['Submission ID'], -1)
  };
  ['grade', 'school', 'email', 'sub'].forEach(function (k) {
    if (col[k] === -1) throw new Error('cannot resolve required column: ' + k);
  });

  var out = [], skipped = { qa: 0, placeholder: 0, blank: 0 };

  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var joined = r.join(' ');
    if (!cbStr_(joined)) { skipped.blank++; continue; }
    if (CB_QA.test(joined)) { skipped.qa++; continue; }

    var email = cbEmail_(r[col.email]);
    if (email && cbIsPlaceholder_(email)) { skipped.placeholder++; continue; }

    var first = col.first === -1 ? '' : cbStr_(r[col.first]);
    var lastName = col.lastN === -1 ? '' : cbStr_(r[col.lastN]);
    if ((!first || !lastName) && col.full !== -1) {
      var sp = splitFull_(r[col.full]);
      if (!first) first = sp.first;
      if (!lastName) lastName = sp.last;
    }

    var tsRaw = col.ts === -1 ? '' : r[col.ts];
    var ts = (tsRaw instanceof Date) ? tsRaw.getTime()
           : (cbStr_(tsRaw) && !isNaN(new Date(cbStr_(tsRaw)).getTime()))
             ? new Date(cbStr_(tsRaw)).getTime() : null;

    var subId = cbStr_(r[col.sub]);
    var synthetic = false;
    if (!subId) {
      synthetic = true;
      var seed = String(ts || '') + '|' + cbNorm_(first) + '|' + cbNorm_(lastName) + '|' + email;
      subId = 'SYN-' + Utilities.base64EncodeWebSafe(
        Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, seed)).slice(0, 12);
    }

    out.push({
      rowNumber: i + 2,                 /* for QA tracing only, never identity */
      order: i,
      subId: subId,
      syntheticId: synthetic,
      type: col.type === -1 ? '' : cbStr_(r[col.type]),
      first: first,
      last: lastName,
      nameKey: cbNorm_(first) + '|' + cbNorm_(lastName),
      grade: cbGradeInt_(r[col.grade]),
      gradeRaw: cbStr_(r[col.grade]),
      school: cbStr_(r[col.school]),
      parent: col.parent === -1 ? '' : cbStr_(r[col.parent]),
      email: email,
      phone: col.phone === -1 ? '' : cbPhone_(r[col.phone]),
      ts: ts
    });
  }
  return { rows: out, skipped: skipped, columns: col, totalSheetRows: rows.length };
}

/* Earliest submission in a set. Timestamp first; sheet order breaks ties and
   covers rows with no readable timestamp. */
function cbAnchor_(list) {
  var best = list[0];
  for (var i = 1; i < list.length; i++) {
    var a = list[i], b = best;
    if (a.ts != null && b.ts != null) { if (a.ts < b.ts) best = a; }
    else if (a.ts != null && b.ts == null) best = a;
    else if (a.ts == null && b.ts == null) { if (a.order < b.order) best = a; }
  }
  return best;
}

/* Most recent non-empty value of a field across a set of submissions, plus
   every distinct value seen. "Most recent" is the rule approved for phone and
   applied uniformly; conflicts are reported, never silently resolved. */
function cbLatest_(list, field) {
  var sorted = list.slice().sort(function (a, b) {
    if (a.ts != null && b.ts != null && a.ts !== b.ts) return a.ts - b.ts;
    return a.order - b.order;
  });
  var latest = '', seen = [], seenSet = {};
  for (var i = 0; i < sorted.length; i++) {
    var v = cbStr_(sorted[i][field]);
    if (!v) continue;
    latest = v;
    var k = v.toLowerCase();
    if (!seenSet[k]) { seenSet[k] = true; seen.push(v); }
  }
  return { latest: latest, distinct: seen, conflict: seen.length > 1, ordered: sorted };
}

/* ========================================================================
   STEP 3 - BUILD THE CANONICAL MODEL  (in memory; writes nothing)
   ======================================================================== */
function cbModel_() {
  var read = cbReadSubmissions_();
  var subs = read.rows;

  /* ---- households: union-find on shared email OR shared 10-digit phone --- */
  var parent = {};
  function find(x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
  function union(a, b) { a = find(a); b = find(b); if (a !== b) parent[b] = a; }

  subs.forEach(function (s) { parent[s.subId] = s.subId; });

  var byEmail = {}, byPhone = {};
  subs.forEach(function (s) {
    if (s.email) { (byEmail[s.email] = byEmail[s.email] || []).push(s.subId); }
    if (s.phone) { (byPhone[s.phone] = byPhone[s.phone] || []).push(s.subId); }
  });
  var mergedByPhoneOnly = {};
  Object.keys(byEmail).forEach(function (k) {
    for (var i = 1; i < byEmail[k].length; i++) union(byEmail[k][0], byEmail[k][i]);
  });
  Object.keys(byPhone).forEach(function (k) {
    var ids = byPhone[k];
    for (var i = 1; i < ids.length; i++) {
      if (find(ids[0]) !== find(ids[i])) mergedByPhoneOnly[k] = true;   /* joined only because of the phone */
      union(ids[0], ids[i]);
    }
  });

  var clusters = {};
  subs.forEach(function (s) { (clusters[find(s.subId)] = clusters[find(s.subId)] || []).push(s); });

  /* ---- athletes: normalised name WITHIN a household ---------------------- */
  var households = [], athletes = [];
  Object.keys(clusters).forEach(function (key) {
    var list = clusters[key];
    var hAnchor = cbAnchor_(list);
    var h = {
      anchor: hAnchor.subId,
      subs: list,
      athletes: []
    };
    var byName = {};
    list.forEach(function (s) { (byName[s.nameKey] = byName[s.nameKey] || []).push(s); });
    Object.keys(byName).forEach(function (nk) {
      var al = byName[nk];
      var a = { anchor: cbAnchor_(al).subId, subs: al, nameKey: nk, household: h };
      athletes.push(a);
      h.athletes.push(a);
    });
    households.push(h);
  });

  /* ---- an identical name in more than one household is AMBIGUOUS --------- */
  var nameToAthletes = {};
  athletes.forEach(function (a) {
    if (!a.nameKey.replace('|', '')) return;
    (nameToAthletes[a.nameKey] = nameToAthletes[a.nameKey] || []).push(a);
  });
  Object.keys(nameToAthletes).forEach(function (nk) {
    var group = nameToAthletes[nk];
    if (group.length < 2) return;
    group.forEach(function (a) { a.ambiguousWith = group.length - 1; });
  });

  return {
    read: read, subs: subs, households: households, athletes: athletes,
    mergedByPhoneOnly: Object.keys(mergedByPhoneOnly).length
  };
}

/* ========================================================================
   STEP 4 - CONTACTS WITHIN A HOUSEHOLD
   A contact is a distinct address (or, failing that, a distinct phone or
   guardian name). Primary is the contact on the household's most recent
   submission; the rest keep their slots in recency order. Nothing is
   discarded and nothing is chosen on the family's behalf - more than one
   contact always raises a review flag.
   ======================================================================== */
function cbContacts_(h) {
  var ordered = h.subs.slice().sort(function (a, b) {
    if (a.ts != null && b.ts != null && a.ts !== b.ts) return b.ts - a.ts;   /* newest first */
    return b.order - a.order;
  });
  var map = {}, order = [];
  ordered.forEach(function (s) {
    if (!s.email && !s.phone && !cbStr_(s.parent)) return;
    var key = s.email ? s.email
            : s.phone ? ('phone:' + s.phone)
            : ('name:' + cbNorm_(s.parent));
    if (!map[key]) {
      map[key] = { email: s.email, phone: s.phone, name: cbStr_(s.parent), subs: [] };
      order.push(key);
    }
    var c = map[key];
    if (!c.phone && s.phone) c.phone = s.phone;          /* newest phone wins, then fill gaps */
    if (!c.name && cbStr_(s.parent)) c.name = cbStr_(s.parent);
    c.subs.push(s);
  });
  return order.map(function (k) { return map[k]; });
}

/* ========================================================================
   STEP 5 - ID ASSIGNMENT
   Sequential and readable, but anchored so a rebuild reuses what it already
   handed out. Never derived from name, grade, school or row number.
   ======================================================================== */
function cbExistingIds_(ss, tabName, idCol, anchorCol) {
  var sh = ss.getSheetByName(tabName);
  var map = {}, maxN = 0;
  if (!sh || sh.getLastRow() < 2) return { map: map, maxN: maxN };
  var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var iId = head.indexOf(idCol), iAnchor = head.indexOf(anchorCol);
  if (iId === -1 || iAnchor === -1) return { map: map, maxN: maxN };
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
  vals.forEach(function (r) {
    var id = cbStr_(r[iId]), anchor = cbStr_(r[iAnchor]);
    if (!id || !anchor) return;
    map[anchor] = id;
    var m = id.match(/(\d+)$/);
    if (m) maxN = Math.max(maxN, parseInt(m[1], 10));
  });
  return { map: map, maxN: maxN };
}

function cbAssignIds_(records, prefix, existing) {
  /* deterministic first-build order: earliest anchor submission first */
  var sorted = records.slice().sort(function (a, b) {
    var at = cbAnchor_(a.subs), bt = cbAnchor_(b.subs);
    if (at.ts != null && bt.ts != null && at.ts !== bt.ts) return at.ts - bt.ts;
    return at.order - bt.order;
  });
  var n = existing.maxN, reused = 0, fresh = 0;
  sorted.forEach(function (rec) {
    if (existing.map[rec.anchor]) { rec.id = existing.map[rec.anchor]; reused++; }
    else { n++; rec.id = prefix + ('0000' + n).slice(-4); fresh++; }
  });
  return { reused: reused, fresh: fresh, ordered: sorted };
}

/* ========================================================================
   STEP 6 - BUILD AND WRITE
   ======================================================================== */
var CB_ATHLETE_HEADERS = [
  'Athlete ID', 'First Name', 'Last Name',
  'Current Grade', 'Grade Status', 'Grade (Most Recent Submitted)',
  'Current School (Raw)', 'School Code', 'School Display Name', 'School Status',
  'Household ID', 'Status', 'Tryout Registration Status',
  'Data Quality Status', 'Review Flags',
  'First Registration Date', 'Most Recent Registration Date',
  'Registration History Count', 'Interest Submissions', 'Tryout Submissions',
  'Anchor Submission ID', 'Source Submission IDs'
];

var CB_HOUSEHOLD_HEADERS = [
  'Household ID',
  'Primary Contact Name', 'Primary Email', 'Primary Phone', 'Primary Email Status',
  'Secondary Contact Name', 'Secondary Email', 'Secondary Phone', 'Secondary Email Status',
  'Additional Contacts Count', 'Distinct Contacts', 'Other Contacts',
  'Linked Athlete IDs', 'Athlete Count',
  'Emails In Live Audience', 'Communication Status',
  'Data Quality Status', 'Review Flags',
  'Anchor Submission ID', 'Source Submission IDs'
];

var CB_OVERRIDE_HEADERS = [
  'Override ID', 'Scope', 'Target ID', 'Field', 'Decision', 'Value',
  'Status', 'Raised By', 'Raised On', 'Decided By', 'Decided On', 'Note'
];

function cbFmtDate_(ts) {
  if (ts == null) return '';
  return Utilities.formatDate(new Date(ts), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function cbIsTryout_(type) { return /tryout/i.test(type); }
function cbIsInterest_(type) { return /interest/i.test(type); }

function cbBuild() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var masterBefore = cbDataChecksum_(cbSheet_(ss, CB_MASTER));

  var model = cbModel_();

  var hExisting = cbExistingIds_(ss, CB_HOUSE, 'Household ID', 'Anchor Submission ID');
  var aExisting = cbExistingIds_(ss, CB_ATHLETES, 'Athlete ID', 'Anchor Submission ID');
  var hIds = cbAssignIds_(model.households, 'JW-H-', hExisting);
  var aIds = cbAssignIds_(model.athletes, 'JW-A-', aExisting);

  var stats = {
    athletesNeedingReview: 0, householdsNeedingReview: 0,
    gradeConflicts: 0, schoolConflicts: 0, missingLastName: 0,
    multiContact: 0, overflowContacts: 0, suspectDomains: 0,
    ambiguousIdentity: 0, missingEmail: 0, maxContactsInAHousehold: 0,
    interestOnly: 0, registered: 0
  };
  var overrides = [];
  var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  function raise(scope, target, field, note) {
    overrides.push([
      'OV-' + ('0000' + (overrides.length + 1)).slice(-4),
      scope, target, field, '', '', 'OPEN', 'Phase 2A builder', today, '', '', note
    ]);
  }

  /* ---------------- households ---------------- */
  var houseRows = [];
  hIds.ordered.forEach(function (h) {
    var contacts = cbContacts_(h);
    stats.maxContactsInAHousehold = Math.max(stats.maxContactsInAHousehold, contacts.length);
    if (contacts.length > 1) stats.multiContact++;
    if (contacts.length > 2) stats.overflowContacts++;

    var flags = [];
    var c1 = contacts[0] || { name: '', email: '', phone: '' };
    var c2 = contacts[1] || { name: '', email: '', phone: '' };

    var p1 = cbEmailProblem_(c1.email);
    var p2 = c2.email ? cbEmailProblem_(c2.email) : '';
    if (p1 === 'SUSPECT_DOMAIN' || p2 === 'SUSPECT_DOMAIN') {
      stats.suspectDomains++;
      flags.push('CONTACT VERIFICATION NEEDED');
    }
    if (!c1.email) { stats.missingEmail++; flags.push('NO EMAIL ON FILE'); }
    if (contacts.length > 1) flags.push('PRIMARY EMAIL NEEDED');
    if (contacts.length > 2) flags.push('MORE THAN TWO CONTACTS - SLOTS OVERFLOWED');

    var live = 0;
    contacts.forEach(function (c) { if (cbInLiveAudience_(c.email)) live++; });

    var comm = (p1 === 'SUSPECT_DOMAIN' || p1 === 'MALFORMED' || !c1.email)
      ? 'Needs Verification'
      : (contacts.length > 1 ? 'Active - Recipient Under Review' : 'Active');

    var dq = flags.length ? 'NEEDS_REVIEW' : 'OK';
    if (dq === 'NEEDS_REVIEW') stats.householdsNeedingReview++;

    if (contacts.length > 1) raise('HOUSEHOLD', h.id, 'Primary Contact',
      'Household has ' + contacts.length + ' distinct contacts. Confirm primary, secondary, and whether both receive program communications. Live audience currently reaches ' + live + ' of them.');
    if (p1 === 'SUSPECT_DOMAIN' || p2 === 'SUSPECT_DOMAIN') raise('HOUSEHOLD', h.id, 'Email',
      'Email domain is one character from a common provider. NOT corrected automatically. Verify by phone before sending.');
    if (!c1.email) raise('HOUSEHOLD', h.id, 'Email', 'No usable email address on file.');

    houseRows.push([
      h.id,
      c1.name, c1.email, c1.phone, p1 || 'OK',
      c2.name, c2.email, c2.phone, c2.email ? (p2 || 'OK') : '',
      Math.max(0, contacts.length - 2), contacts.length,
      contacts.slice(2).map(function (c) {
        return [c.name, c.email, c.phone].filter(String).join(' / ');
      }).join(' | '),
      h.athletes.map(function (a) { return a.id; }).join('; '),
      h.athletes.length,
      live, comm, dq, flags.join('; '),
      h.anchor,
      h.subs.map(function (s) { return s.subId; }).join('; ')
    ]);
  });

  /* ---------------- athletes ---------------- */
  var athRows = [];
  aIds.ordered.forEach(function (a) {
    var flags = [];
    var first = cbLatest_(a.subs, 'first');
    var lastN = cbLatest_(a.subs, 'last');
    var grade = cbLatest_(a.subs, 'grade');
    var school = cbLatest_(a.subs, 'school');

    if (!lastN.latest) { stats.missingLastName++; flags.push('LAST NAME MISSING'); }

    var gradeStatus = 'OK', currentGrade = grade.latest;
    if (grade.conflict) {
      gradeStatus = 'NEEDS_REVIEW';
      currentGrade = '';                       /* deliberately blank: nobody guesses a grade */
      stats.gradeConflicts++;
      flags.push('GRADE CONFLICT (' + grade.distinct.join(' / ') + ')');
      raise('ATHLETE', a.id, 'Current Grade',
        'Submissions disagree: ' + grade.distinct.join(' / ') + '. Grade drives placement and eligibility, so no value was chosen.');
    } else if (!currentGrade) {
      gradeStatus = 'MISSING';
      flags.push('GRADE MISSING');
    }

    var schoolStatus = school.latest ? 'OK' : 'MISSING';
    if (school.conflict) {
      schoolStatus = 'CONFLICT';
      stats.schoolConflicts++;
      flags.push('CURRENT SCHOOL NEEDED');
      raise('ATHLETE', a.id, 'Current School',
        'Submissions carry ' + school.distinct.length + ' different school values. Most recent shown; not normalised yet.');
    } else if (!school.latest) {
      flags.push('SCHOOL MISSING');
    }

    if (a.ambiguousWith) {
      stats.ambiguousIdentity++;
      flags.push('POSSIBLE SAME ATHLETE IN ANOTHER HOUSEHOLD - NOT MERGED');
      raise('ATHLETE', a.id, 'Identity',
        'An athlete with the same name exists in ' + a.ambiguousWith + ' other household record(s). Kept separate on purpose. Confirm whether these are one child with two guardian households, or different children.');
    }

    var tryouts = 0, interests = 0;
    a.subs.forEach(function (s) {
      if (cbIsTryout_(s.type)) tryouts++;
      else if (cbIsInterest_(s.type)) interests++;
    });
    var tryoutStatus = tryouts > 0 ? 'Registered' : 'Interest Only';
    if (tryouts > 0) stats.registered++; else stats.interestOnly++;

    var ordered = a.subs.slice().sort(function (x, y) {
      if (x.ts != null && y.ts != null && x.ts !== y.ts) return x.ts - y.ts;
      return x.order - y.order;
    });
    var firstTs = null, lastTs = null;
    ordered.forEach(function (s) {
      if (s.ts == null) return;
      if (firstTs == null) firstTs = s.ts;
      lastTs = s.ts;
    });

    var dq = flags.length ? 'NEEDS_REVIEW' : 'OK';
    if (dq === 'NEEDS_REVIEW') stats.athletesNeedingReview++;

    athRows.push([
      a.id, first.latest, lastN.latest,
      currentGrade, gradeStatus, grade.latest,
      school.latest, '', '', schoolStatus,
      a.household.id, 'Active', tryoutStatus,
      dq, flags.join('; '),
      cbFmtDate_(firstTs), cbFmtDate_(lastTs),
      a.subs.length, interests, tryouts,
      a.anchor,
      ordered.map(function (s) { return s.subId; }).join('; ')
    ]);
  });

  /* ---------------- write ---------------- */
  cbWriteTab_(ss, CB_HOUSE, CB_HOUSEHOLD_HEADERS, houseRows);
  cbWriteTab_(ss, CB_ATHLETES, CB_ATHLETE_HEADERS, athRows);
  cbWriteOverrides_(ss, overrides);

  SpreadsheetApp.flush();
  var masterAfter = cbDataChecksum_(cbSheet_(ss, CB_MASTER));

  var out = {
    submissionsInSheet: model.read.totalSheetRows,
    submissionsSkipped: model.read.skipped,
    realSubmissions: model.subs.length,
    athletes: model.athletes.length,
    households: model.households.length,
    idsReusedAthletes: aIds.reused, idsNewAthletes: aIds.fresh,
    idsReusedHouseholds: hIds.reused, idsNewHouseholds: hIds.fresh,
    householdsJoinedOnlyByPhone: model.mergedByPhoneOnly,
    syntheticSubmissionIds: model.subs.filter(function (s) { return s.syntheticId; }).length,
    openOverrides: overrides.length,
    stats: stats,
    masterUnchanged: masterBefore.digest === masterAfter.digest,
    masterRowsBefore: masterBefore.rows, masterRowsAfter: masterAfter.rows,
    resolvedColumns: model.read.columns,
    builtAt: new Date().toISOString()
  };
  Logger.log(JSON.stringify(out, null, 1));
  return out;
}

/* Replaces the tab's contents wholesale. These tabs are DERIVED - the source
   of truth is the submission log - so a rebuild is always safe. */
function cbWriteTab_(ss, name, headers, rows) {
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  sh.clear();
  sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  if (rows.length) sh.getRange(2, 1, rows.length, headers.length).setValues(rows);
  sh.setFrozenRows(1);
  sh.autoResizeColumns(1, Math.min(headers.length, 12));
}

/* The overrides tab is the one place a human writes. Decisions already
   recorded there are PRESERVED; only still-open, no-longer-relevant stubs are
   refreshed. */
function cbWriteOverrides_(ss, fresh) {
  var sh = ss.getSheetByName(CB_OVERRIDE);
  var kept = [];
  if (sh && sh.getLastRow() > 1) {
    var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    var iStatus = head.indexOf('Status');
    var vals = sh.getRange(2, 1, sh.getLastRow() - 1, CB_OVERRIDE_HEADERS.length).getValues();
    vals.forEach(function (r) {
      if (iStatus !== -1 && cbStr_(r[iStatus]).toUpperCase() !== 'OPEN') kept.push(r);
    });
  }
  /* renumber so ids stay unique across kept + fresh */
  var all = kept.concat(fresh);
  for (var i = 0; i < all.length; i++) all[i][0] = 'OV-' + ('0000' + (i + 1)).slice(-4);
  cbWriteTab_(ss, CB_OVERRIDE, CB_OVERRIDE_HEADERS, all);
}

/* ========================================================================
   STEP 7 - RECONCILIATION AND QA  (read-only)
   Answers, from the written tabs rather than from memory:
     - does every real submission trace to exactly one athlete?
     - does every athlete trace to exactly one household?
     - do the duplicate numbers still reconcile?
     - did MASTER change?
   ======================================================================== */
function cbReconcile() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var model = cbModel_();

  function readTab(name) {
    var sh = cbSheet_(ss, name);
    var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(cbStr_);
    var rows = sh.getLastRow() > 1
      ? sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues() : [];
    return { head: head, rows: rows, col: function (n) { return head.indexOf(n); } };
  }
  var A = readTab(CB_ATHLETES), H = readTab(CB_HOUSE);

  /* --- every submission id appears under exactly one athlete --- */
  var claimed = {}, doubleClaimed = [];
  var cSrc = A.col('Source Submission IDs'), cAid = A.col('Athlete ID'), cHid = A.col('Household ID');
  A.rows.forEach(function (r) {
    cbStr_(r[cSrc]).split(';').forEach(function (s) {
      s = s.trim(); if (!s) return;
      if (claimed[s]) doubleClaimed.push(s); else claimed[s] = cbStr_(r[cAid]);
    });
  });
  var unlinked = [];
  model.subs.forEach(function (s) { if (!claimed[s.subId]) unlinked.push(s.subId); });

  /* --- every athlete points at a household that exists --- */
  var hIds = {}, hcId = H.col('Household ID');
  H.rows.forEach(function (r) { hIds[cbStr_(r[hcId])] = true; });
  var orphanAthletes = 0;
  A.rows.forEach(function (r) { if (!hIds[cbStr_(r[cHid])]) orphanAthletes++; });

  /* --- every household lists athletes that exist --- */
  var aIds = {};
  A.rows.forEach(function (r) { aIds[cbStr_(r[cAid])] = true; });
  var brokenLinks = 0, linkedAthletes = 0;
  var cLinked = H.col('Linked Athlete IDs');
  H.rows.forEach(function (r) {
    cbStr_(r[cLinked]).split(';').forEach(function (s) {
      s = s.trim(); if (!s) return;
      linkedAthletes++;
      if (!aIds[s]) brokenLinks++;
    });
  });

  /* --- duplicate reconciliation --- */
  var cCount = A.col('Registration History Count');
  var dist = {}, totalFromAthletes = 0, multi = 0;
  A.rows.forEach(function (r) {
    var n = parseInt(r[cCount], 10) || 0;
    totalFromAthletes += n;
    dist[n] = (dist[n] || 0) + 1;
    if (n > 1) multi++;
  });

  /* --- review flags as written --- */
  var cAdq = A.col('Data Quality Status'), cHdq = H.col('Data Quality Status');
  var aReview = 0, hReview = 0;
  A.rows.forEach(function (r) { if (cbStr_(r[cAdq]) === 'NEEDS_REVIEW') aReview++; });
  H.rows.forEach(function (r) { if (cbStr_(r[cHdq]) === 'NEEDS_REVIEW') hReview++; });

  var out = {
    liveSubmissions: model.subs.length,
    athleteRows: A.rows.length,
    householdRows: H.rows.length,
    submissionsLinkedToAnAthlete: Object.keys(claimed).length,
    submissionsUnlinked: unlinked.length,
    submissionsClaimedTwice: doubleClaimed.length,
    athletesWithMissingHousehold: orphanAthletes,
    householdAthleteLinks: linkedAthletes,
    householdAthleteLinksBroken: brokenLinks,
    submissionTotalFromAthleteCounts: totalFromAthletes,
    submissionsReconcile: totalFromAthletes === model.subs.length,
    athletesWithMultipleSubmissions: multi,
    excessRows: model.subs.length - A.rows.length,
    distribution: dist,
    athletesNeedingReview: aReview,
    householdsNeedingReview: hReview,
    masterChecksum: cbDataChecksum_(cbSheet_(ss, CB_MASTER)),
    checkedAt: new Date().toISOString()
  };
  Logger.log(JSON.stringify(out, null, 1));
  return out;
}

/* A one-shot snapshot of MASTER used to prove, before and after everything,
   that not one family value moved. */
function cbMasterSnapshot() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var out = {
    master: cbDataChecksum_(cbSheet_(ss, CB_MASTER)),
    clinicRsvp: cbDataChecksum_(cbSheet_(ss, 'CLINIC RSVP')),
    at: new Date().toISOString()
  };
  Logger.log(JSON.stringify(out));
  return out;
}

/* ==========================================================================
   PHASE 2B - ATHLETE ID BACKFILL
   --------------------------------------------------------------------------
   Adds ONE column to MASTER REGISTRATIONS and writes each row's canonical
   Athlete ID into it. Nothing else is touched.

   RULES THIS ENFORCES ON ITSELF
     - keyed on Submission ID, never on a row number. Rows move; ids do not.
     - additive only. The 37 existing columns are checksummed before and
       after and must be byte-identical.
     - refuses to write unless EVERY real submission maps to exactly one
       existing canonical Athlete ID.
     - idempotent. A second run rewrites nothing and reports zero changes.
     - a cell that already holds a DIFFERENT id is a CONFLICT: the run
       refuses rather than overwriting somebody's correction.

   QA and placeholder rows are intentionally left blank - they are not real
   athletes and have no canonical record.
   ========================================================================== */

var CB_ID_COLUMN = 'Athlete ID';

/* Checksum over a FIXED number of columns, so adding a column later does not
   change the digest of the columns that already existed. */
function cbChecksumCols_(sheet, nCols) {
  var last = sheet.getLastRow();
  if (last < 2) return { rows: 0, cols: nCols, digest: 'empty' };
  var vals = sheet.getRange(2, 1, last - 1, nCols).getValues();
  var flat = vals.map(function (r) {
    return r.map(function (c) {
      return (c instanceof Date) ? c.toISOString() : String(c == null ? '' : c);
    }).join('\u0001');
  }).join('\u0002');
  return {
    rows: vals.length, cols: nCols,
    digest: Utilities.base64EncodeWebSafe(
      Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, flat))
  };
}

/* submissionId -> athleteId, read from the ATHLETES tab as it stands. */
function cbIdMap_() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sh = cbSheet_(ss, CB_ATHLETES);
  var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(cbStr_);
  var iId = head.indexOf('Athlete ID'), iSrc = head.indexOf('Source Submission IDs');
  if (iId === -1 || iSrc === -1) throw new Error('ATHLETES tab is missing required columns');
  var rows = sh.getLastRow() > 1
    ? sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues() : [];
  var map = {}, claimedTwice = 0, athletes = 0;
  rows.forEach(function (r) {
    var id = cbStr_(r[iId]); if (!id) return;
    athletes++;
    cbStr_(r[iSrc]).split(';').forEach(function (s) {
      s = s.trim(); if (!s) return;
      if (map[s] !== undefined) claimedTwice++;
      map[s] = id;
    });
  });
  return { map: map, athletes: athletes, claimedTwice: claimedTwice };
}

/**
 * dryRun = true  -> computes and reports, writes NOTHING
 * dryRun = false -> writes, but only if the dry-run checks all pass
 */
function cbBackfill_(dryRun) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var m = cbSheet_(ss, CB_MASTER);

  var idx = cbHeaderIndex_(m);
  var existingIdCol = idx[CB_ID_COLUMN];          /* undefined on a first run */
  var baseCols = (existingIdCol === undefined)
    ? m.getLastColumn()
    : m.getLastColumn() - 1;

  /* The id column must be the LAST column, or "everything before it" is not a
     stable thing to checksum. */
  if (existingIdCol !== undefined && existingIdCol !== m.getLastColumn() - 1) {
    return { ok: false, error: 'Athlete ID column is not the last column; refusing' };
  }

  var before = cbChecksumCols_(m, baseCols);

  var lookup = cbIdMap_();
  var sub = cbReadSubmissions_();          /* re-reads MASTER, applies the same exclusions */
  var realIds = {};
  sub.rows.forEach(function (s) { realIds[s.subId] = true; });

  /* ---- the gate: every real submission must map to exactly one id ---- */
  var unmapped = 0;
  Object.keys(realIds).forEach(function (s) { if (!lookup.map[s]) unmapped++; });
  var mapNotInMaster = 0;
  Object.keys(lookup.map).forEach(function (s) { if (!realIds[s]) mapNotInMaster++; });

  /* ---- what would be written ---- */
  var last = m.getLastRow();
  var rows = last > 1 ? m.getRange(2, 1, last - 1, m.getLastColumn()).getValues() : [];
  var cSub = idx['Submission ID'];
  if (cSub === undefined) return { ok: false, error: 'cannot find Submission ID column' };

  /* A REAL row with no Submission ID cannot be keyed on one. The reader gives
     such a row a synthetic id so it still becomes an athlete, but that id
     exists only in memory - it is not in the cell, so the writer would skip
     the row in silence. Refuse instead. (Live count today: 0.) */
  var realRowsWithoutSubmissionId = 0;
  var QAre = CB_QA;
  for (var q = 0; q < rows.length; q++) {
    var joined = rows[q].join(' ');
    if (!cbStr_(joined)) continue;
    if (QAre.test(joined)) continue;
    if (cbStr_(rows[q][cSub])) continue;
    var qe = cbEmail_(rows[q][idx['Parent Email']]);
    if (qe && cbIsPlaceholder_(qe)) continue;
    realRowsWithoutSubmissionId++;
  }

  var plan = [], toWrite = 0, alreadyCorrect = 0, conflicts = 0;
  var blankQaOrPlaceholder = 0, blankNoSubmissionId = 0;
  for (var i = 0; i < rows.length; i++) {
    var subId = cbStr_(rows[i][cSub]);
    var want = lookup.map[subId] || '';
    var have = (existingIdCol === undefined) ? '' : cbStr_(rows[i][existingIdCol]);
    if (!want) {
      if (subId) blankQaOrPlaceholder++; else blankNoSubmissionId++;
      plan.push(have); if (have) conflicts++; continue;
    }
    if (have === want) { alreadyCorrect++; plan.push(have); continue; }
    if (have && have !== want) { conflicts++; plan.push(have); continue; }
    toWrite++; plan.push(want);
  }

  var gate = {
    athletesInTab: lookup.athletes,
    submissionIdsClaimedTwice: lookup.claimedTwice,
    realSubmissions: Object.keys(realIds).length,
    unmappedRealSubmissions: unmapped,
    mappedIdsNotInMaster: mapNotInMaster,
    realRowsWithoutSubmissionId: realRowsWithoutSubmissionId,
    conflicts: conflicts
  };
  var passed = unmapped === 0 && mapNotInMaster === 0 &&
               lookup.claimedTwice === 0 && conflicts === 0 &&
               realRowsWithoutSubmissionId === 0;

  var out = {
    ok: true, dryRun: !!dryRun, gatePassed: passed, gate: gate,
    baseColumns: baseCols, idColumnExists: existingIdCol !== undefined,
    wouldWrite: toWrite, alreadyCorrect: alreadyCorrect,
    leftBlankQaOrPlaceholder: blankQaOrPlaceholder,
    leftBlankNoSubmissionId: blankNoSubmissionId,
    excluded: sub.skipped,
    checksumBefore: before
  };

  if (dryRun) { Logger.log(JSON.stringify(out)); return out; }
  if (!passed) { out.refused = 'gate did not pass; nothing written'; Logger.log(JSON.stringify(out)); return out; }
  if (toWrite === 0) {
    out.wrote = 0; out.idempotent = true;
    out.checksumAfter = cbChecksumCols_(m, baseCols);
    out.historicalDataUnchanged = before.digest === out.checksumAfter.digest;
    Logger.log(JSON.stringify(out)); return out;
  }

  /* ---- write: header + one column, nothing else ---- */
  var col = (existingIdCol === undefined) ? baseCols + 1 : existingIdCol + 1;
  m.getRange(1, col).setValue(CB_ID_COLUMN).setFontWeight('bold');
  m.getRange(2, col, plan.length, 1).setValues(plan.map(function (v) { return [v]; }));
  SpreadsheetApp.flush();

  out.wrote = toWrite;
  out.checksumAfter = cbChecksumCols_(m, baseCols);
  out.historicalDataUnchanged = before.digest === out.checksumAfter.digest &&
                                before.rows === out.checksumAfter.rows;
  Logger.log(JSON.stringify(out));
  return out;
}
