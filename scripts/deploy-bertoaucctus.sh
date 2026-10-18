#!/usr/bin/env bash
#
# Deploy focuspoint to the bertoaucctus Vercel account (project `cael-agent`,
# live at https://cael-agent-seven.vercel.app).
#
# Since the eve 0.52 upgrade (2026-09-05) this is a plain production deploy.
# There is deliberately NO vercel.json in the repo: eve's `withEve()` generates
# the `services` block into .vercel/output/config.json at build time, and eve
# throws if vercel.json declares services itself. middleware.ts already carries
# `runtime: "nodejs"`. The old version of this script wrote both of those and
# restored them afterwards; that is no longer needed and would break the build.
set -euo pipefail
cd "$(dirname "$0")/.."

# OBSOLETE since the eve 0.52 upgrade (2026-09-05): vercel.json is gone from the
# repo (withEve generates the services block) and middleware.ts already sets the
# Node runtime, so the patch below would write a stray vercel.json and a duplicate
# `runtime` key — which is exactly what broke a build today. Plain deploy instead.
if ! git ls-files --error-unmatch vercel.json >/dev/null 2>&1; then
  echo "vercel.json is no longer tracked — this script is obsolete." >&2
  echo "Deploy with:  vercel --prod --yes --scope bertoaucctus" >&2
  exit 1
fi

if [ -e vercel.json ]; then
  echo "vercel.json exists — eve generates the services config itself; remove it first." >&2
  exit 1
fi

exec vercel --prod --yes --scope bertoaucctus "$@"
