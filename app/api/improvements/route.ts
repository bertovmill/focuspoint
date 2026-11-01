import { NextResponse } from "next/server";
import { CAEL_REPO, createIssue, listIssues } from "@/lib/github";

/**
 * The Improve box ("liquid software"): Berto types how Cael should be different and
 * it ships without review. POST files a GitHub issue labelled `improvement` that
 * mentions @claude; .github/workflows/claude.yml builds it on a branch, and its
 * `ship` job squash-merges that branch to main once `npm run typecheck` passes.
 * The push to main deploys to Vercel. GET lists recent ones for the dialog.
 *
 * The repo is public, so what's typed here is public too.
 */
const LABEL = "improvement";

export async function GET() {
  try {
    return NextResponse.json(await listIssues(CAEL_REPO, LABEL, 8));
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}

export async function POST(req: Request) {
  const { text } = (await req.json().catch(() => ({}))) as { text?: string };
  const request = text?.trim() ?? "";
  if (request.length < 4) return NextResponse.json({ error: "Say what should change." }, { status: 400 });
  if (request.length > 8000) return NextResponse.json({ error: "Keep it under 8,000 characters." }, { status: 400 });

  const firstLine = request.split("\n").find((l) => l.trim())!.replace(/^[-•*]\s*/, "").trim();
  const title = firstLine.length > 80 ? `${firstLine.slice(0, 77).trimEnd()}…` : firstLine;
  const body = [
    request,
    "",
    "---",
    "Sent from Cael's Improve box. @claude please implement this now, without asking first:",
    "make the smallest change that does what's asked, follow CLAUDE.md, run `npm run typecheck`",
    "and fix any errors, then commit to your branch. Don't open a pull request: the workflow",
    "merges your branch to main and deploys it once typecheck passes. If the request is too",
    "unclear or risky to do safely (deleting data, auth, secrets), change nothing and reply",
    "with one short question instead.",
  ].join("\n");

  try {
    const issue = await createIssue(CAEL_REPO, { title, body, labels: [LABEL] });
    return NextResponse.json(issue);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
