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

if [ -e vercel.json ]; then
  echo "vercel.json exists — eve generates the services config itself; remove it first." >&2
  exit 1
fi

exec vercel --prod --yes --scope bertoaucctus "$@"
