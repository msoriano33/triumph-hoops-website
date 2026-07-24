# Placeholders — everything still waiting on real information

Nothing on this list was guessed. Each item is marked in the code and shows on the site as
an obvious placeholder or a "To be announced" chip.

## Blocks launch

| # | Item | Where to fix | Notes |
|---|------|--------------|-------|
| 1 | **Form email credentials** | Host environment variables | Until these exist, no form delivers. See `SETUP.md` Step 3. |
| 2 | **Coach Oli — public phone number** | `site-data.js` → `contactInfo.phoneDisplay`, `phoneHref` | Currently shows `[COACH OLI PUBLIC PHONE]` in the footer and beside every form. |
| 3 | **Coach Oli — last name** | `site-data.js` → `staff` | Staff card reads "Coach Oli [LAST NAME]". |
| 4 | **Official Triumph yellow hex** | `styles.css` → `--triumph-yellow` | Currently `#ffc629` as a stand-in. Pull the exact value from the logo file; change it once and the whole site updates. |
| 5 | **Triumph logo file** | `assets/img/`, then the `LOGO SLOT` comment in each page header | Currently a yellow "T" block. |

## Should be resolved before promoting the site

| # | Item | Where to fix | Notes |
|---|------|--------------|-------|
| 6 | **Official Niles West colors** | `styles.css` → `--nw-red`, `--nw-black`, `--nw-white` | `--nw-red` is a temporary crimson. Everything Junior Wolves reads from these three tokens. |
| 7 | **Final Junior Wolves logo** | `junior-wolves.html` → `LOGO SLOT` comment | Currently an outlined "NW" mark. |
| 8 | **Junior Wolves tryout dates + location** | `site-data.js` → `juniorWolvesSeason` | Shows "To be announced" in Season at a glance, the registration section, and the FAQ. |
| 9 | **Junior Wolves season, practice days/times/locations, game windows** | `site-data.js` → `juniorWolvesSeason` | Same. |
| 10 | **Junior Wolves program fees, what's included, payment due** | `site-data.js` → `juniorWolvesFees` | Same. |
| 11 | **Uniform details** | `site-data.js` → `juniorWolvesSeason.uniforms` | Same. |
| 12 | **Training gym addresses** | `site-data.js` → `locations` | St. Hilary, St. Paul, St. Matthias currently show "Address coming soon". |

## Photography and media

Every slot is marked in the HTML with a `MEDIA SLOT` comment and renders as a deliberate
dark panel until filled, so the site is presentable in the meantime.

| Where | What it needs |
|-------|---------------|
| Home hero | Real Triumph footage or a strong photo (16:9, or a short muted video loop) |
| Training → Weekly skills | Small-group training photo (3:2) |
| Teams → AAU / travel | Game action or bench huddle (4:5 portrait) |
| Our Story → Founders | Founders or full team photo (3:2) |
| Our Story → Staff grid | Coach portraits, 4:5 (set `photo:` in `site-data.js`) |
| Social sharing image | 1200×630 at `assets/img/og-image.jpg`, then uncomment the `og:image` tag in each page's `<head>` |
| Favicon | Currently a temporary inline "T" mark in Triumph yellow/black (no file needed). Replace with `favicon.ico` / `apple-touch-icon.png` once the logo exists, and swap the `<link rel="icon">` tag in each page's `<head>`. |

## Optional

- **Instagram URL** — `site-data.js` → `contactInfo.instagram`. The footer link stays hidden
  until you add one.
- **Coach bios** — `site-data.js` → `staff[].bio`. Left empty on purpose; nothing was invented.
- **Analytics** — none installed.

## Deliberately not included

- No street address anywhere, including the structured data. Triumph works out of multiple
  partner facilities, and listing one gym as a headquarters would be misleading.
- No online payment. Triumph training payment happens directly with a coach (cash or Zelle),
  and Junior Wolves payment only happens after placement — so there is nothing to charge for
  at the moment a family submits a form.
- No invented dates, prices, testimonials, championships, social links or coach credentials.
