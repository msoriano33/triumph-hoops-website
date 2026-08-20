# Setup — deploy, domain, and form email

Three things have to happen before launch: put the files on a host, point
`triumphhoopsacademy.com` at that host, and connect the form endpoint to an email service.

> **Form email is not active yet.** The endpoint is built and wired up, but it needs the
> credentials in Step 3. Until then, every submission shows the family an honest failure
> message with a working email link — never a fake "thanks, we got it."

---

## Step 1 — Deploy the files

Any static host works. The site is plain files, so there is nothing to compile.

### Option A — Vercel (recommended; the serverless function works with no changes)

1. Push this folder to a GitHub repository.
2. At vercel.com, **Add New → Project**, import the repository.
3. Framework preset: **Other**. Build command: leave empty. Output directory: leave empty.
4. Deploy.

`vercel.json` is already configured for clean URLs (`/training`, not `/training.html`) and
basic security headers. `api/inquiry.js` is automatically served at `/api/inquiry`.

### Option B — Netlify

1. Push to GitHub, then **Add new site → Import an existing project**.
2. Build command: leave empty. Publish directory: `.`
3. Create the file `netlify/functions/inquiry.js` containing:

```js
const handler = require("../../api/inquiry.js");

exports.handler = async (event) => {
  const req = {
    method: event.httpMethod,
    headers: event.headers,
    body: event.body ? JSON.parse(event.body) : {}
  };
  let statusCode = 200;
  let payload = {};
  const res = {
    status(code) { statusCode = code; return res; },
    json(data) { payload = data; return res; },
    setHeader() {},
    writeHead(code, headers) { statusCode = code; payload = headers; },
    end() {}
  };
  await handler(req, res);
  return { statusCode, body: JSON.stringify(payload) };
};
```

`netlify.toml` already redirects `/api/inquiry` to that function.

### Option C — Any other host (GoDaddy, Bluehost, cPanel, S3…)

Upload the files as-is. **Important:** most basic hosts cannot run `api/inquiry.js`. If
yours can't, use a form service instead — see "If you can't run a serverless function" below.

---

## Step 2 — Point the domain at the host

You already own `triumphhoopsacademy.com`. Do not buy anything new. In whatever account
holds the domain (the registrar), open the DNS settings and add the records your host gives
you. They will look like this:

**Vercel**

| Type  | Name  | Value                  |
|-------|-------|------------------------|
| A     | `@`   | `76.76.21.21`          |
| CNAME | `www` | `cname.vercel-dns.com` |

**Netlify**

| Type  | Name  | Value                              |
|-------|-------|------------------------------------|
| A     | `@`   | (the IP shown in Netlify's panel)  |
| CNAME | `www` | `your-site-name.netlify.app`       |

Always copy the exact values from your host's domain panel — they occasionally change, and
the panel is the source of truth. Then:

1. In the host's dashboard, add `triumphhoopsacademy.com` as a custom domain.
2. Set `www.triumphhoopsacademy.com` to redirect to the root domain (both hosts do this in
   one click), so there's only one canonical address.
3. Wait for DNS to propagate — usually minutes, occasionally a few hours.
4. Confirm HTTPS is on. Both hosts issue a free certificate automatically.

If the domain currently points at an existing site, changing these records replaces it.
Save a copy of the old DNS records first.

---

## Step 3 — Turn on form email

Submissions go to **triumphhoopsacademy@gmail.com**. The endpoint sends through a
transactional email provider, which is far more reliable than sending from Gmail directly
and keeps everything out of spam folders.

### 3a. Create a sending account

1. Sign up at **resend.com** (free tier covers a program this size).
2. Add and verify `triumphhoopsacademy.com` as a sending domain. Resend gives you two or
   three DNS records (SPF/DKIM) to add at your registrar, same place as Step 2.
3. Create an API key.

### 3b. Add the environment variables

In your host's dashboard (Vercel: *Settings → Environment Variables*; Netlify:
*Site configuration → Environment variables*), add:

| Name             | Value                                                        |
|------------------|--------------------------------------------------------------|
| `RESEND_API_KEY` | the API key from Resend                                      |
| `MAIL_FROM`      | `Triumph Website <noreply@triumphhoopsacademy.com>`          |
| `MAIL_TO`        | `triumphhoopsacademy@gmail.com`                              |

Then **redeploy** so the function picks them up.

**Never put these values in any file in this project.** They belong only in the host's
environment settings. Anything in `assets/` is downloaded by every visitor's browser.

### 3c. Test before you announce the site

Submit each form once and confirm the email arrives:

- [ ] Home → Get started
- [ ] Training → Training inquiry
- [ ] Teams → Team interest (try each option in the dropdown)
- [ ] Teams → Coach with Triumph
- [ ] Junior Wolves → Tryout registration

Each email should have a scannable subject line, e.g.
`NEW JUNIOR WOLVES TRYOUT REGISTRATION — 6TH GRADE — [PLAYER NAME]`, and a body you can read
on a phone. Hitting **Reply** replies straight to the parent.

Then set up Gmail filters so the inbox stays organized — for example, a label called
`Junior Wolves` for subjects containing `JUNIOR WOLVES`, and `Training` for subjects
containing `TRAINING INQUIRY`.

### Troubleshooting — "the form would not submit"

**This exact failure happened in production on 20 August 2026** and cost a real
registration. Symptom: the family fills in the form, presses submit, and gets an error
telling them to email instead. The endpoint returns HTTP 502.

Cause: `RESEND_API_KEY` and `MAIL_FROM` were both set correctly, the serverless function
was deployed and running — but Resend refused every message with:

```
403 — The triumphhoopsacademy.com domain is not verified.
      Please, add and verify your domain on https://resend.com/domains
```

Resend needs **three** DNS records before it will send from a domain. Two of the three were
present at the registrar; the **MX record on the `send` subdomain was missing**, so the
domain never finished verifying:

| Type | Host (name)         | Value                                          | Priority | Status         |
|------|---------------------|------------------------------------------------|----------|----------------|
| TXT  | `resend._domainkey` | `p=MIGfMA0GCS…` (DKIM key)                     | —        | present        |
| TXT  | `send`              | `v=spf1 include:amazonses.com ~all`            | —        | present        |
| MX   | `send`              | `feedback-smtp.<region>.amazonses.com`         | `10`     | **MISSING**    |

Fix:

1. Open <https://resend.com/domains> → `triumphhoopsacademy.com`.
2. Copy the **MX** row exactly as shown there — the region in the hostname
   (`us-east-1`, `eu-west-1`, …) must match your account, so do not type it from memory.
3. Add it at the registrar (DNS is on Namecheap: `dns1/dns2.registrar-servers.com`).
   Host `send`, type `MX`, priority `10`.
   This does **not** affect the existing root-domain MX records that handle
   `@triumphhoopsacademy.com` email forwarding — it is a separate subdomain.
4. Back in Resend, press **Verify DNS Records** and wait for the status to turn *Verified*.
5. Re-submit a form on the live site to confirm.

**Diagnosing it again in future.** From any browser console on the live site:

```js
await fetch('/api/inquiry', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    source: 'general_contact', parent_name: 'TEST',
    parent_email: 'test@example.com', page: 'diagnostic'
  })
}).then(r => r.status);
```

`200` = delivering. `502` = the provider rejected it — open the function logs in
Vercel (*Project → Logs*, filter `[inquiry]`) for the exact provider message. The browser
deliberately never shows that message; only the server log does.

**Fallback sender.** If the sending domain ever stops verifying again, `api/inquiry.js`
now retries once from Resend's shared `onboarding@resend.dev` sender so the family's
submission still reaches the inbox. That sender only delivers to the address the Resend
account was created with, so it is a safety net — not a substitute for a verified domain.
When it is used, the function logs `delivered via FALLBACK sender`.

### If you can't run a serverless function

Use **Netlify Forms** or **Formspree** instead:

1. Get the endpoint URL from that service.
2. Open `assets/js/site-data.js` and change `forms.endpoint` to that URL.
3. Also update the `action="/api/inquiry"` attribute on each `<form>` (five forms total).
4. Point the service's notification email at `triumphhoopsacademy@gmail.com` and re-run the
   test checklist above.

The forms will keep working exactly the same way — only the destination changes.

---

## Ongoing

- **Google Search Console**: add the property, submit `sitemap.xml`. Search visibility comes
  from this, not from anything on the page.
- **Google Business Profile**: worth creating, but don't publish a street address — Triumph
  operates across partner facilities and shouldn't list one gym as a headquarters.
- **Analytics**: if you want it, add a single script tag before `</body>` on each page.

---

## IMPORTANT — after you edit CSS or JS

Asset URLs in the HTML carry a version stamp, e.g.

```html
<link rel="stylesheet" href="assets/css/styles.css?v=20260820c">
<script src="assets/js/main.js?v=20260820c"></script>
```

**Whenever you change `styles.css` or any file in `assets/js/`, bump that stamp**
(any new value — the date works well) in every `.html` file. Find and replace
`?v=20260820c` with the new value.

Why this matters: on 2026-08-20 the Fall campaign shipped but the CDN kept
serving a 3.6-day-old `styles.css`. The HTML was new, the CSS was old, and the
new sections rendered as unstyled white blocks with default browser links. The
version stamp changes the URL, so a new file is always fetched immediately.

Asset caching is also set to 5 minutes in `vercel.json` as a safety net, so even
if you forget to bump the stamp, changes go live within a few minutes rather
than a week.

Note when testing: fetching an asset with a cache-busting query string
(`?anything`) bypasses the cache and will always look correct. To check what
real visitors are getting, request the URL **without** a query string and look
at the `age` and `x-vercel-cache` response headers.

## Step 4 — Junior Wolves registration database (Google Sheet)

Junior Wolves registrations are saved in **two** places: the Triumph inbox (immediate
notification) and a private Google Sheet (the durable, sortable database). The two are
attempted independently — if one fails the other still captures the registration, and the
family only sees an error if **both** fail.

Every other Triumph form is unchanged and stays email-only.

### 4a. Where the Sheet lives

Workbook: **JUNIOR WOLVES — 2026–27 REGISTRATION + TRYOUT MASTER**
Owner: `triumphhoopsacademy@gmail.com`
Tabs: `MASTER REGISTRATIONS` (all rows) and `README / FIELD GUIDE`.

Columns A–P are what the family submitted and should not be edited. Columns Q–AI are
internal coach fields (attendance, evaluation scores, placement, offers, payment,
follow-up) and are never shown to parents or submitted from the website.

### 4b. How the website writes to it

The Sheet has a bound Apps Script (**Extensions → Apps Script**) deployed as a Web App.
`api/inquiry.js` POSTs each Junior Wolves registration to that deployment's `/exec` URL
with a shared secret. This approach was chosen over the Google Sheets API because it needs
no dependencies, no service-account private key and no token refresh — the site has no
`package.json` and this keeps it that way.

The script source is version-controlled at `ops/junior-wolves-sheet.gs`. If you ever edit
the script in Google, paste the change back into that file so the two stay in sync.

### 4c. Environment variables

Add these in Vercel → Settings → Environment Variables (Production):

| Variable                 | What it is                                                    |
|--------------------------|---------------------------------------------------------------|
| `SHEETS_WEBHOOK_URL`     | the Apps Script Web App `/exec` URL for the master sheet       |
| `SHEETS_WEBHOOK_SECRET`  | shared secret; must match `SHEETS_WEBHOOK_SECRET` in the script's Script Properties |

Both are server-side only and are never sent to the browser. Never commit either value.

**If `SHEETS_WEBHOOK_URL` is unset, Sheet logging is skipped and the site behaves exactly
as it did before — email only.** Nothing breaks.

### 4d. Reconnecting it if rows stop arriving

1. Open the Sheet → **Extensions → Apps Script → Deployments**.
2. Confirm there is an active **Web app** deployment, *Execute as: Me*,
   *Who has access: Anyone*.
3. Copy its `/exec` URL and compare it to `SHEETS_WEBHOOK_URL` in Vercel. **Creating a new
   deployment version changes the URL** — this is the usual cause. Update Vercel and redeploy.
4. Confirm the script's Script Property `SHEETS_WEBHOOK_SECRET` matches Vercel's.
5. Submit a test registration and check the Vercel function log. It prints one clear line:
   `CAPTURED BY EMAIL + SHEET`, `REGISTRATION CAPTURED BY EMAIL — SHEET LOGGING FAILED`, or
   `REGISTRATION CAPTURED BY SHEET — EMAIL DELIVERY FAILED`.

While the Sheet is disconnected, registrations still arrive by email — and each of those
emails says `Google Sheet: NOT LOGGED`, so you know exactly which rows to add by hand.

### 4e. Submission IDs

Every submission gets an ID like `JW-2026-A1B2C3D4`. The same ID appears at the top of the
notification email and in column A of the Sheet, so any row can be matched back to its
email if you ever need to troubleshoot.
