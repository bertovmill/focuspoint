"use client";

import { useState } from "react";
import { ExternalLinkIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ARCHETYPE, GAPS, RESEARCHED_ON, ROLES, THEMES, TOOLS, type CareerRole } from "@/lib/career-research";
import { cn } from "@/lib/utils";

const TRACKS: { id: CareerRole["track"] | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "gtm-strategy", label: "GTM Strategy" },
  { id: "revops", label: "RevOps" },
  { id: "marketing-ops", label: "Marketing Ops" },
];

/**
 * /career — what AI companies want from GTM strategy, RevOps and marketing-ops
 * hires, triangulated across real postings. Static research in lib/career-research.ts.
 */
export function CareerPanel() {
  const [track, setTrack] = useState<(typeof TRACKS)[number]["id"]>("all");
  const roles = track === "all" ? ROLES : ROLES.filter((r) => r.track === track);
  const maxTheme = Math.max(...THEMES.map((t) => t.frequency));

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold">Career</h1>
        <p className="text-sm text-muted-foreground">
          GTM roles at AI companies: {ROLES.length} postings across {new Set(ROLES.map((r) => r.company)).size} companies, researched {RESEARCHED_ON}.
        </p>
      </header>

      <section id="the-archetype">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">The person they want</h2>
        <Card className="p-4 text-sm leading-relaxed">{ARCHETYPE}</Card>
      </section>

      <section id="what-they-ask-for">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">What keeps coming up</h2>
        <div className="flex flex-col gap-3">
          {THEMES.map((t) => (
            <div key={t.theme}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium">{t.theme}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">{t.frequency}/{ROLES.length}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-muted">
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${(t.frequency / maxTheme) * 100}%` }} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{t.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="tool-stack">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Tool stack</h2>
        <div className="flex flex-wrap gap-2">
          {TOOLS.map((t) => (
            <span key={t.tool} className="rounded-full border px-2.5 py-1 text-xs">
              {t.tool} <span className="text-muted-foreground">· {t.frequency}</span>
            </span>
          ))}
        </div>
      </section>

      <section id="gaps-to-close">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Gaps that get candidates cut</h2>
        <ul className="ms-5 list-disc space-y-1 text-sm">
          {GAPS.map((g) => <li key={g}>{g}</li>)}
        </ul>
      </section>

      <section id="open-roles">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Roles</h2>
          <div className="flex gap-1">
            {TRACKS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTrack(t.id)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs",
                  track === t.id ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "text-muted-foreground hover:bg-muted",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-3">
          {roles.map((r) => (
            <Card key={r.url} className="gap-2 p-4">
              <a href={r.url} target="_blank" rel="noreferrer" className="group flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs text-muted-foreground">{r.company}</div>
                  <div className="text-sm font-medium group-hover:underline">{r.title}</div>
                </div>
                <ExternalLinkIcon className="mt-1 size-3.5 shrink-0 text-muted-foreground" />
              </a>
              <div className="text-xs text-muted-foreground">
                {[r.location, r.comp, r.yearsExp && `${r.yearsExp} yrs`].filter(Boolean).join(" · ")}
              </div>
              <ul className="ms-4 list-disc text-xs">
                {r.mustHaves.map((m) => <li key={m}>{m}</li>)}
              </ul>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
