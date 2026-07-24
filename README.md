# Triumph Hoops Academy — Website

Static website for **triumphhoopsacademy.com**, including the Niles West Junior Wolves
feeder program hub. No build step, no framework, no dependencies — plain HTML, CSS and
JavaScript, plus one small serverless function that emails form submissions.

## Files

```
index.html            Home
training.html         Training
teams.html            Teams (development + AAU/travel, and Coach With Triumph)
junior-wolves.html    Niles West Junior Wolves — the full one-page hub
our-story.html        Our Story + coaching staff
thank-you.html        Where forms land if a visitor has JavaScript turned off
404.html              Not-found page

assets/css/styles.css      All styling. Colors and type live in the tokens at the top.
assets/js/site-data.js  ←  EDIT THIS for contact info, schedules, staff, season, fees
assets/js/main.js          Navigation, FAQ accordion, reveals, rendering
assets/js/forms.js         Form validation and submission
api/inquiry.js             Serverless function that emails inquiries

sitemap.xml, robots.txt    Search engine files
vercel.json, netlify.toml  Host configuration
```

## Reading order for whoever picks this up

1. **`SETUP.md`** — deploy the site, point the domain at it, turn on form email.
   Forms do not deliver email until the steps in this file are done.
2. **`PLACEHOLDERS.md`** — everything still waiting on real information or assets.
3. **`CONTENT-GUIDE.md`** — how to make routine updates without touching the design.

## Preview it locally

Open `index.html` in a browser. Everything works except form submission, which needs
the serverless function running (see `SETUP.md`). For a closer-to-production preview:

```bash
npx serve .
```

## A note on how this is built

Content that changes often (session times, tryout dates, fees, staff, locations) is
centralized in `assets/js/site-data.js`. Content that rarely changes (philosophy, program
descriptions, FAQ answers) is written directly into the HTML, where each editable block is
marked with a comment starting `EDIT:`. Nothing is duplicated in two places, so nothing can
fall out of sync.
