"use client";

import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, XAxis, YAxis } from "recharts";
import { MailIcon, ExternalLinkIcon } from "lucide-react";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { cn } from "@/lib/utils";

/**
 * The newsletter list, inside Cael.
 *
 * Read-only on purpose: it answers "who's subscribed and is that growing", and
 * offers no way to email or remove anyone. Sending stays in Resend, where the
 * confirm steps and the audit trail already live.
 */

interface Subscriber {
  id: string;
  email: string;
  createdAt: string;
  unsubscribed: boolean;
}

interface Payload {
  subscribers: Subscriber[];
  total: number;
  active: number;
  unsubscribed: number;
}

const chartConfig = {
  count: { label: "Subscribers", color: "var(--primary)" },
} satisfies ChartConfig;

function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function NewsletterPanel() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/newsletter/subscribers")
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.error ?? "Couldn't load subscribers.");
        return body as Payload;
      })
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Something went wrong."));
    return () => {
      cancelled = true;
    };
  }, []);

  // Cumulative total per day the list actually changed. Growth reads as a line
  // that only goes up, which is the honest shape for a subscriber count.
  const growth = useMemo(() => {
    if (!data?.subscribers.length) return [];
    const byDay = new Map<string, number>();
    for (const s of data.subscribers) {
      const day = s.createdAt.slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + 1);
    }
    let running = 0;
    return [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, added]) => ({ day, count: (running += added) }));
  }, [data]);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">Loading subscribers…</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto p-4 sm:p-6">
      <div className="flex items-center gap-2.5">
        <MailIcon className="size-4 text-primary" />
        <h1 className="font-medium tracking-tight">Newsletter</h1>
        <a
          href="https://resend.com/audiences"
          target="_blank"
          rel="noreferrer"
          className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Send in Resend
          <ExternalLinkIcon className="size-3" />
        </a>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3">
        <Stat value={data.active} label="Subscribed" emphasis />
        <Stat value={data.unsubscribed} label="Unsubscribed" />
        <Stat value={data.total} label="All time" />
      </div>

      {growth.length > 1 && (
        <div className="mt-6">
          <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Growth</p>
          <ChartContainer config={chartConfig} className="h-36 w-full">
            <AreaChart data={growth} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <XAxis dataKey="day" hide />
              <YAxis hide domain={[0, "dataMax"]} />
              <ChartTooltip
                content={<ChartTooltipContent labelFormatter={(v) => formatDay(String(v))} />}
              />
              <Area
                type="monotone"
                dataKey="count"
                stroke="var(--color-count)"
                fill="var(--color-count)"
                fillOpacity={0.12}
                strokeWidth={2}
              />
            </AreaChart>
          </ChartContainer>
        </div>
      )}

      <p className="mt-7 mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
        Subscribers
      </p>
      {data.subscribers.length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">
          Nobody yet. The signup lives at bertomill.com/newsletter.
        </p>
      ) : (
        <ul className="divide-y divide-border/60">
          {data.subscribers.map((s) => (
            <li key={s.id} className="flex items-baseline gap-3 py-2.5">
              <span className={cn("truncate text-sm", s.unsubscribed && "text-muted-foreground line-through")}>
                {s.email}
              </span>
              {s.unsubscribed && (
                <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  left
                </span>
              )}
              <span className="ml-auto shrink-0 font-mono text-xs text-muted-foreground">
                {formatDay(s.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({ value, label, emphasis }: { value: number; label: string; emphasis?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div
        className={cn(
          "font-mono text-xl font-semibold tracking-tight tabular-nums",
          emphasis && "text-primary",
        )}
      >
        {value.toLocaleString()}
      </div>
      <div className="mt-0.5 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
