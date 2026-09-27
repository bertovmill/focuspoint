"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLinkIcon, PlusIcon, TrashIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { TARGETS, type CareerTarget } from "@/lib/career-research";
import { cn } from "@/lib/utils";

interface TrackedRow {
  id: number;
  company: string;
  role: string | null;
  url: string | null;
  contact_name: string | null;
  contact_title: string | null;
  status: string;
  next_step: string | null;
  next_date: string | null;
  notes: string | null;
}

const STATUSES = [
  { id: "target", label: "Target" },
  { id: "reached_out", label: "Reached out" },
  { id: "applied", label: "Applied" },
  { id: "screen", label: "Screen" },
  { id: "onsite", label: "Onsite" },
  { id: "offer", label: "Offer" },
  { id: "closed", label: "Closed" },
];

// Apollo masks surnames, so search LinkedIn on the first name plus company.
function linkedinSearch(name: string, company: string) {
  const first = name.split(" ")[0];
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(`${first} ${company}`)}`;
}

/** The job-search pipeline: companies moved from "target" to "offer", one row each. */
export function CareerTracker() {
  const [rows, setRows] = useState<TrackedRow[] | null>(null);
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/career");
    setRows(await res.json());
  }, []);
  useEffect(() => { load(); }, [load]);

  async function add(t: Partial<CareerTarget> & { company: string }) {
    const res = await fetch("/api/career", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...t,
        notes: t.tier ?? null,
        next_step: t.contact_name ? "Find on LinkedIn; short note citing Venice + 0→70" : "Apply once case studies are ready",
      }),
    });
    if (!res.ok) return toast.error("Couldn't add that one.");
    await load();
  }

  async function patch(id: number, body: Partial<TrackedRow>) {
    setRows((r) => r?.map((x) => (x.id === id ? { ...x, ...body } : x)) ?? null);
    await fetch(`/api/career/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  }

  async function remove(id: number) {
    setRows((r) => r?.filter((x) => x.id !== id) ?? null);
    await fetch(`/api/career/${id}`, { method: "DELETE" });
  }

  const tracked = new Set(rows?.map((r) => r.company.toLowerCase()));
  const suggestions = TARGETS.filter((t) => !tracked.has(t.company.toLowerCase()));
  const active = rows?.filter((r) => r.status !== "closed").length ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2 text-xs">
        {STATUSES.map((s) => (
          <span key={s.id} className="rounded-full border px-2.5 py-1">
            {s.label} <span className="text-muted-foreground">· {rows?.filter((r) => r.status === s.id).length ?? 0}</span>
          </span>
        ))}
      </div>

      {rows === null ? (
        <Skeleton className="h-24" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing tracked yet. Add companies from the suggestions below.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((r) => (
            <Card key={r.id} className={cn("gap-2 p-3", r.status === "closed" && "opacity-60")}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium">
                    {r.company}
                    {r.notes && <span className="ms-2 text-xs font-normal text-muted-foreground">{r.notes}</span>}
                  </div>
                  {r.role && (
                    r.url ? (
                      <a href={r.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs hover:underline">
                        {r.role} <ExternalLinkIcon className="size-3" />
                      </a>
                    ) : <div className="text-xs">{r.role}</div>
                  )}
                  {r.contact_name && (
                    <a href={linkedinSearch(r.contact_name, r.company)} target="_blank" rel="noreferrer" className="block text-xs text-muted-foreground hover:underline">
                      {r.contact_name} · {r.contact_title}
                    </a>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <select
                    value={r.status}
                    onChange={(e) => patch(r.id, { status: e.target.value })}
                    className="rounded-md border bg-background px-2 py-1 text-xs"
                  >
                    {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                  <Button variant="ghost" size="icon" className="size-7" onClick={() => remove(r.id)} aria-label="Remove">
                    <TrashIcon className="size-3.5" />
                  </Button>
                </div>
              </div>
              <div className="flex gap-2">
                <Input
                  defaultValue={r.next_step ?? ""}
                  placeholder="Next step"
                  className="h-8 text-xs"
                  onBlur={(e) => e.target.value !== (r.next_step ?? "") && patch(r.id, { next_step: e.target.value })}
                />
                <Input
                  type="date"
                  defaultValue={r.next_date?.slice(0, 10) ?? ""}
                  className="h-8 w-36 text-xs"
                  onChange={(e) => e.target.value && patch(r.id, { next_date: e.target.value })}
                />
              </div>
            </Card>
          ))}
        </div>
      )}

      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!company.trim()) return;
          await add({ company: company.trim(), role: role.trim() || null });
          setCompany(""); setRole("");
        }}
      >
        <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company" className="h-8 text-xs" />
        <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Role (optional)" className="h-8 text-xs" />
        <Button type="submit" size="sm" className="h-8"><PlusIcon className="size-3.5" /> Add</Button>
      </form>

      {suggestions.length > 0 && (
        <div id="suggested-targets">
          <div className="mb-2 text-xs text-muted-foreground">
            Suggested targets ({suggestions.length}) · {active} active. Contacts are from Apollo; surnames are masked, and clicking a name searches LinkedIn.
          </div>
          <div className="flex flex-col divide-y rounded-lg border">
            {suggestions.map((t) => (
              <div key={t.company} className="flex items-center justify-between gap-2 px-3 py-2">
                <div className="min-w-0 text-xs">
                  <span className="font-medium">{t.company}</span>
                  <span className="ms-2 text-muted-foreground">{t.tier}</span>
                  <div className="truncate text-muted-foreground">
                    {[t.role, t.contact_name && `${t.contact_name} · ${t.contact_title}`].filter(Boolean).join(" — ")}
                  </div>
                </div>
                <Button variant="outline" size="sm" className="h-7 shrink-0 text-xs" onClick={() => add(t)}>
                  <PlusIcon className="size-3" /> Track
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
