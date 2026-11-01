import { ArrowRightIcon } from "lucide-react";
import { SiteLink } from "../_components/site-link";
import { TINTS } from "../_components/tints";
import { cn } from "@/lib/utils";

/*
 * Budget, partners and outcomes for the MakersLounge case study: the part
 * that turns attendance into pipeline. Every value is Berto's own number;
 * `null` means he hasn't given it yet. A null shows as a marked "To fill"
 * placeholder everywhere except production, where it's left out, so a
 * placeholder can never go live under his name.
 */

const CHECK_INS = 320;

/** Total spend for the year, in CAD. Self-funded (Berto, 2026-11-01). */
const TOTAL_SPEND: number | null = null;

const PARTNERS: Array<{ name: string; role: string; terms: string | null }> = [
  { name: "New Stadium", role: "Venue for the monthly meetups", terms: null },
  { name: "Toronto Metropolitan University", role: "Venue for the workshops", terms: null },
  { name: "MuleRun", role: "Partner on the AI hackathon night", terms: null },
];

/** makerslounge.ca, the platform the events run on. */
const PLATFORM: Array<{ label: string; value: string | null }> = [
  { label: "Members on makerslounge.ca", value: null },
  { label: "Who-to-meet matches suggested", value: null },
  { label: "Active in the last 30 days", value: null },
];

// .env.local carries VERCEL_ENV=production from `vercel env pull`, so NODE_ENV is
// what tells local dev apart from the live build.
const DRAFT = process.env.NODE_ENV !== "production" || process.env.VERCEL_ENV === "preview";

export function MakersLoungeOutcomes() {
  const spend = TOTAL_SPEND === null ? null : `$${TOTAL_SPEND.toLocaleString("en-CA")}`;
  const perCheckIn = TOTAL_SPEND === null ? null : `$${(TOTAL_SPEND / CHECK_INS).toFixed(2)}`;

  const money = [
    { label: "Total spend, self-funded", value: spend },
    { label: `Per check-in (${CHECK_INS} check-ins)`, value: perCheckIn },
    { label: "Partners", value: String(PARTNERS.length) },
  ].filter((m) => DRAFT || m.value !== null);
  const platform = PLATFORM.filter((p) => DRAFT || p.value !== null);

  return (
    <section id="budget-and-outcomes" className="mt-16 scroll-mt-24">
      <h2 className="font-display text-3xl leading-tight font-medium tracking-tight sm:text-4xl">
        What it cost, and what it built
      </h2>

      {money.length > 0 && (
        <dl className="mt-6 grid gap-3 sm:grid-cols-3">
          {money.map((m, i) => (
            <div key={m.label} className={cn("rounded-2xl p-5", TINTS[i % TINTS.length])}>
              <dd className="font-display text-3xl font-medium tracking-tight">
                {m.value ?? <Placeholder />}
              </dd>
              <dt className="mt-1 text-sm leading-snug text-foreground/70">{m.label}</dt>
            </div>
          ))}
        </dl>
      )}

      <h3 className="mt-10 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">Partners</h3>
      <ul className="mt-3 flex flex-col">
        {PARTNERS.map((p) => (
          <li key={p.name} className="flex flex-col gap-1 border-t border-border/60 py-4 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
            <div>
              <p className="font-display text-xl font-medium tracking-tight">{p.name}</p>
              <p className="text-[15px] text-muted-foreground">{p.role}</p>
            </div>
            {(p.terms || DRAFT) && (
              <p className="text-[15px] sm:text-right">{p.terms ?? <Placeholder label="the deal" />}</p>
            )}
          </li>
        ))}
      </ul>

      {platform.length > 0 && (
        <>
          <h3 className="mt-10 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            The platform
          </h3>
          <dl className="mt-3 grid gap-3 sm:grid-cols-3">
            {platform.map((p, i) => (
              <div key={p.label} className={cn("rounded-2xl p-5", TINTS[(i + 3) % TINTS.length])}>
                <dd className="font-display text-3xl font-medium tracking-tight">{p.value ?? <Placeholder />}</dd>
                <dt className="mt-1 text-sm leading-snug text-foreground/70">{p.label}</dt>
              </div>
            ))}
          </dl>
        </>
      )}

      <SiteLink
        href="/work/makerslounge/playbook"
        className="group mt-12 flex items-center justify-between gap-6 rounded-3xl bg-[var(--tint-2)] p-6 sm:p-8"
      >
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Free playbook</p>
          <p className="font-display mt-2 text-2xl font-medium tracking-tight sm:text-3xl">
            Copy how I run it
          </p>
          <p className="mt-2 text-[15px] leading-relaxed text-foreground/75">
            Four formats, a run-of-show, the approval rule, the 48-hour follow-up, and what to fund or cut.
          </p>
        </div>
        <ArrowRightIcon className="size-6 shrink-0 transition-transform group-hover:translate-x-1" />
      </SiteLink>
    </section>
  );
}

function Placeholder({ label = "number" }: { label?: string }) {
  return (
    <span className="inline-block rounded-full border border-dashed border-primary px-2.5 py-0.5 font-mono text-xs font-normal tracking-normal text-primary">
      To fill: {label}
    </span>
  );
}
