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

## Future: lead data beyond email

Email is the source of truth today. Every submission already carries a `source` tag
(`junior_wolves_tryout`, `weekly_training`, and so on) and clean labeled fields, so when
you're ready to add a Google Sheet, a CRM, or automated follow-ups, that work amounts to
adding one more step inside `api/inquiry.js` — no changes to the website itself.
