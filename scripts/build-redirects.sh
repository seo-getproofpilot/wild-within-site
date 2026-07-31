#!/usr/bin/env bash
# Rebuilds the legacy-URL redirect stubs.
#
# The old site was GoDaddy Website Builder. Those URLs still hold backlinks and,
# in the case of /about-me-1, still rank. GitHub Pages cannot serve a real 301,
# so each old path gets a stub page that does three things at once:
#   - rel=canonical pointing at the new URL, so Google consolidates the signals
#   - an instant meta refresh, which Google treats as a permanent redirect
#   - location.replace(), so humans never see the stub
#
# Deliberately NOT noindex. Noindex would stop the consolidation we want.
#
# Source of the old URL list: DataForSEO backlinks_domain_pages, 2026-07-31.
# Re-run this after adding a row to the map below.

set -euo pipefail
cd "$(dirname "$0")/.."

# old path (no leading slash, no .html)  =>  new path
MAP=(
  "about-me-1|/about"
  "the-wild-within-team|/about"
  "contact-us|/contact"
  "therapy|/individual-therapy"
  "workshops-&-groups|/workshops"
  "clinical-supervision|/services"
)

for row in "${MAP[@]}"; do
  old="${row%%|*}"
  new="${row##*|}"
  cat > "${old}.html" <<HTML
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Redirecting to ${new} | The Wild Within Therapy</title>
<link rel="canonical" href="https://thewildwithintherapy.com${new}" />
<meta http-equiv="refresh" content="0; url=https://thewildwithintherapy.com${new}" />
<meta name="theme-color" content="#4a2540" />
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
       background:#f7f2f4;color:#4a2540;font-family:Georgia,'Times New Roman',serif;
       text-align:center;padding:24px;line-height:1.6}
  a{color:#4a2540}
</style>
</head>
<body>
  <p>This page has moved. <a href="${new}">Continue to its new home</a>.</p>
  <script>location.replace("${new}");</script>
</body>
</html>
HTML
  echo "wrote ${old}.html -> ${new}"
done
