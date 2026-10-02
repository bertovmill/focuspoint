"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDownIcon, RotateCcwIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { MEAL_SLOTS, shortDayLabel, type MealSlot } from "@/lib/nutrition";
import { cn } from "@/lib/utils";

type Guidance = Record<MealSlot, string>;
type Config = {
  template: string;
  guidance: Guidance;
  updated_at: string | null;
  is_default: boolean;
  defaults: { template: string; guidance: Guidance };
  variables: { name: string; description: string }[];
};
type Preview = { prompt: string; model: string; output_fields: { name: string; description: string }[] };

const ANCHOR = "meal-prompt";
const PREVIEW_DEBOUNCE_MS = 600;

/**
 * /meals#meal-prompt — the whole prompt behind every meal suggestion, editable.
 * Left: the template (with {{placeholders}} for live data) and a guidance line
 * per sitting. Right: the exact prompt a chosen cell would be sent, rebuilt
 * from the unsaved draft as he types. Saved to app_settings (lib/meal-prompt.ts).
 */
export function MealPromptEditor({ days, today }: { days: string[]; today: string }) {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<Config | null>(null);
  const [template, setTemplate] = useState("");
  const [guidance, setGuidance] = useState<Guidance>({ lunch: "", snack: "", dinner: "" });
  const [saving, setSaving] = useState(false);
  const [previewDate, setPreviewDate] = useState(today);
  const [previewSlot, setPreviewSlot] = useState<MealSlot>("dinner");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const templateRef = useRef<HTMLTextAreaElement>(null);

  // Open when the URL points here (the header's "Prompt" link, or a shared /meals#meal-prompt).
  useEffect(() => {
    const sync = () => {
      if (window.location.hash !== `#${ANCHOR}`) return;
      setOpen(true);
      // The section mounts after the week loads, so the browser's own jump missed it.
      requestAnimationFrame(() => document.getElementById(ANCHOR)?.scrollIntoView({ block: "start" }));
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  useEffect(() => {
    if (!open || config) return;
    fetch("/api/meals/prompt")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((c: Config) => {
        setConfig(c);
        setTemplate(c.template);
        setGuidance(c.guidance);
      })
      .catch(() => toast.error("Couldn't load the meal prompt."));
  }, [open, config]);

  // Keep the preview day inside the week on screen.
  useEffect(() => {
    if (!days.includes(previewDate)) setPreviewDate(days.includes(today) ? today : days[0]);
  }, [days, today, previewDate]);

  // Rebuild the preview from the draft as it changes.
  useEffect(() => {
    if (!open || !config) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setPreviewing(true);
      try {
        const res = await fetch("/api/meals/prompt/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date: previewDate, slot: previewSlot, template, guidance }),
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error();
        setPreview(await res.json());
      } catch {
        if (!ctrl.signal.aborted) setPreview(null);
      } finally {
        if (!ctrl.signal.aborted) setPreviewing(false);
      }
    }, PREVIEW_DEBOUNCE_MS);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [open, config, template, guidance, previewDate, previewSlot]);

  const dirty =
    !!config && (template !== config.template || MEAL_SLOTS.some((s) => guidance[s.key] !== config.guidance[s.key]));
  const matchesDefaults =
    !!config &&
    template === config.defaults.template &&
    MEAL_SLOTS.every((s) => guidance[s.key] === config.defaults.guidance[s.key]);

  const insertVariable = (name: string) => {
    const el = templateRef.current;
    const token = `{{${name}}}`;
    if (!el) return setTemplate((t) => t + token);
    const { selectionStart: a, selectionEnd: b } = el;
    setTemplate((t) => t.slice(0, a) + token + t.slice(b));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(a + token.length, a + token.length);
    });
  };

  const save = async () => {
    if (!template.trim()) return toast.error("The prompt can't be empty.");
    setSaving(true);
    try {
      const res = await fetch("/api/meals/prompt", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template, guidance }),
      });
      if (!res.ok) throw new Error();
      const saved = await res.json();
      setConfig((c) => (c ? { ...c, ...saved } : c));
      toast.success("Prompt saved — the next suggestion uses it.");
    } catch {
      toast.error("Couldn't save the prompt.");
    } finally {
      setSaving(false);
    }
  };

  const resetToDefaults = async () => {
    if (!config) return;
    if (!window.confirm("Replace your prompt with the original default? Your edits will be lost.")) return;
    setSaving(true);
    try {
      const res = await fetch("/api/meals/prompt", { method: "DELETE" });
      if (!res.ok) throw new Error();
      const saved = await res.json();
      setConfig((c) => (c ? { ...c, ...saved } : c));
      setTemplate(saved.template);
      setGuidance(saved.guidance);
      toast.success("Back to the default prompt.");
    } catch {
      toast.error("Couldn't reset the prompt.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section id={ANCHOR} className="scroll-mt-4 rounded-lg border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
        aria-expanded={open}
      >
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Suggestion prompt</h2>
          <p className="text-xs text-muted-foreground">
            The exact instructions Cael sends the model for every ✨ and “Fill week”. See it, rewrite any of it.
          </p>
        </div>
        <ChevronDownIcon className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && !config && (
        <div className="flex justify-center border-t p-6">
          <Spinner className="size-4" />
        </div>
      )}

      {open && config && (
        <div className="grid gap-4 border-t p-3 lg:grid-cols-2">
          {/* Editor */}
          <div className="min-w-0 space-y-3">
            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <label htmlFor="meal-prompt-template" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Template
                </label>
                <span className="text-[11px] text-muted-foreground">
                  {dirty ? "Unsaved changes" : config.is_default ? "Using the default" : "Custom"}
                </span>
              </div>
              <textarea
                id="meal-prompt-template"
                ref={templateRef}
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
                spellCheck={false}
                className="min-h-[420px] w-full resize-y rounded-md border bg-transparent p-2.5 font-mono text-xs leading-relaxed"
              />
            </div>

            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Placeholders <span className="font-normal normal-case">— click to insert at the cursor</span>
              </p>
              <div className="flex flex-wrap gap-1">
                {config.variables.map((v) => (
                  <button
                    key={v.name}
                    type="button"
                    onClick={() => insertVariable(v.name)}
                    title={v.description}
                    className="rounded border bg-muted/40 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    {`{{${v.name}}}`}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Guidance per sitting <span className="font-normal normal-case">— fills {"{{guidance}}"}</span>
              </p>
              {MEAL_SLOTS.map((s) => (
                <div key={s.key} className="grid grid-cols-[52px_1fr] items-start gap-2">
                  <label htmlFor={`meal-guidance-${s.key}`} className="pt-1.5 text-xs font-medium">
                    {s.label}
                  </label>
                  <textarea
                    id={`meal-guidance-${s.key}`}
                    value={guidance[s.key]}
                    onChange={(e) => setGuidance((g) => ({ ...g, [s.key]: e.target.value }))}
                    rows={2}
                    className="w-full resize-y rounded-md border bg-transparent px-2 py-1.5 text-xs"
                  />
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" className="h-8 text-xs" disabled={!dirty || saving} onClick={save}>
                {saving ? <Spinner className="size-3" /> : "Save prompt"}
              </Button>
              {dirty && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-xs"
                  onClick={() => {
                    setTemplate(config.template);
                    setGuidance(config.guidance);
                  }}
                >
                  Discard changes
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto h-8 gap-1 text-xs text-muted-foreground"
                disabled={saving || (config.is_default && matchesDefaults)}
                onClick={resetToDefaults}
              >
                <RotateCcwIcon className="size-3" />
                Reset to default
              </Button>
            </div>
          </div>

          {/* Preview */}
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Preview for</span>
              <select
                className="h-7 rounded-md border bg-transparent px-1.5 text-xs"
                value={previewDate}
                onChange={(e) => setPreviewDate(e.target.value)}
                aria-label="Preview day"
              >
                {days.map((d) => (
                  <option key={d} value={d}>
                    {shortDayLabel(d)}
                    {d === today ? " (today)" : ""}
                  </option>
                ))}
              </select>
              <select
                className="h-7 rounded-md border bg-transparent px-1.5 text-xs"
                value={previewSlot}
                onChange={(e) => setPreviewSlot(e.target.value as MealSlot)}
                aria-label="Preview sitting"
              >
                {MEAL_SLOTS.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
              {previewing && <Spinner className="size-3" />}
            </div>
            <pre className="max-h-[640px] overflow-auto whitespace-pre-wrap break-words rounded-md border bg-muted/30 p-2.5 font-mono text-xs leading-relaxed">
              {preview?.prompt ?? (previewing ? "Building…" : "Couldn't build the preview.")}
            </pre>
            {preview && (
              <div className="space-y-1 text-[11px] text-muted-foreground">
                <p>
                  Sent to <span className="font-mono">{preview.model}</span>, which must answer with these fields (fixed — the
                  grid, protein totals and grocery list read them):
                </p>
                <ul className="space-y-0.5">
                  {preview.output_fields.map((f) => (
                    <li key={f.name}>
                      <span className="font-mono text-foreground">{f.name}</span>
                      {f.description && ` — ${f.description}`}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
