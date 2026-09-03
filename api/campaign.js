/* ==========================================================================
   TRIUMPH / JUNIOR WOLVES — CAMPAIGN SENDER
   --------------------------------------------------------------------------
   Outbound delivery for approved Junior Wolves parent emails.

     Resend            = outbound delivery engine
     triumphhoopsacademy@gmail.com = Reply-To, where parent replies land
     Google Sheets     = audience / operational data (never touched here)

   This is the SAME Resend account, API key and verified sending domain that
   api/inquiry.js already uses. No new credentials, no new infrastructure.

   Gmail's MailApp is deliberately NOT used: a consumer Gmail account caps at
   100 recipients/day and the Junior Wolves audience is already 97.

   MODES
     preview  returns the resolved sender identity and body checksum. Sends
              nothing. Safe to call at any time.
     test     sends exactly ONE message, to MAIL_TO, through the identical
              code path a live send uses. No secret required precisely because
              it can only ever mail Triumph's own inbox.
     live     requires the shared secret AND an explicit confirmation phrase
              AND the recipient list. Never runs by accident.
   ========================================================================== */

"use strict";

const MAIL_TO = process.env.MAIL_TO || "triumphhoopsacademy@gmail.com";
const MAIL_FROM = process.env.MAIL_FROM || "";
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const RESEND_URL = "https://api.resend.com/emails";

/* Live sends reuse the secret that already exists in this project's
   environment. Nothing new to provision, nothing new to leak. */
const CAMPAIGN_SECRET = process.env.CAMPAIGN_SECRET || process.env.SHEETS_WEBHOOK_SECRET || "";
const LIVE_CONFIRM = "SEND-JW-THANKYOU-2026-09";
const LIVE_MAX_RECIPIENTS = 200;

/* Parent-facing identity. The mailbox must stay on the verified sending
   domain — only the display name changes, and a display name needs no DNS. */
const FROM_DISPLAY = "Niles West Junior Wolves";

function senderAddress() {
  const m = MAIL_FROM.match(/<([^>]+)>/);
  const addr = (m ? m[1] : MAIL_FROM).trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(addr) ? addr : "";
}

function campaignFrom() {
  const addr = senderAddress();
  if (!addr) return null;
  return FROM_DISPLAY + " <" + addr + ">";
}

const EARLY_ACCESS_URL = "https://www.triumphhoopsacademy.com/junior-wolves#register";
const JW_LOGO_URL = "https://www.triumphhoopsacademy.com/assets/img/jr-wolves-email-logo.png";
const SUBJECT = "Thank You for Joining Us | Junior Wolves Town Hall";
const TEST_SUBJECT = "TEST \u2014 Thank You for Joining Us | Junior Wolves Town Hall";

/* Plain-text alternative. Same promises, same funnel language. */
const TEXT_BODY = [
  "THANK YOU FOR SHOWING UP!",
  "",
  "Junior Wolves Families,",
  "",
  "Thank you to everyone who joined us last night - whether you were with us in person or tuned in virtually.",
  "",
  "More than anything, we appreciate you taking the time to learn about what we're building with the Junior Wolves and where we believe this program can go.",
  "",
  "Last night wasn't just about explaining a feeder basketball program. It was about starting to build a basketball community that our kids can grow up in.",
  "",
  "We want our players to have a clear pathway - from their first experiences with the game, through competitive basketball, and ultimately toward Niles West. We want them learning how to play the right way, competing with kids from their own community, and developing relationships that can continue well beyond one season.",
  "",
  "That's what The Wolf Way is about.",
  "",
  "We also know we covered a lot last night.",
  "",
  "If you left with a question we didn't answer, thought of something afterward, or simply want to talk more about where your son may fit, reply directly to this email. We're happy to help and want to keep the conversation going.",
  "",
  "WHAT'S NEXT",
  "",
  "Official tryout registration goes live Tuesday, September 8.",
  "",
  "If you haven't already, you can join the Junior Wolves Early Access List now to stay connected as we get closer to tryouts:",
  EARLY_ACCESS_URL,
  "",
  "Already joined the list? You're all set for now. Keep an eye out for official tryout registration beginning September 8.",
  "",
  "And if you know another Niles West family with a boy in grades 3rd-8th who may be interested, please share the Junior Wolves page with them.",
  "",
  "FALL OPEN SKILLS CLINICS",
  "September 27th, 3:00-5:00 PM",
  "October 11th, 12:00-2:00 PM",
  "October 25th, 3:00-5:00 PM",
  "Niles West High School. Boys, Grades 3rd-8th.",
  "",
  "We're excited about where this can go, but programs like this are built over time - through players, coaches, families, and a community that believes in what we're trying to create.",
  "",
  "Thank you for being part of the beginning.",
  "",
  "The Wolf Way Starts Here.",
  "",
  "Oli & Marlowe",
  "Junior Wolves Basketball",
  "Powered by Triumph Hoops Academy",
  "",
  "Earn your place in the pack.",
  "triumphhoopsacademy@gmail.com",
  "https://triumphhoopsacademy.com/junior-wolves"
].join("\n");

/* --------------------------------------------------------------------------
   Approved Junior Wolves Email System v1.0 body. Byte-for-byte the template
   that was tested and approved on 2026-09-03. Do not restyle it here.
   -------------------------------------------------------------------------- */
const THANKYOU_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>Thank You for Joining Us — Junior Wolves Town Hall</title>
<style>
  /* JUNIOR WOLVES EMAIL SYSTEM v1.0 — unchanged from the Town Hall series. */
  body { margin:0 !important; padding:0 !important; width:100% !important; }
  table { border-collapse:collapse !important; }
  img { border:0; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; }
  a { text-decoration:none; }
  .jw-display { font-family: 'Arial Black','Arial Bold',Arial,Helvetica,sans-serif; }
  @media screen and (max-width:620px) {
    .jw-wrap { width:100% !important; }
    .jw-pad { padding-left:22px !important; padding-right:22px !important; }
    .jw-h1 { font-size:30px !important; line-height:34px !important; }
    .jw-btn a { display:block !important; width:auto !important; }
    .jw-stack { display:block !important; width:100% !important; }
    .jw-gap { height:12px !important; line-height:12px !important; font-size:12px !important; }
  }
  @media (prefers-color-scheme: light) {
    .jw-shell { background:#0b0b0c !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#000000;">

<div style="display:none;font-size:1px;color:#000000;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
  Thank you for showing up, asking questions, and helping us build the next chapter of Junior Wolves basketball.
  &#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#000000" style="background:#000000;">
<tr><td align="center" style="padding:24px 12px;">

  <table role="presentation" class="jw-wrap jw-shell" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#0b0b0c" style="width:600px;max-width:600px;background:#0b0b0c;">

    <!-- ============ HEADER ============ -->
    <tr><td class="jw-pad" align="left" bgcolor="#0b0b0c" style="padding:28px 36px 0 36px;background:#0b0b0c;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr><td align="left" style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:16px;letter-spacing:2px;color:#ffffff;font-weight:bold;text-transform:uppercase;">
          Niles West Junior Wolves
        </td></tr>
        <tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:10px;line-height:14px;letter-spacing:1.6px;color:#a1a1aa;text-transform:uppercase;padding-top:5px;">
          Powered by Triumph Hoops Academy
        </td></tr>
      </table>
    </td></tr>

    <!-- red rule -->
    <tr><td class="jw-pad" style="padding:18px 36px 0 36px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td height="3" bgcolor="#c8102e" width="56" style="height:3px;line-height:3px;font-size:3px;background:#c8102e;width:56px;">&nbsp;</td>
        <td height="3" bgcolor="#2a2a2f" style="height:3px;line-height:3px;font-size:3px;background:#2a2a2f;">&nbsp;</td>
      </tr></table>
    </td></tr>

    <!-- ============ HEADLINE ============ -->
    <tr><td class="jw-pad" align="left" style="padding:26px 36px 0 36px;">
      <div class="jw-display jw-h1" style="font-family:'Arial Black','Arial Bold',Arial,Helvetica,sans-serif;font-size:34px;line-height:38px;color:#ffffff;text-transform:uppercase;letter-spacing:-0.3px;">
        Thank you for<br>showing up!
      </div>
    </td></tr>

    <!-- ============ BODY ============ -->
    <tr><td class="jw-pad" align="left" style="padding:22px 36px 0 36px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:23px;color:#e4e4e7;">
      <p style="margin:0 0 16px 0;">Junior Wolves Families,</p>
      <p style="margin:0 0 16px 0;">Thank you to everyone who joined us last night &mdash; whether you were with us in person or tuned in virtually.</p>
      <p style="margin:0 0 16px 0;">More than anything, we appreciate you taking the time to learn about what we&rsquo;re building with the Junior Wolves and where we believe this program can go.</p>
      <p style="margin:0 0 16px 0;">Last night wasn&rsquo;t just about explaining a feeder basketball program. It was about starting to build a basketball community that our kids can grow up in.</p>
      <p style="margin:0 0 16px 0;">We want our players to have a clear pathway &mdash; from their first experiences with the game, through competitive basketball, and ultimately toward Niles West. We want them learning how to play the right way, competing with kids from their own community, and developing relationships that can continue well beyond one season.</p>
      <p style="margin:0 0 16px 0;">That&rsquo;s what The Wolf Way is about.</p>
      <p style="margin:0 0 16px 0;">We also know we covered a lot last night.</p>
      <p style="margin:0;">If you left with a question we didn&rsquo;t answer, thought of something afterward, or simply want to talk more about where your son may fit, reply directly to this email. We&rsquo;re happy to help and want to keep the conversation going.</p>
    </td></tr>

    <!-- ============ WHAT'S NEXT ============ -->
    <tr><td class="jw-pad" style="padding:28px 36px 0 36px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td height="1" bgcolor="#2a2a2f" style="height:1px;line-height:1px;font-size:1px;background:#2a2a2f;">&nbsp;</td>
      </tr></table>
    </td></tr>

    <tr><td class="jw-pad" align="left" style="padding:24px 36px 0 36px;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:14px;letter-spacing:2.4px;color:#ff3b52;font-weight:bold;text-transform:uppercase;">
      What&rsquo;s Next
    </td></tr>

    <tr><td class="jw-pad" align="left" style="padding:12px 36px 0 36px;">
      <div class="jw-display" style="font-family:'Arial Black','Arial Bold',Arial,Helvetica,sans-serif;font-size:20px;line-height:26px;color:#ffffff;text-transform:uppercase;">
        Official tryout registration<br>goes live Tuesday, September 8.
      </div>
    </td></tr>

    <tr><td class="jw-pad" align="left" style="padding:14px 36px 18px 36px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:23px;color:#e4e4e7;">
      If you haven&rsquo;t already, you can join the Junior Wolves Early Access List now to stay connected as we get closer to tryouts.
    </td></tr>

    <!-- primary CTA -->
    <tr><td class="jw-pad" style="padding:0 36px 0 36px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="jw-btn">
        <tr><td align="center" bgcolor="#c8102e" style="background:#c8102e;border:2px solid #c8102e;">
          <a href="EARLY_ACCESS_HREF" target="_blank" style="display:block;padding:16px 18px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:18px;font-weight:bold;letter-spacing:1.4px;text-transform:uppercase;color:#ffffff;text-decoration:none;">Join the Early Access List</a>
        </td></tr>
      </table>
    </td></tr>

    <tr><td class="jw-pad" align="left" style="padding:16px 36px 0 36px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#a1a1aa;">
      Already joined the list? You&rsquo;re all set for now. Keep an eye out for official tryout registration beginning September 8.
    </td></tr>

    <tr><td class="jw-pad" align="left" style="padding:16px 36px 0 36px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:23px;color:#e4e4e7;">
      And if you know another Niles West family with a boy in grades 3rd&ndash;8th who may be interested, please share the Junior Wolves page with them. We want to continue reaching families throughout the community and give future Wolves an opportunity to be part of what we&rsquo;re building.
    </td></tr>

    <!-- ============ CLINICS ============ -->
    <tr><td class="jw-pad" style="padding:26px 36px 0 36px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#17171a" style="background:#17171a;">
        <tr><td style="padding:20px 22px;border-left:3px solid #c8102e;">
          <div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;line-height:14px;letter-spacing:2px;color:#a1a1aa;text-transform:uppercase;font-weight:bold;">This Fall</div>
          <div class="jw-display" style="font-family:'Arial Black','Arial Bold',Arial,Helvetica,sans-serif;font-size:20px;line-height:24px;color:#ffffff;text-transform:uppercase;padding-top:8px;">Fall Open Skills Clinics</div>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="padding-top:14px;">
            <tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:26px;color:#ffffff;font-weight:bold;">September 27th</td><td style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:26px;color:#a1a1aa;padding-left:12px;">3:00&ndash;5:00 PM</td></tr>
            <tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:26px;color:#ffffff;font-weight:bold;">October 11th</td><td style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:26px;color:#a1a1aa;padding-left:12px;">12:00&ndash;2:00 PM</td></tr>
            <tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:26px;color:#ffffff;font-weight:bold;">October 25th</td><td style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:26px;color:#a1a1aa;padding-left:12px;">3:00&ndash;5:00 PM</td></tr>
          </table>
          <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;color:#e4e4e7;padding-top:12px;">
            Niles West High School<br>Boys &middot; Grades 3rd&ndash;8th
          </div>
        </td></tr>
      </table>
    </td></tr>

    <!-- ============ CLOSE ============ -->
    <tr><td class="jw-pad" align="left" style="padding:26px 36px 0 36px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:23px;color:#e4e4e7;">
      <p style="margin:0 0 16px 0;">We&rsquo;re excited about where this can go, but programs like this are built over time &mdash; through players, coaches, families, and a community that believes in what we&rsquo;re trying to create.</p>
      <p style="margin:0;">Thank you for being part of the beginning.</p>
    </td></tr>

    <!-- ============ SIGNATURE ============ -->
    <tr><td class="jw-pad" style="padding:30px 36px 0 36px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td height="1" bgcolor="#2a2a2f" style="height:1px;line-height:1px;font-size:1px;background:#2a2a2f;">&nbsp;</td>
      </tr></table>
    </td></tr>

    <tr><td class="jw-pad" align="left" style="padding:24px 36px 0 36px;">
      <div class="jw-display" style="font-family:'Arial Black','Arial Bold',Arial,Helvetica,sans-serif;font-size:18px;line-height:24px;color:#ffffff;text-transform:uppercase;letter-spacing:0.3px;">
        The Wolf Way Starts Here.
      </div>
    </td></tr>

    <tr><td class="jw-pad" align="left" style="padding:18px 36px 0 36px;">
      <img src="JW_LOGO_SRC" width="200" height="139" alt="Niles West Junior Wolves Basketball" style="display:block;width:200px;max-width:200px;height:auto;border:0;outline:none;text-decoration:none;">
    </td></tr>

    <tr><td class="jw-pad" align="left" style="padding:18px 36px 0 36px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:23px;color:#ffffff;">
      <div style="font-weight:bold;">Oli &amp; Marlowe</div>
      <div style="color:#a1a1aa;font-size:14px;line-height:21px;padding-top:2px;">Junior Wolves Basketball<br>Powered by Triumph Hoops Academy</div>
    </td></tr>

    <!-- ============ FOOTER ============ -->
    <tr><td class="jw-pad" style="padding:30px 36px 0 36px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td height="1" bgcolor="#2a2a2f" style="height:1px;line-height:1px;font-size:1px;background:#2a2a2f;">&nbsp;</td>
      </tr></table>
    </td></tr>

    <tr><td class="jw-pad" align="left" style="padding:22px 36px 34px 36px;">
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:16px;letter-spacing:2px;color:#ff3b52;font-weight:bold;text-transform:uppercase;">
        Earn your place in the pack.
      </div>
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:20px;color:#a1a1aa;padding-top:16px;">
        Niles West Junior Wolves &middot; Powered by Triumph Hoops Academy<br>
        <a href="mailto:triumphhoopsacademy@gmail.com" style="color:#a1a1aa;text-decoration:underline;">triumphhoopsacademy@gmail.com</a><br>
        <a href="https://triumphhoopsacademy.com/junior-wolves" style="color:#a1a1aa;text-decoration:underline;">triumphhoopsacademy.com/junior-wolves</a>
      </div>
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:17px;color:#67676f;padding-top:16px;">
        You&rsquo;re receiving this because you registered interest in Junior Wolves or previously shared your email with the Niles West feeder program. Reply to this email if you&rsquo;d rather not receive Junior Wolves updates.
      </div>
    </td></tr>

  </table>

</td></tr>
</table>
</body>
</html>`;

function renderHtml() {
  const html = THANKYOU_HTML
    .replace(/EARLY_ACCESS_HREF/g, EARLY_ACCESS_URL)
    .replace(/JW_LOGO_SRC/g, JW_LOGO_URL);
  /* The /dev incident: a link only script editors could open shipped to all
     75 Town Hall recipients. Never again, and never silently. */
  if (html.indexOf("/dev") !== -1) throw new Error("refusing to send: /dev URL in body");
  if (html.indexOf("EARLY_ACCESS_HREF") !== -1) throw new Error("CTA placeholder not replaced");
  if (html.indexOf("JW_LOGO_SRC") !== -1) throw new Error("logo placeholder not replaced");
  /* The live form is the Early Access List, never tryout registration. */
  if (/register for tryouts/i.test(html)) throw new Error("CTA must not say register for tryouts");
  return html;
}

function checksum(s) {
  let a = 1, b = 0;
  for (let i = 0; i < s.length; i++) { a = (a + s.charCodeAt(i)) % 65521; b = (b + a) % 65521; }
  return a + "-" + b + "-" + s.length;
}

function normEmail(v) { return String(v == null ? "" : v).trim().toLowerCase(); }
function validEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e); }

/* One Resend call per recipient. No cc, no bcc, ever: a family must never see
   another family's address, and Reply-All must be impossible. */
async function sendOne(to, subject, html) {
  const from = campaignFrom();
  const response = await fetch(RESEND_URL, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + RESEND_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: [to],
      reply_to: MAIL_TO,
      subject,
      text: TEXT_BODY,
      html
    })
  });
  const raw = await response.text().catch(() => "");
  if (!response.ok) {
    return { to, ok: false, status: response.status, detail: raw.slice(0, 300) };
  }
  let data = {};
  try { data = JSON.parse(raw); } catch (e) { /* id is a nicety, not required */ }
  return { to, ok: true, id: data.id || null };
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(raw || "{}");
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  }

  let body;
  try { body = await readBody(req); }
  catch (err) { return res.status(400).json({ ok: false, error: "Could not read request." }); }

  const mode = String(body.mode || "preview");
  const from = campaignFrom();

  if (!RESEND_API_KEY) return res.status(500).json({ ok: false, error: "RESEND_API_KEY is not set." });
  if (!from) return res.status(500).json({ ok: false, error: "MAIL_FROM is not a usable verified sender." });

  let html;
  try { html = renderHtml(); }
  catch (err) { return res.status(500).json({ ok: false, error: err.message }); }

  const identity = {
    from,
    reply_to: MAIL_TO,
    subject: SUBJECT,
    testSubject: TEST_SUBJECT,
    cta: EARLY_ACCESS_URL,
    logo: JW_LOGO_URL,
    htmlChecksum: checksum(html),
    engine: "resend"
  };

  if (mode === "preview") {
    return res.status(200).json({ ok: true, mode, identity, sent: 0 });
  }

  if (mode === "test") {
    /* Hard-wired to Triumph's own inbox. This branch cannot reach a family. */
    const result = await sendOne(MAIL_TO, TEST_SUBJECT, html);
    console.log("[campaign] TEST send", JSON.stringify(result));
    return res.status(result.ok ? 200 : 502).json({ ok: result.ok, mode, identity, result });
  }

  if (mode === "live") {
    if (!CAMPAIGN_SECRET || body.secret !== CAMPAIGN_SECRET) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    if (body.confirm !== LIVE_CONFIRM) {
      return res.status(400).json({ ok: false, error: "missing confirmation phrase" });
    }
    const list = Array.isArray(body.recipients) ? body.recipients : [];
    const seen = Object.create(null);
    const recipients = [];
    let skippedInvalid = 0, skippedDuplicate = 0;
    for (const entry of list) {
      const e = normEmail(entry);
      if (!validEmail(e)) { skippedInvalid++; continue; }
      if (seen[e]) { skippedDuplicate++; continue; }
      seen[e] = true;
      recipients.push(e);
    }
    if (!recipients.length) return res.status(400).json({ ok: false, error: "no valid recipients" });
    if (recipients.length > LIVE_MAX_RECIPIENTS) {
      return res.status(400).json({ ok: false, error: "recipient list exceeds the cap" });
    }

    const results = [];
    for (const to of recipients) {
      /* Sequential on purpose: a partial failure stays diagnosable, and the
         send never becomes a burst we cannot account for. */
      results.push(await sendOne(to, SUBJECT, html));
    }
    const delivered = results.filter((r) => r.ok).length;
    console.log("[campaign] LIVE send", delivered + "/" + results.length,
                "| skipped invalid:", skippedInvalid, "| skipped duplicate:", skippedDuplicate);
    return res.status(200).json({
      ok: true, mode, identity,
      requested: recipients.length, delivered,
      failed: results.filter((r) => !r.ok),
      skippedInvalid, skippedDuplicate
    });
  }

  return res.status(400).json({ ok: false, error: "unknown mode" });
};
