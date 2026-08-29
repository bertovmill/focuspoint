"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyboardIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Sparkline } from "@/app/_components/sparkline";
import { usePolling } from "@/app/_components/use-polling";
import type { KeystrokeSummary } from "@/lib/keystrokes";

/**
 * Keystrokes today — how much Berto actually typed, counted by the local macOS agent.
 *
 * A volume metric only: the counter never records which keys, just how many. The big
 * number is today; the sparkline is the last fourteen days so a quiet day is obvious
 * next to a heads-down one.
 */
export function KeystrokesCard() {
  const [data, setData] = useState<KeystrokeSummary | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/keystrokes");
      if (res.ok) setData(await res.json());
    } catch {
      // Silent: the card just keeps its last good numbers.
    }
  }, []);

  usePolling(load);

  if (!data) return null;

  return (
    <div className="mb-6">
      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-widest mb-3">Keystrokes</p>
      <Card className="rounded-xl shadow-none px-5 py-4 gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <KeyboardIcon className="size-3.5" />
              Typed today
            </span>
            <span className="mt-0.5 block text-3xl font-semibold tabular-nums leading-none">
              {data.todayCount.toLocaleString("en-CA")}
            </span>
          </div>
          {data.hasData && (
            <div className="text-right text-[11px] text-muted-foreground leading-tight">
              <span className="block">{data.dailyAverage.toLocaleString("en-CA")}/day avg</span>
              <span className="block">{data.windowTotal.toLocaleString("en-CA")} in 14d</span>
            </div>
          )}
        </div>

        {data.hasData ? (
          <Sparkline data={data.recent} unit="keys" mode="last" />
        ) : (
          <p className="text-[11px] text-muted-foreground/70 italic">
            No keystrokes counted yet — set up the local counter in <span className="font-mono">keystroke-agent/</span>.
          </p>
        )}
      </Card>
    </div>
  );
}
