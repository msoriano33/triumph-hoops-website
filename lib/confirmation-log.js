/* ==========================================================================
   CONFIRMATION LOG CLIENT
   --------------------------------------------------------------------------
   Writes one row to the CONFIRMATION LOG tab for every confirmation attempt,
   so "did this family get a confirmation?" is answerable from the workbook
   instead of from git history. The Wednesday audit could not answer it.

   THREE RULES THIS FILE OBEYS

   1. IT NEVER AFFECTS THE FAMILY.
      Registration capture is the primary transaction. Logging is secondary
      and must fail safely: every call is wrapped, given a short timeout, and
      can only ever return a boolean. A logging outage must not turn into a
      failed registration or a missing confirmation.

   2. IT NEVER CLAIMS DELIVERY.
      Resend returning 200 means Resend queued the message. The only outcome
      this file can produce for a successful send is ACCEPTED. There is no
      code path here that can write DELIVERED, and the Apps Script side
      rejects the word outright.

   3. IT STORES EVIDENCE, NOT CONTENT.
      A recipient address, an outcome, a provider id, a status and a reason
      code. No message bodies, no credentials, no personal detail beyond the
      address the confirmation was sent to.
   ========================================================================== */

const SHEETS_WEBHOOK_URL = process.env.SHEETS_WEBHOOK_URL || "";
const SHEETS_WEBHOOK_SECRET = process.env.SHEETS_WEBHOOK_SECRET || "";

/* Deliberately short. This call sits INSIDE the request the family is
   waiting on, on a path that already spends up to 6.5s writing the sheet.
   Every millisecond here is borrowed from someone staring at a spinner.

   A lost log row is recoverable - confirmationGap() finds it and says so.
   A registration the family abandoned because the page hung is not. So the
   log gets two seconds and then gives up, on purpose. */
const LOG_TIMEOUT_MS = 2000;

/* The deterministic key that makes exactly-once possible. Both the live API
   and any later recovery pass derive the SAME key from the record id, so the
   provider collapses a genuine race into one message. Anything that sends a
   confirmation must use this function - never an ad-hoc string. */
function idempotencyKey(recordType, recordId) {
  return "jw-confirm-" + String(recordType || "unknown") + "-" + String(recordId || "");
}

/* Map a send() result onto the fixed outcome vocabulary. Note the absence of
   any DELIVERED branch: this is where that guarantee actually lives. */
function outcomeFor(result) {
  if (!result) return { outcome: "FAILED", failureReason: "no-result" };
  if (result.sent) return { outcome: "ACCEPTED", failureReason: "" };
  const reason = String(result.reason || "unknown");
  if (/^recipient-(empty|no-address)/.test(reason)) {
    return { outcome: "SKIPPED_NO_ADDRESS", failureReason: reason };
  }
  if (/^recipient-(malformed|placeholder)/.test(reason)) {
    return { outcome: "SKIPPED_INVALID_ADDRESS", failureReason: reason };
  }
  if (/duplicate/.test(reason)) {
    return { outcome: "SKIPPED_DUPLICATE", failureReason: reason };
  }
  return { outcome: "FAILED", failureReason: reason };
}

/**
 * Append one confirmation-attempt row. Returns { logged, reason } and never
 * throws, whatever happens.
 */
async function record(entry) {
  if (!SHEETS_WEBHOOK_URL || !SHEETS_WEBHOOK_SECRET) {
    return { logged: false, reason: "not_configured" };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOG_TIMEOUT_MS);
  try {
    const key = entry.idempotencyKey ||
      idempotencyKey(entry.recordType, entry.recordId);
    const response = await fetch(SHEETS_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        kind: "confirmation_log",
        secret: SHEETS_WEBHOOK_SECRET,
        recordType: entry.recordType,
        recordId: entry.recordId,
        athleteId: entry.athleteId || "",
        recipient: entry.recipient || "",
        confirmationType: entry.confirmationType,
        outcome: entry.outcome,
        providerMessageId: entry.providerMessageId || "",
        providerStatus: entry.providerStatus == null ? "" : String(entry.providerStatus),
        failureReason: entry.failureReason || "",
        attempt: entry.attempt || 1,
        sentBy: entry.sentBy || "api",
        attemptedAt: entry.attemptedAt || new Date().toISOString(),
        notes: "idem=" + key
      })
    });
    const raw = await response.text();
    let parsed = null;
    try { parsed = JSON.parse(raw); } catch (e) { /* non-JSON: treat as failure */ }
    return { logged: !!(parsed && parsed.ok), reason: (parsed && parsed.error) || String(response.status) };
  } catch (err) {
    return { logged: false, reason: (err && err.name) || "network" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The one call sites should use: turn a send() result into a logged row.
 * Swallows everything.
 */
async function recordSend(meta, sendResult) {
  try {
    const mapped = outcomeFor(sendResult);
    return await record({
      recordType: meta.recordType,
      recordId: meta.recordId,
      athleteId: meta.athleteId,
      recipient: meta.recipient,
      confirmationType: meta.confirmationType,
      outcome: mapped.outcome,
      failureReason: mapped.failureReason,
      providerMessageId: (sendResult && sendResult.id) || "",
      providerStatus: (sendResult && sendResult.status) || (sendResult && sendResult.sent ? 200 : ""),
      attempt: meta.attempt || 1,
      sentBy: meta.sentBy || "api",
      idempotencyKey: idempotencyKey(meta.recordType, meta.recordId)
    });
  } catch (err) {
    return { logged: false, reason: "threw" };
  }
}

/** Record a decision NOT to send - just as important as recording a send. */
async function recordSkip(meta, outcome, failureReason) {
  try {
    return await record({
      recordType: meta.recordType, recordId: meta.recordId,
      athleteId: meta.athleteId, recipient: meta.recipient || "",
      confirmationType: meta.confirmationType,
      outcome: outcome, failureReason: failureReason || "",
      attempt: meta.attempt || 1, sentBy: meta.sentBy || "api"
    });
  } catch (err) {
    return { logged: false, reason: "threw" };
  }
}

module.exports = { record, recordSend, recordSkip, outcomeFor, idempotencyKey };
