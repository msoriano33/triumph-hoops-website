#!/usr/bin/env python3
"""Privacy and secrets guard for the Triumph / Junior Wolves repository.

WHY THIS EXISTS
    On 2026-08-31 a literal array of 49 parent email addresses was committed
    into a reference copy of an Apps Script. It stayed in the repository for
    29 days and, because the directory was also deployed, was readable on the
    production domain. This guard exists so that cannot happen quietly again.

THE RULE IT ENFORCES
    Source control holds application code, templates, branding and SYNTHETIC
    test data. Real registrations, family contacts, attendance and rosters
    live in the private Google Sheet and the private Apps Script project.

DESIGN NOTE ON FALSE ALARMS
    A guard that cries wolf gets disabled, so organisation contact details,
    documentation placeholders and the public venue address are allowed by
    name. What trips it is family-shaped data: personal mailbox domains,
    several addresses in one file, unknown phone numbers, roster-shaped
    tables, and credential patterns.

USAGE
    python3 tools/privacy-scan.py            # scan files staged for commit
    python3 tools/privacy-scan.py --all      # scan the whole working tree
    python3 tools/privacy-scan.py --files a b
Exit status 1 means something needs a human decision.
"""
import re, subprocess, sys, os

# --- Allowed: organisation and documentation values, not family data --------
ALLOWED_EMAILS = {
    "triumphhoopsacademy@gmail.com",
    "noreply@triumphhoopsacademy.com",
    "msoriano33@gmail.com",
    "noreply@anthropic.com",
}
ALLOWED_EMAIL_DOMAINS = {"example.com", "example.org", "resend.dev", "triumphhoopsacademy.com"}
# Placeholders that appear in validation copy, e.g. "like name@email.com"
ALLOWED_EMAIL_LOCAL_HINTS = {"you", "name", "your", "someone", "first.last", "test"}
ALLOWED_PHONES = {"847-830-9454", "(847) 830-9454", "8478309454"}   # published coach line
ALLOWED_ADDRESS_FRAGMENTS = {"5701 Oakton"}                          # the school

SKIP_DIRS = {".git", "node_modules", ".vercel", "dist", "build"}
SCAN_EXT = (".gs", ".js", ".ts", ".html", ".md", ".json", ".yml", ".yaml",
            ".txt", ".csv", ".patch", ".env", ".example", ".sh", ".py")

EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
PHONE = re.compile(r"\b(?:\+?1[-. ])?\(?\d{3}\)?[-. ]\d{3}[-. ]\d{4}\b")
GRADE_ROW = re.compile(r"(?i)\b[1-8](?:st|nd|rd|th)\b")
NAMEPAIR = re.compile(r"\b[A-Z][a-z]{2,}\s+[A-Z][a-z]{2,}\b")

SECRETS = [
    ("Google API key",   re.compile(r"AIza[0-9A-Za-z_\-]{35}")),
    ("Resend API key",   re.compile(r"\bre_[0-9A-Za-z_\-]{16,}")),
    ("AWS access key",   re.compile(r"AKIA[0-9A-Z]{16}")),
    ("Slack token",      re.compile(r"xox[abprs]-[0-9A-Za-z\-]{10,}")),
    ("GitHub token",     re.compile(r"gh[pousr]_[0-9A-Za-z]{30,}")),
    ("private key",      re.compile(r"BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY")),
    ("URL with credentials", re.compile(r"https?://[^/\s:@]+:[^/\s@]+@")),
    ("hardcoded secret", re.compile(r"(?i)(?:secret|token|password|apikey|api_key)\s*[:=]\s*['\"][A-Za-z0-9_\-+/=]{20,}['\"]")),
]

def email_is_allowed(addr):
    a = addr.lower()
    if a in ALLOWED_EMAILS:
        return True
    local, _, domain = a.partition("@")
    if domain in ALLOWED_EMAIL_DOMAINS:
        return True
    # "like name@email.com" style placeholders
    if local in ALLOWED_EMAIL_LOCAL_HINTS:
        return True
    return False

def scan_text(path, text):
    problems = []

    addrs = [a for a in set(EMAIL.findall(text)) if not email_is_allowed(a)]
    if addrs:
        problems.append((
            "personal email address" + ("es" if len(addrs) > 1 else ""),
            f"{len(addrs)} address(es) that are not organisation or placeholder values",
        ))
    # A list shape is worse than a stray address, so call it out separately.
    if len(addrs) >= 3:
        problems.append(("email list", f"{len(addrs)} addresses in one file looks like a contact list"))

    phones = {m.group(0) for m in PHONE.finditer(text)}
    phones = {p for p in phones if p.replace(" ", "").replace("(", "").replace(")", "") not in
              {q.replace(" ", "").replace("(", "").replace(")", "") for q in ALLOWED_PHONES}}
    if phones:
        problems.append(("phone number(s)", f"{len(phones)} number(s) not on the published-contact allowlist"))

    # Roster shape. Prose about "3rd-8th grade boys" must not trip this, so a
    # line only counts when it is DELIMITED like a data row - several commas,
    # pipes or tabs - as well as carrying a full name and a grade. Marketing
    # copy and HTML never look like that; a pasted CSV or a literal array of
    # athletes always does.
    roster_lines = []
    for ln in text.splitlines():
        if not (GRADE_ROW.search(ln) and NAMEPAIR.search(ln)):
            continue
        if "<" in ln or ">" in ln:
            continue                      # markup, not a data row
        for sep in (",", "|", "\t"):
            if ln.count(sep) < 2:
                continue
            fields = [f.strip().strip("'\"") for f in ln.split(sep)]
            fields = [f for f in fields if f]
            # A data row has short fields. Prose has long ones and full stops.
            if len(fields) >= 3 and all(len(f) <= 40 for f in fields) and "." not in ln.rstrip("."):
                roster_lines.append(ln)
                break
    if len(roster_lines) >= 4:
        problems.append(("roster-shaped data",
                         f"{len(roster_lines)} delimited rows pair a full name with a grade"))

    for name, rx in SECRETS:
        if rx.search(text):
            problems.append((f"possible {name}", "credential pattern matched"))
    return problems

def staged_files():
    out = subprocess.run(["git", "diff", "--cached", "--name-only", "--diff-filter=ACM"],
                         capture_output=True, text=True).stdout.split()
    return [f for f in out if f.lower().endswith(SCAN_EXT) and os.path.exists(f)]

def all_files():
    found = []
    for root, dirs, files in os.walk("."):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for f in files:
            if f.lower().endswith(SCAN_EXT):
                found.append(os.path.join(root, f))
    return found

def main():
    args = sys.argv[1:]
    if "--all" in args:
        targets = all_files()
    elif "--files" in args:
        targets = args[args.index("--files") + 1:]
    else:
        targets = staged_files()

    findings = []
    for path in targets:
        try:
            with open(path, encoding="utf-8", errors="ignore") as fh:
                text = fh.read()
        except OSError:
            continue
        for kind, detail in scan_text(path, text):
            findings.append((path, kind, detail))

    if not findings:
        print(f"privacy-scan: clean ({len(targets)} file(s) checked)")
        return 0

    print("privacy-scan: STOPPED THE COMMIT\n")
    print("  Real family or credential data does not belong in this repository.")
    print("  Registrations, contacts, attendance and rosters live in the private")
    print("  Google Sheet and Apps Script project.\n")
    for path, kind, detail in findings:
        print(f"  {path}\n      {kind}: {detail}")
    print("\n  Values are deliberately not printed.")
    print("  If a finding is a false alarm, add the specific value to the")
    print("  allowlists at the top of tools/privacy-scan.py and say why.")
    print("  To override once, knowing what you are doing: git commit --no-verify")
    return 1

if __name__ == "__main__":
    sys.exit(main())
