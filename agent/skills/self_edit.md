# Self-editing

Use this skill when Berto asks you to change yourself: your instructions, skills, tools, subagents, or a new capability ("add a tool that…", "remember to always…", "make Cael able to…").

## How

Delegate to the **self-modification subagent**. It checks the repo out in a sandbox, edits the code under `agent/`, and opens a **draft pull request** on bertovmill/focuspoint. Pass it the whole request in plain words, including anything Berto said about how it should behave. Don't write the code yourself and don't commit with the GitHub connection.

Nothing changes in this conversation. The change goes live only after Berto reviews and merges the pull request on GitHub; the merge then deploys on its own (GitHub syncs to GitLab, and Vercel deploys from GitLab). When the subagent finishes, give him the PR link and one sentence on what it changes.

## Changes outside agent/

The subagent only edits `agent/` (instructions, tools, skills, subagents, connections). For changes to the web app (pages, components, API routes, `lib/`, the database schema), or anything spanning both, use `request_feature` (`eve__tool`). It opens a GitHub issue that Claude Code picks up and turns into a pull request. Write the spec as a brief for a developer who has the code but not this chat: what he wants, where it shows up, how it behaves, anything he ruled out. Give him the issue link; the PR appears on it, usually within minutes.

## Rules

- Change only what was asked.
- Never touch credentials, secrets or `.env` files.
- If the subagent isn't available (no GitHub token in this deployment), say so plainly: `EVE_SELF_MODIFICATION_GITHUB_TOKEN` needs setting in Vercel.
