import selfModification from "eve/self-modification/remote";

// Lets the deployed Cael change its own agent source (instructions, tools, skills,
// subagents — everything under agent/). eve checks the GitHub repo out in a Vercel
// Sandbox, edits it there and opens a *draft* pull request against main; nothing
// changes until Berto merges it on GitHub. The merge then reaches production the
// usual way: the sync-to-gitlab action fast-forwards GitLab main, which Vercel deploys.
//
// It can't touch the Next.js app (app/, components/, lib/) — that's what
// `request_feature` is for (a GitHub issue that Claude Code picks up).
//
// Token: EVE_SELF_MODIFICATION_GITHUB_TOKEN in Vercel production, a fine-grained
// PAT on bertovmill/focuspoint with Contents + Pull requests read/write. eve hands it
// to the sandbox's network layer only while it checks out or publishes; commands in
// the sandbox can't read it. Without the var the subagent simply isn't offered.
export default selfModification({
  source: { git: { repository: "github.com/bertovmill/focuspoint", directory: "." } },
  target: { branch: "main" },
  credentials: { pat: true },
  // Every principal the eve channel admits is already the owner (Clerk owner or
  // the password cookie, see agent/channels/eve.ts). Machine callers (Vercel OIDC
  // crons) don't get to rewrite the agent.
  authorize: ({ principal }) => principal?.principalType === "user",
  // Writing code wants a stronger model than the fast chat default.
  model: "anthropic/claude-sonnet-4.6",
});
