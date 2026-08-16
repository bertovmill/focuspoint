import type { Metadata } from "next";
import { getWealthForms, getPublicStats, getPublicVisions, type PublicWealthForm } from "@/lib/public-data";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Building",
  description:
    "The 8 forms of wealth I track, with live progress against each goal — pulled from the agent that keeps the scoreboard.",
};

function formatTotal(form: PublicWealthForm) {
  // A redacted form with no goal has nothing publishable at all — not the value,
  // and not a percentage of a target that doesn't exist.
  if (form.redacted) return form.hasTarget ? `${form.percent}%` : "—";
  const n = form.total ?? 0;
  const rounded = Number.isInteger(n) ? n : Math.round(n * 10) / 10;
  return rounded.toLocaleString();
}

function FormCard({ form, vision }: { form: PublicWealthForm; vision?: string }) {
  return (
    <div className="flex flex-col rounded-xl border border-border bg-card p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-medium tracking-tight">{form.label}</h3>
        {form.hasTarget && (
          <span className="font-mono text-xs text-muted-foreground tabular-nums">{form.percent}%</span>
        )}
      </div>

      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="font-mono text-2xl font-semibold tracking-tight tabular-nums">{formatTotal(form)}</span>
        {form.redacted ? (
          <span className="text-sm text-muted-foreground">{form.hasTarget ? "of target" : "tracked privately"}</span>
        ) : (
          <span className="text-sm text-muted-foreground">
            {form.hasTarget ? `/ ${form.target.toLocaleString()} ` : ""}
            {form.unit}
          </span>
        )}
      </div>

      {form.hasTarget ? (
        <div
          className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={form.percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${form.label} progress`}
        >
          <div className="h-full rounded-full bg-primary" style={{ width: `${form.percent}%` }} />
        </div>
      ) : (
        // No goal set for this form yet — the count is still real, so show it
        // without inventing a denominator.
        <p className="mt-4 text-xs text-muted-foreground">Tracking, no goal set yet.</p>
      )}

      {vision && <p className="mt-4 line-clamp-3 text-sm leading-relaxed text-muted-foreground">{vision}</p>}
      {form.redacted && form.hasTarget && (
        <p className="mt-4 text-xs text-muted-foreground">
          Progress only — the balance behind this one stays private.
        </p>
      )}
    </div>
  );
}

export default async function BuildingPage() {
  const [forms, stats, visions] = await Promise.all([
    getWealthForms().catch(() => [] as PublicWealthForm[]),
    getPublicStats().catch(() => null),
    getPublicVisions().catch(() => ({}) as Record<string, string>),
  ]);

  return (
    <div className="mx-auto max-w-5xl px-6">
      <section className="border-b border-border/60 py-16">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Live</p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Building in public</h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted-foreground">
          I don&apos;t measure my life in one number. I measure it in eight — the forms of wealth that
          actually make a life good. Cael keeps the scoreboard; this page reads straight off it.
        </p>
        {stats && (
          <p className="mt-6 font-mono text-sm text-muted-foreground">
            {stats.tasksShipped.toLocaleString()} tasks completed · {stats.shippedLast30Days} in the last 30 days
          </p>
        )}
      </section>

      <section className="py-12">
        {forms.length === 0 ? (
          <p className="text-muted-foreground">The scoreboard is briefly unavailable. Try again in a moment.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {forms.map((form) => (
              <FormCard key={form.key} form={form} vision={visions[form.key]} />
            ))}
          </div>
        )}
        <p className="mt-8 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Every figure here is an aggregate — a count, a sum, a percentage. The entries underneath
          them (what I read, who I trained with, what I wrote down) stay with the agent.
        </p>
      </section>
    </div>
  );
}
