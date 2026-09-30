#!/usr/bin/env node
/* ==========================================================================
   RENDER CANONICAL <option> MARKUP INTO THE FORM PAGES
   --------------------------------------------------------------------------
   The pages must work with JavaScript disabled (forms.js rule 2), so the
   options have to be real HTML rather than built at runtime. That would
   normally mean a hand-written list per page - exactly the drift this phase
   exists to end.

   So the HTML is GENERATED. Each select carries a marker:

       <!--CANON:grade:junior_wolves-->  ... generated ...  <!--/CANON-->
       <!--CANON:age:triumph-->          ... generated ...  <!--/CANON-->
       <!--CANON:school-->               ... generated ...  <!--/CANON-->

   and this script rewrites what is between them from assets/js/canonical.js.
   Run it after any change to the canonical config. `--check` exits non-zero
   if any page is out of date, which is what the test suite calls so a stale
   page cannot ship quietly.

   forms.js ALSO verifies the rendered options against the config at runtime,
   so a page that somehow shipped stale is caught in the browser too.
   ========================================================================== */
"use strict";
const fs = require("fs");
const path = require("path");
const C = require("../assets/js/canonical.js");

const PAGES = ["index.html", "junior-wolves.html", "teams.html", "training.html", "clinic-rsvp.html"];
const MARKER = /<!--CANON:([a-z]+)(?::([a-z_]+))?-->[\s\S]*?<!--\/CANON-->/g;

function render(kind, scope) {
  if (kind === "grade") return C.gradeOptionsHtml(scope);
  if (kind === "age") return C.ageOptionsHtml(scope);
  if (kind === "school") return C.schoolOptionsHtml();
  /* For these two the scope is the FORM SOURCE, not the program: two Triumph
     pages share a program and deliberately offer different interest lists. */
  if (kind === "experience" || kind === "interest") {
    const opts = C.choicesForSource(kind, scope);
    if (!opts.length) throw new Error("no " + kind + " options declared for source: " + scope);
    return C.optionsHtml(opts);
  }
  throw new Error("unknown canonical option kind: " + kind);
}

function rewrite(file) {
  const abs = path.join(__dirname, "..", file);
  const src = fs.readFileSync(abs, "utf8");
  const out = src.replace(MARKER, (_m, kind, program) =>
    "<!--CANON:" + kind + (program ? ":" + program : "") + "-->" +
    render(kind, program) +
    "<!--/CANON-->");
  return { abs, src, out, changed: out !== src };
}

const check = process.argv.includes("--check");
let stale = 0;
for (const file of PAGES) {
  const r = rewrite(file);
  if (r.changed) {
    stale++;
    if (check) console.error("STALE  " + file);
    else { fs.writeFileSync(r.abs, r.out); console.log("wrote  " + file); }
  } else {
    console.log((check ? "ok     " : "same   ") + file);
  }
}
if (check && stale) {
  console.error("\n" + stale + " page(s) out of date. Run: node tools/render-canonical-options.js");
  process.exit(1);
}
