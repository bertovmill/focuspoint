"use client";

import { useState, useEffect, useCallback } from "react";
import { PlusIcon, TrashIcon, BookOpenIcon, ChevronLeftIcon } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";

type FieldType = "text" | "textarea" | "number" | "date" | "rating";

interface TemplateField {
  id: string;
  label: string;
  type: FieldType;
}

interface JournalTemplate {
  id: number;
  name: string;
  fields: TemplateField[];
  created_at: string;
}

interface JournalEntry {
  id: number;
  template_id: number;
  data: Record<string, string>;
  created_at: string;
}

const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: "Short text",
  textarea: "Long text",
  number: "Number",
  date: "Date",
  rating: "Rating (1–5)",
};

function newFieldId() {
  return `f_${Math.random().toString(36).slice(2, 10)}`;
}

export function JournalTemplatesPanel() {
  const [templates, setTemplates] = useState<JournalTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<JournalTemplate | null>(null);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Builder dialog state
  const [builderOpen, setBuilderOpen] = useState(false);
  const [builderName, setBuilderName] = useState("");
  const [builderFields, setBuilderFields] = useState<TemplateField[]>([
    { id: newFieldId(), label: "", type: "textarea" },
  ]);
  const [creating, setCreating] = useState(false);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/journal-templates");
      if (res.ok) setTemplates(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const openTemplate = useCallback(async (template: JournalTemplate) => {
    setSelected(template);
    setFormValues({});
    setEntriesLoading(true);
    try {
      const res = await fetch(`/api/journal-entries?template_id=${template.id}`);
      if (res.ok) setEntries(await res.json());
    } finally {
      setEntriesLoading(false);
    }
  }, []);

  const backToList = () => {
    setSelected(null);
    setEntries([]);
    setFormValues({});
  };

  const addBuilderField = () => {
    setBuilderFields((f) => [...f, { id: newFieldId(), label: "", type: "text" }]);
  };

  const removeBuilderField = (id: string) => {
    setBuilderFields((f) => f.filter((field) => field.id !== id));
  };

  const updateBuilderField = (id: string, patch: Partial<TemplateField>) => {
    setBuilderFields((f) => f.map((field) => (field.id === id ? { ...field, ...patch } : field)));
  };

  const resetBuilder = () => {
    setBuilderName("");
    setBuilderFields([{ id: newFieldId(), label: "", type: "textarea" }]);
  };

  const handleCreateTemplate = async () => {
    const name = builderName.trim();
    const fields = builderFields
      .map((f) => ({ ...f, label: f.label.trim() }))
      .filter((f) => f.label.length > 0);
    if (!name) {
      toast.error("Give your template a name");
      return;
    }
    if (fields.length === 0) {
      toast.error("Add at least one field");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/journal-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, fields }),
      });
      if (!res.ok) throw new Error();
      const template = await res.json();
      setTemplates((prev) => [template, ...prev]);
      setBuilderOpen(false);
      resetBuilder();
      toast.success("Template created");
    } catch {
      toast.error("Failed to create template");
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteTemplate = async (id: number) => {
    const prev = templates;
    setTemplates((t) => t.filter((tpl) => tpl.id !== id));
    if (selected?.id === id) backToList();
    try {
      const res = await fetch(`/api/journal-templates/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
    } catch {
      setTemplates(prev);
      toast.error("Failed to delete template");
    }
  };

  const handleSaveEntry = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch("/api/journal-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template_id: selected.id, data: formValues }),
      });
      if (!res.ok) throw new Error();
      const entry = await res.json();
      setEntries((prev) => [entry, ...prev]);
      setFormValues({});
      toast.success("Entry saved");
    } catch {
      toast.error("Failed to save entry");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEntry = async (id: number) => {
    const prev = entries;
    setEntries((e) => e.filter((entry) => entry.id !== id));
    try {
      const res = await fetch(`/api/journal-entries/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
    } catch {
      setEntries(prev);
      toast.error("Failed to delete entry");
    }
  };

  // ---- Filling out a selected template ----
  if (selected) {
    return (
      <div className="space-y-5">
        <button
          onClick={backToList}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeftIcon className="size-4" />
          All templates
        </button>

        <div>
          <h2 className="text-sm font-medium mb-3">{selected.name}</h2>
          <Card className="p-4 space-y-3">
            {selected.fields.map((field) => (
              <div key={field.id} className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">{field.label}</label>
                {field.type === "textarea" ? (
                  <Textarea
                    value={formValues[field.id] ?? ""}
                    onChange={(e) => setFormValues((v) => ({ ...v, [field.id]: e.target.value }))}
                    rows={3}
                  />
                ) : field.type === "rating" ? (
                  <div className="flex gap-1.5">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setFormValues((v) => ({ ...v, [field.id]: String(n) }))}
                        className={
                          "size-8 rounded-full border text-sm font-medium transition-colors " +
                          (Number(formValues[field.id]) === n
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border text-muted-foreground hover:border-primary/50")
                        }
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                ) : (
                  <Input
                    type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
                    value={formValues[field.id] ?? ""}
                    onChange={(e) => setFormValues((v) => ({ ...v, [field.id]: e.target.value }))}
                  />
                )}
              </div>
            ))}
            <Button onClick={handleSaveEntry} disabled={saving} className="w-full">
              {saving ? "Saving…" : "Save entry"}
            </Button>
          </Card>
        </div>

        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Past entries</p>
          {entriesLoading ? (
            <div className="space-y-2">
              {[1, 2].map((i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
            </div>
          ) : entries.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No entries yet — fill out the form above.</p>
          ) : (
            <div className="space-y-2">
              {entries.map((entry) => (
                <Card key={entry.id} className="p-3 group relative">
                  <p className="text-xs text-muted-foreground mb-1.5">
                    {new Date(entry.created_at).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                  <div className="space-y-1.5">
                    {selected.fields.map((field) => {
                      const value = entry.data?.[field.id];
                      if (!value) return null;
                      return (
                        <div key={field.id}>
                          <p className="text-xs font-medium text-muted-foreground">{field.label}</p>
                          <p className="text-sm whitespace-pre-wrap">{value}</p>
                        </div>
                      );
                    })}
                  </div>
                  <button
                    onClick={() => handleDeleteEntry(entry.id)}
                    className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                    aria-label="Delete entry"
                  >
                    <TrashIcon className="size-3.5" />
                  </button>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---- Templates list ----
  return (
    <div className="space-y-5">
      <Dialog
        open={builderOpen}
        onOpenChange={(open) => {
          setBuilderOpen(open);
          if (!open) resetBuilder();
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New journal template</DialogTitle>
            <DialogDescription>Design the questions you want to answer each time you journal.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder="Template name (e.g. Evening Reflection)"
              value={builderName}
              onChange={(e) => setBuilderName(e.target.value)}
            />
            <div className="space-y-3">
              {builderFields.map((field, i) => (
                <div key={field.id} className="flex items-center gap-2">
                  <Input
                    placeholder={`Field ${i + 1} label`}
                    value={field.label}
                    onChange={(e) => updateBuilderField(field.id, { label: e.target.value })}
                    className="flex-1"
                  />
                  <Select
                    value={field.type}
                    onValueChange={(v) => updateBuilderField(field.id, { type: v as FieldType })}
                  >
                    <SelectTrigger className="w-36 shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(FIELD_TYPE_LABELS) as FieldType[]).map((t) => (
                        <SelectItem key={t} value={t}>{FIELD_TYPE_LABELS[t]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => removeBuilderField(field.id)}
                    disabled={builderFields.length === 1}
                    aria-label="Remove field"
                  >
                    <TrashIcon className="size-3.5" />
                  </Button>
                </div>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={addBuilderField} className="gap-1.5">
              <PlusIcon className="size-3.5" />
              Add field
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBuilderOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateTemplate} disabled={creating}>
              {creating ? "Creating…" : "Create template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Button onClick={() => setBuilderOpen(true)} className="w-full gap-1.5">
        <PlusIcon className="size-4" />
        New template
      </Button>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
        </div>
      ) : templates.length === 0 ? (
        <Empty className="py-12">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BookOpenIcon className="size-5" />
            </EmptyMedia>
            <EmptyTitle>No templates yet</EmptyTitle>
            <EmptyDescription>Create a journal template to start filling it out.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="space-y-2">
          {templates.map((template) => (
            <Card
              key={template.id}
              className="p-3.5 flex items-center gap-3 cursor-pointer hover:bg-muted/40 transition-colors group"
              onClick={() => openTemplate(template)}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{template.name}</p>
                <Badge variant="outline" className="mt-1 text-xs">
                  {template.fields.length} field{template.fields.length !== 1 ? "s" : ""}
                </Badge>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button
                    onClick={(e) => e.stopPropagation()}
                    className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                    aria-label="Delete template"
                  >
                    <TrashIcon className="size-4" />
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete "{template.name}"?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will also delete all entries saved under this template. This can't be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => handleDeleteTemplate(template.id)}>Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
