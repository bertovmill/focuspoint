"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLinkIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { Capability, Portfolio, PortfolioProject } from "@/lib/portfolio";
import { cn } from "@/lib/utils";

const PUBLIC_URL = "https://bertomill.com/capabilities";

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Couldn't save");
  return data as T;
}

/**
 * The editor for bertomill.com/capabilities, inside the Career tab. Capabilities
 * and projects live in the database (lib/portfolio.ts); Cael edits the same rows
 * through list_portfolio / save_capability / save_portfolio_project.
 */
export function PortfolioEditor() {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openProject, setOpenProject] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/portfolio");
    if (res.ok) setPortfolio(await res.json());
    else setError("Couldn't load the portfolio.");
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!portfolio) return <p className="text-sm text-muted-foreground">{error ?? "Loading…"}</p>;

  return (
    <div className="flex flex-col gap-6">
      <a href={PUBLIC_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline">
        bertomill.com/capabilities <ExternalLinkIcon className="size-3" />
      </a>
      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Capabilities</h3>
        {portfolio.capabilities.map((c) => (
          <CapabilityRow key={c.id} capability={c} onSaved={load} onError={setError} />
        ))}
        <CapabilityRow onSaved={load} onError={setError} />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Projects</h3>
          <Button size="sm" variant="ghost" onClick={() => setOpenProject("new")}>
            <PlusIcon className="size-3.5" /> Project
          </Button>
        </div>
        {openProject === "new" && (
          <ProjectForm
            capabilities={portfolio.capabilities}
            onClose={() => setOpenProject(null)}
            onSaved={async () => {
              setOpenProject(null);
              await load();
            }}
            onError={setError}
          />
        )}
        {portfolio.projects.map((p) =>
          openProject === p.slug ? (
            <ProjectForm
              key={p.id}
              project={p}
              capabilities={portfolio.capabilities}
              onClose={() => setOpenProject(null)}
              onSaved={async () => {
                setOpenProject(null);
                await load();
              }}
              onError={setError}
            />
          ) : (
            <button key={p.id} onClick={() => setOpenProject(p.slug)} className="text-left">
              <Card className="gap-1 p-3 hover:bg-muted/50">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{p.name}</span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[11px]",
                      p.status === "published" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {p.status}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {p.capabilities.map((l) => l.capabilityName).join(" · ") || "No capabilities linked"}
                </p>
              </Card>
            </button>
          ),
        )}
      </div>
    </div>
  );
}

function CapabilityRow({
  capability,
  onSaved,
  onError,
}: {
  capability?: Capability;
  onSaved: () => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const [name, setName] = useState(capability?.name ?? "");
  const [summary, setSummary] = useState(capability?.summary ?? "");
  const [saving, setSaving] = useState(false);
  const dirty = name !== (capability?.name ?? "") || summary !== (capability?.summary ?? "");

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await post("/api/portfolio/capabilities", { slug: capability?.slug, name, summary });
      onError(null);
      if (!capability) {
        setName("");
        setSummary("");
      }
      await onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!capability || !confirm(`Delete "${capability.name}"? Every project's link to it goes too.`)) return;
    await fetch(`/api/portfolio/capabilities/${capability.id}`, { method: "DELETE" });
    await onSaved();
  }

  return (
    <Card className="gap-2 p-3">
      <div className="flex items-center gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={capability ? "Name" : "New capability…"} className="h-8 text-sm font-medium" />
        {capability && (
          <Button size="icon" variant="ghost" onClick={remove} aria-label={`Delete ${capability.name}`}>
            <Trash2Icon className="size-3.5" />
          </Button>
        )}
      </div>
      {(capability || name) && (
        <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="What this means in practice" rows={2} className="text-xs" />
      )}
      {dirty && name.trim() && (
        <Button size="sm" onClick={save} disabled={saving} className="self-end">
          {saving ? "Saving…" : capability ? "Save" : "Add"}
        </Button>
      )}
    </Card>
  );
}

function ProjectForm({
  project,
  capabilities,
  onClose,
  onSaved,
  onError,
}: {
  project?: PortfolioProject;
  capabilities: Capability[];
  onClose: () => void;
  onSaved: () => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const [name, setName] = useState(project?.name ?? "");
  const [summary, setSummary] = useState(project?.summary ?? "");
  const [year, setYear] = useState(project?.year ?? "");
  const [liveUrl, setLiveUrl] = useState(project?.liveUrl ?? "");
  const [repoUrl, setRepoUrl] = useState(project?.repoUrl ?? "");
  const [workSlug, setWorkSlug] = useState(project?.workSlug ?? "");
  const [published, setPublished] = useState(project?.status === "published");
  const [evidence, setEvidence] = useState<Record<string, string>>(
    Object.fromEntries((project?.capabilities ?? []).map((l) => [l.capabilitySlug, l.evidence])),
  );
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await post("/api/portfolio/projects", {
        slug: project?.slug,
        name,
        summary,
        year: year || null,
        liveUrl: liveUrl || null,
        repoUrl: repoUrl || null,
        workSlug: workSlug || null,
        status: published ? "published" : "draft",
        capabilities: Object.entries(evidence).map(([slug, text]) => ({ slug, evidence: text })),
      });
      onError(null);
      await onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!project || !confirm(`Delete "${project.name}" from the portfolio?`)) return;
    await fetch(`/api/portfolio/projects/${project.id}`, { method: "DELETE" });
    await onSaved();
  }

  return (
    <Card className="gap-3 p-4">
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Project name" className="font-medium" />
      <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="What it is and who uses it" rows={2} className="text-sm" />
      <div className="grid gap-2 sm:grid-cols-2">
        <Input value={year} onChange={(e) => setYear(e.target.value)} placeholder="Year, e.g. 2026" className="text-sm" />
        <Input value={workSlug} onChange={(e) => setWorkSlug(e.target.value)} placeholder="Case study slug (/work/…)" className="text-sm" />
        <Input value={liveUrl} onChange={(e) => setLiveUrl(e.target.value)} placeholder="Live URL" className="text-sm" />
        <Input value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} placeholder="Repo URL" className="text-sm" />
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium text-muted-foreground">Capabilities it proves — say how, concretely</p>
        {capabilities.map((c) => {
          const on = c.slug in evidence;
          return (
            <div key={c.id} className="flex flex-col gap-1">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={on}
                  onCheckedChange={(checked) =>
                    setEvidence((prev) => {
                      const next = { ...prev };
                      if (checked) next[c.slug] = next[c.slug] ?? "";
                      else delete next[c.slug];
                      return next;
                    })
                  }
                />
                {c.name}
              </label>
              {on && (
                <Textarea
                  value={evidence[c.slug]}
                  onChange={(e) => setEvidence((prev) => ({ ...prev, [c.slug]: e.target.value }))}
                  placeholder={`How ${name || "this project"} shows ${c.name}`}
                  rows={2}
                  className="ms-6 w-auto text-xs"
                />
              )}
            </div>
          );
        })}
      </div>

      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={published} onCheckedChange={(checked) => setPublished(checked === true)} />
        Published on bertomill.com
      </label>

      <div className="flex items-center justify-between gap-2">
        {project ? (
          <Button size="sm" variant="ghost" onClick={remove} className="text-destructive">
            <Trash2Icon className="size-3.5" /> Delete
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={save} disabled={saving || !name.trim()}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
