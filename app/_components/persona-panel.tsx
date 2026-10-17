"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { MarkdownDoc } from "@/app/_components/markdown-doc";

const RELOAD_EVENT = "persona:draft-changed";

type Status = {
  approved: { content: string; updated_at: string | null };
  draftUpdatedAt: string | null;
  draftMatchesLive: boolean;
  noteCount: number;
};

/**
 * /persona — the profile the public Cael on bertomill.com speaks from. Notes
 * tagged `persona` are distilled into a draft (values and voice, never note
 * contents); Berto edits it here and approves it. Only the approved text reaches
 * the public chat. See lib/persona.ts.
 */
export function PersonaPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState<"generate" | "approve" | "unpublish" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    fetch("/api/persona")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then(setStatus)
      .catch(() => setError("Couldn't load the persona."));
  }, []);

  useEffect(() => {
    refresh();
    // Edits to the draft change whether it matches the live version.
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [refresh]);

  async function run(action: "generate" | "approve" | "unpublish") {
    setBusy(action);
    setError(null);
    try {
      const res =
        action === "generate"
          ? await fetch("/api/persona/generate", { method: "POST" })
          : action === "approve"
            ? await fetch("/api/persona/approve", { method: "POST" })
            : await fetch("/api/persona", { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Something went wrong.");
      if (action === "generate") window.dispatchEvent(new Event(RELOAD_EVENT));
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  const live = !!status?.approved.content;
  const liveSince = status?.approved.updated_at
    ? new Date(status.approved.updated_at).toLocaleDateString([], { month: "short", day: "numeric" })
    : null;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Public persona</h1>
        <p className="text-sm text-muted-foreground">
          How Cael carries your values on bertomill.com. Tag notes <span className="font-medium text-foreground">persona</span>,
          generate a draft, edit it, then approve. Your notes never reach the public chat, only what you approve here.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => run("generate")} disabled={!!busy || !status?.noteCount} variant="secondary">
          {busy === "generate"
            ? "Generating…"
            : `Generate from ${status?.noteCount ?? "…"} tagged note${status?.noteCount === 1 ? "" : "s"}`}
        </Button>
        <Button onClick={() => run("approve")} disabled={!!busy || !status || status.draftMatchesLive}>
          {busy === "approve" ? "Publishing…" : live ? "Approve changes" : "Approve & publish"}
        </Button>
        <span className="ml-auto text-xs text-muted-foreground">
          {!status
            ? null
            : !live
              ? "Not live: the public chat uses its plain voice"
              : status.draftMatchesLive
                ? `Live since ${liveSince}`
                : "Live, with unpublished edits"}
        </span>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <MarkdownDoc
        id="persona-draft"
        endpoint="/api/persona/draft"
        reloadEvent={RELOAD_EVENT}
        heading={<h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Draft</h2>}
        placeholder="Generate a draft from your persona notes, or write how Cael should carry your values: what you care about, how you think, how you sound."
      />

      {live && (
        <button
          onClick={() => run("unpublish")}
          disabled={!!busy}
          className="self-start text-xs text-muted-foreground underline-offset-4 hover:underline"
        >
          {busy === "unpublish" ? "Taking offline…" : "Take the persona offline"}
        </button>
      )}
    </div>
  );
}
