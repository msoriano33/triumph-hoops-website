/* ==========================================================================
   JUNIOR WOLVES — CLINIC FEEDBACK  (added 2026-09-29)
   --------------------------------------------------------------------------
   Writes to its own tab, "CLINIC FEEDBACK", and touches nothing else. It
   never reads or writes MASTER REGISTRATIONS or CLINIC RSVP, so a feedback
   problem can never affect a registration or an RSVP.

   WHAT IT DELIBERATELY DOES NOT COLLECT
     No athlete name. No grade. No school. No parent name. The only identifier
     stored is an email address, and only when the parent chose to give one so
     we can reply. Feedback we cannot tie back to a child is feedback parents
     can give honestly.

   IDEMPOTENCY
     Keyed on feedbackId, the same way the RSVP writer is keyed on rsvpId, so
     a retry after a slow response can never double-count a rating.
   ========================================================================== */
var FEEDBACK_SHEET = 'CLINIC FEEDBACK';
var FEEDBACK_HEADERS = ['Timestamp', 'Feedback ID', 'Clinic', 'Session',
                        'Overall (1-5)', 'Instruction Level', 'Recommend (1-5)',
                        'What Worked', 'What To Change', 'Reply Email', 'Source'];

function feedbackSheet_() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(FEEDBACK_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(FEEDBACK_SHEET);
    sheet.getRange(1, 1, 1, FEEDBACK_HEADERS.length).setValues([FEEDBACK_HEADERS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function fbClean_(v, max) {
  return String(v == null ? '' : v).replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ')
    .trim().slice(0, max || 200);
}
function fbLong_(v, max) {
  return String(v == null ? '' : v).replace(/\s+$/g, '').slice(0, max || 1200);
}
function fbScore_(v) {
  var n = parseInt(v, 10);
  return (n >= 1 && n <= 5) ? n : '';
}

function clinicFeedback_(body) {
  var id = fbClean_(body.feedbackId, 24);
  if (!/^CF-2026-[0-9A-F]{8}$/.test(id)) return { ok: false, error: 'bad feedback id' };

  var sheet = feedbackSheet_();
  var last = sheet.getLastRow();

  /* Already recorded? Say so rather than writing a second row. */
  if (last > 1) {
    var ids = sheet.getRange(2, 2, last - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0]).trim() === id) return { ok: true, duplicate: true, row: i + 2 };
    }
  }

  var overall = fbScore_(body.overall);
  var recommend = fbScore_(body.recommend);
  if (overall === '') return { ok: false, error: 'overall rating is required' };
  if (recommend === '') return { ok: false, error: 'recommendation rating is required' };

  sheet.appendRow([
    new Date(),
    id,
    fbClean_(body.clinicId, 12),
    fbClean_(body.session, 24),
    overall,
    fbClean_(body.level, 24),
    recommend,
    fbLong_(body.worked, 1200),
    fbLong_(body.change, 1200),
    fbClean_(body.replyEmail, 200).toLowerCase(),
    fbClean_(body.source, 32) || 'web'
  ]);
  return { ok: true, row: sheet.getLastRow() };
}

/* Deliberately coarse. Counts and averages only - no row-level export, no
   names (there are none to export), nothing that needs a dashboard. */
function clinicFeedbackSummary_(body) {
  var want = fbClean_(body.clinicId, 12);
  var sheet = feedbackSheet_();
  var last = sheet.getLastRow();
  if (last < 2) return { ok: true, count: 0 };

  var rows = sheet.getRange(2, 1, last - 1, FEEDBACK_HEADERS.length).getValues();
  var n = 0, sumOverall = 0, sumRec = 0, promoters = 0, detractors = 0;
  var level = { 'Too easy': 0, 'About right': 0, 'Too advanced': 0 };
  var session = {};

  for (var i = 0; i < rows.length; i++) {
    if (want && String(rows[i][2]).trim() !== want) continue;
    var o = parseInt(rows[i][4], 10), r = parseInt(rows[i][6], 10);
    if (!(o >= 1 && o <= 5)) continue;
    n++;
    sumOverall += o;
    if (r >= 1 && r <= 5) { sumRec += r; if (r >= 4) promoters++; if (r <= 2) detractors++; }
    var lv = String(rows[i][5]).trim();
    if (level.hasOwnProperty(lv)) level[lv]++;
    var se = String(rows[i][3]).trim() || 'unspecified';
    session[se] = (session[se] || 0) + 1;
  }
  if (!n) return { ok: true, count: 0 };
  return {
    ok: true,
    clinicId: want,
    count: n,
    avgOverall: Math.round((sumOverall / n) * 100) / 100,
    avgRecommend: Math.round((sumRec / n) * 100) / 100,
    wouldRecommend: promoters,
    wouldNot: detractors,
    level: level,
    session: session
  };
}
