# Self-editing

Use this skill when the user asks you to edit, update, or improve your own code or instructions.

## Key file paths

| What | Path in bertovmill/focuspoint |
|------|-------------------------------|
| Personality / standing rules | `agent/instructions.md` |
| Skills (on-demand procedures) | `agent/skills/<name>.md` |
| Tools (callable functions) | `agent/tools/<name>.ts` |
| GitHub connection | `agent/connections/github.ts` |

## Workflow

1. Use a targeted GitHub API call to read the specific file you want to change — get its content and SHA.
2. Draft the new content. Show the user exactly what will change (a summary or diff).
3. **Wait for explicit user approval** before writing.
4. After approval, use the GitHub API to PUT the file with the full new content, the current SHA, a clear commit message, and branch `main`.
5. Confirm the commit URL to the user.

## Guiding principles

- **Always read before writing.** You need the current SHA to update a file.
- **Edit only what was asked.** Don't refactor surrounding code or make unrelated improvements.
- **One file per commit.** If multiple files need to change, commit them one at a time with focused messages.
- **Never edit credentials, secrets, or `.env` files.**
- After a commit to `main`, Vercel automatically redeploys — let the user know the change will be live shortly.
