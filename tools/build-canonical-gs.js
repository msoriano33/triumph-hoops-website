#!/usr/bin/env node
/* ==========================================================================
   GENERATE ops/funnel/canonical-config.gs FROM assets/js/canonical.js
   --------------------------------------------------------------------------
   Apps Script cannot require() a file out of this repo, so it needs its own
   copy of the canonical config. A hand-maintained second copy is precisely
   the drift this phase exists to end - so the copy is GENERATED and carries a
   banner saying so.

   canonical.js is already ES5-shaped and its UMD tail assigns JW_CANON onto
   `this`, which in Apps Script is the global object. So the body transfers
   verbatim; only the banner is added. Nothing is rewritten, which means the
   two copies cannot behave differently.

   Run this after ANY change to canonical.js, then paste the .gs into the
   Apps Script project. `--check` exits non-zero when the .gs is stale.
   ========================================================================== */
"use strict";
const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "..", "assets", "js", "canonical.js");
const OUT = path.join(__dirname, "..", "ops", "funnel", "canonical-config.gs");

const body = fs.readFileSync(SRC, "utf8");
const banner =
  "/* ==========================================================================\n" +
  "   GENERATED FILE - DO NOT EDIT\n" +
  "   --------------------------------------------------------------------------\n" +
  "   Source:    assets/js/canonical.js\n" +
  "   Generator: tools/build-canonical-gs.js\n" +
  "\n" +
  "   Edit the SOURCE and regenerate. An edit made here is lost on the next\n" +
  "   build, and worse, it makes Apps Script disagree with the forms and the\n" +
  "   API about what a valid grade or school is - which is the exact failure\n" +
  "   this file exists to prevent.\n" +
  "\n" +
  "   Defines the global JW_CANON for every other .gs file in this project.\n" +
  "   ========================================================================== */\n\n";

/* The .gs is a GENERATED artifact, so it carries the code and a pointer back
   to the source rather than the source's prose. Every explanation lives in
   assets/js/canonical.js, which is where anyone should be reading and editing
   anyway. Stripping the comments keeps the pasted file small enough to move
   into the Apps Script editor in one piece, and leaves exactly one place
   where the reasoning is written down. */
function stripBlockComments(src) {
  let out = "", i = 0, inStr = null;
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (inStr) {
      out += c;
      if (c === "\\") { out += n === undefined ? "" : n; i += 2; continue; }
      if (c === inStr) inStr = null;
      i++; continue;
    }
    if (c === '"' || c === "'" || c === "`") { inStr = c; out += c; i++; continue; }
    if (c === "/" && n === "*") {
      const end = src.indexOf("*/", i + 2);
      i = end === -1 ? src.length : end + 2;
      continue;
    }
    if (c === "/" && n === "/") {
      const nl = src.indexOf("\n", i);
      i = nl === -1 ? src.length : nl;
      continue;
    }
    if (c === "/" && /[=(,:[!&|?{;+\-*%]\s*$/.test(out)) {
      /* a regex literal - copy it whole so its contents are never scanned */
      let j = i + 1, cls = false;
      while (j < src.length) {
        const d = src[j];
        if (d === "\\") { j += 2; continue; }
        if (d === "[") cls = true;
        else if (d === "]") cls = false;
        else if (d === "/" && !cls) break;
        j++;
      }
      out += src.slice(i, j + 1); i = j + 1; continue;
    }
    out += c; i++;
  }
  return out.replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n");
}

const out = banner + stripBlockComments(body);
const check = process.argv.includes("--check");
const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : "";

if (out === current) { console.log("ok     canonical-config.gs is current"); process.exit(0); }
if (check) {
  console.error("STALE  ops/funnel/canonical-config.gs\nRun: node tools/build-canonical-gs.js");
  process.exit(1);
}
fs.writeFileSync(OUT, out);
console.log("wrote  ops/funnel/canonical-config.gs (" + out.length + " bytes)");
