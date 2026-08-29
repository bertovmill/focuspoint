#!/usr/bin/env bash
#
# Deploy focuspoint to the SECOND Vercel account (scope `bertoaucctus`, project
# `cael-agent`, live at https://cael-agent-seven.vercel.app).
#
# Why this script exists instead of a plain `vercel --prod`:
#
# The two Vercel projects need *different* config and the repo can only hold one.
#   - The original project (team bertmill19s-projects, paused 2026-08-29) runs on
#     `experimentalServices`, which is what eve 0.18.2 emits and what main carries.
#   - Any *newly created* Vercel project rejects `experimentalServices` outright
#     ("no longer available for new projects; use the `services` property"), and
#     `services` additionally refuses Edge Runtime output — which middleware.ts
#     produces by default.
#
# So this applies both changes, deploys, and puts the tree back exactly as it was.
# main stays correct for the original project.
#
# KNOWN LIMITATION: Cael's chat does not work on this deployment. eve 0.18.2 writes
# its build output under `experimentalServices` (see
# node_modules/eve/dist/src/public/next/vercel-output-config.js), so under the
# `services` model the agent routes are never mounted and /eve/v1/health 404s.
# Every page and every /api/* route works. The real fix is upgrading eve
# (0.18.2 -> 0.47.3 at time of writing), which is a large, breaking change.
set -euo pipefail
cd "$(dirname "$0")/.."

if ! git diff --quiet -- vercel.json middleware.ts; then
  echo "vercel.json / middleware.ts have uncommitted changes; commit or stash first." >&2
  exit 1
fi

restore() { git checkout -- vercel.json middleware.ts; echo "restored vercel.json + middleware.ts"; }
trap restore EXIT

python3 - <<'PY'
import json
cfg = {
    "$schema": "https://openapi.vercel.sh/vercel.json",
    "services": {
        "web": {"root": ".", "framework": "nextjs"},
        "eve": {"root": ".", "framework": "eve", "buildCommand": "eve build"},
    },
    "rewrites": [
        {"source": "/_eve_internal/eve/(.*)", "destination": {"service": "eve"}},
        {"source": "/(.*)", "destination": {"service": "web"}},
    ],
}
open("vercel.json", "w").write(json.dumps(cfg, indent=2) + "\n")

p = "middleware.ts"
s = open(p).read()
old = 'export const config = {\n  matcher:'
new = 'export const config = {\n  // Services reject Edge Runtime output; Node is also what Next 16 wants here.\n  runtime: "nodejs",\n  matcher:'
assert old in s, "middleware config block not found — has middleware.ts changed shape?"
open(p, "w").write(s.replace(old, new, 1))
PY

echo "applied services + node-runtime patch; deploying..."
vercel --prod --yes --scope bertoaucctus
