"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  CopyIcon,
  ListFilterIcon,
  PencilIcon,
  PlusIcon,
  Rows3Icon,
  TrashIcon,
  XIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  FIELD_LABEL,
  GROUP_LABEL,
  OPS,
  SORTABLE_FIELDS,
  defaultRule,
  fieldKind,
  ruleSummary,
  selectOptions,
  type FilterField,
  type FilterRule,
  type GroupBy,
  type SortRule,
  type TaskView,
} from "@/lib/task-views";
import { cn } from "@/lib/utils";

/**
 * The Notion-style controls above the Tasks table: view tabs, the filter chips,
 * the sort builder and Group by. All state lives in <TaskTable>; these only render
 * it and report changes.
 */

const FILTER_FIELDS: FilterField[] = ["status", "priority", "category", "due_date", "recurrence", "created_at", "title"];

// ---- View tabs --------------------------------------------------------------

export function ViewTabs({
  views,
  activeId,
  onSelect,
  onAdd,
  onRename,
  onDuplicate,
  onDelete,
}: {
  views: TaskView[];
  activeId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRename: (id: string, name: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const lastCount = useRef(views.length);
  // A tab just added with "+" opens straight into rename, like Notion.
  useEffect(() => {
    if (views.length > lastCount.current) {
      const v = views[views.length - 1];
      setDraft(v.name);
      setRenaming(v.id);
    }
    lastCount.current = views.length;
  }, [views]);

  function commit(id: string) {
    const name = draft.trim();
    if (name) onRename(id, name);
    setRenaming(null);
  }

  return (
    <div role="tablist" aria-label="Task views" className="flex min-w-0 flex-wrap items-center gap-0.5">
      {views.map((v) => {
        const active = v.id === activeId;
        if (renaming === v.id) {
          return (
            <Input
              key={v.id}
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => commit(v.id)}
              onFocus={(e) => e.target.select()}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit(v.id);
                if (e.key === "Escape") setRenaming(null);
              }}
              aria-label="View name"
              className="h-7 w-32 text-xs"
            />
          );
        }
        return (
          <div
            key={v.id}
            className={cn(
              "group flex h-7 items-center rounded-md text-xs",
              active ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            <button
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onSelect(v.id)}
              onDoubleClick={() => {
                setDraft(v.name);
                setRenaming(v.id);
              }}
              className={cn("h-full px-2.5", active && "pr-1")}
            >
              {v.name}
            </button>
            {active && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label={`${v.name} view options`}
                    className="mr-1 rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
                  >
                    <ChevronDownIcon className="size-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-40" onCloseAutoFocus={(e) => e.preventDefault()}>
                  <DropdownMenuItem
                    className="text-xs"
                    onSelect={() => {
                      setDraft(v.name);
                      window.setTimeout(() => setRenaming(v.id), 0);
                    }}
                  >
                    <PencilIcon className="size-3.5" />
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-xs" onSelect={() => onDuplicate(v.id)}>
                    <CopyIcon className="size-3.5" />
                    Duplicate view
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    className="text-xs"
                    disabled={views.length <= 1}
                    onSelect={() => onDelete(v.id)}
                  >
                    <TrashIcon className="size-3.5" />
                    Delete view
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        );
      })}
      <Button variant="ghost" size="icon" className="size-7 text-muted-foreground" onClick={onAdd} aria-label="Add a view">
        <PlusIcon className="size-3.5" />
      </Button>
    </div>
  );
}

// ---- Filters ----------------------------------------------------------------

export function AddFilterButton({
  onAdd,
  label = "Filter",
  className,
}: {
  onAdd: (rule: FilterRule) => void;
  label?: string;
  className?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className={cn("h-8 gap-1.5 px-2 text-xs text-muted-foreground", className)}>
          {label === "Filter" ? <ListFilterIcon className="size-3.5" /> : <PlusIcon className="size-3.5" />}
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-40" onCloseAutoFocus={(e) => e.preventDefault()}>
        <DropdownMenuLabel className="text-xs text-muted-foreground">Filter by</DropdownMenuLabel>
        {FILTER_FIELDS.map((f) => (
          <DropdownMenuItem key={f} className="text-xs" onSelect={() => onAdd(defaultRule(f))}>
            {FIELD_LABEL[f]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function FilterChip({
  rule,
  defaultOpen,
  onChange,
  onRemove,
}: {
  rule: FilterRule;
  defaultOpen?: boolean;
  onChange: (rule: FilterRule) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  // A rule just picked from "+ Filter" opens itself, once that menu has finished
  // closing (opening it any sooner, the menu's close counts as an outside click).
  useEffect(() => {
    if (!defaultOpen) return;
    const id = window.setTimeout(() => setOpen(true), 150);
    return () => window.clearTimeout(id);
  }, [defaultOpen]);
  const kind = fieldKind(rule.field);
  const ops = OPS[kind];
  const op = ops.find((o) => o.value === rule.op);
  const active =
    kind === "select" ? (rule.values ?? []).length > 0 : kind === "text" ? Boolean(rule.value) : !op?.needsValue || Boolean(rule.value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-7 max-w-72 items-center gap-1 rounded-full border px-2.5 text-xs",
            active ? "border-primary/40 bg-primary/5 text-primary" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <span className="truncate">{ruleSummary(rule)}</span>
          <ChevronDownIcon className="size-3 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        <div className="mb-2 flex items-center gap-1.5">
          <span className="text-xs font-medium">{FIELD_LABEL[rule.field]}</span>
          <Select value={rule.op} onValueChange={(v) => onChange({ ...rule, op: v })}>
            <SelectTrigger size="sm" className="h-7 flex-1 border-0 px-1.5 text-xs shadow-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ops.map((o) => (
                <SelectItem key={o.value} value={o.value} className="text-xs">
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="ghost" size="icon" className="size-7" onClick={onRemove} aria-label="Delete filter">
            <TrashIcon className="size-3.5" />
          </Button>
        </div>
        {kind === "select" && (
          <div className="flex flex-col">
            {selectOptions(rule.field).map((o) => {
              const checked = (rule.values ?? []).includes(o.value);
              return (
                <label
                  key={o.value}
                  className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-muted"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(c) =>
                      onChange({
                        ...rule,
                        values: c ? [...(rule.values ?? []), o.value] : (rule.values ?? []).filter((v) => v !== o.value),
                      })
                    }
                  />
                  {o.label}
                </label>
              );
            })}
          </div>
        )}
        {kind === "text" && (
          <Input
            autoFocus
            value={rule.value ?? ""}
            onChange={(e) => onChange({ ...rule, value: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && setOpen(false)}
            placeholder="Type a value…"
            className="h-7 text-xs"
          />
        )}
        {kind === "date" && op?.needsValue && (
          <Input
            type="date"
            value={rule.value ?? ""}
            onChange={(e) => onChange({ ...rule, value: e.target.value })}
            className="h-7 text-xs"
          />
        )}
      </PopoverContent>
    </Popover>
  );
}

// ---- Sorts ------------------------------------------------------------------

export function SortMenu({ sorting, onChange }: { sorting: SortRule[]; onChange: (sorting: SortRule[]) => void }) {
  const unused = SORTABLE_FIELDS.filter((f) => !sorting.some((s) => s.id === f));
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn("h-8 gap-1.5 px-2 text-xs", sorting.length ? "text-primary" : "text-muted-foreground")}
        >
          <ArrowUpDownIcon className="size-3.5" />
          {sorting.length === 0 ? "Sort" : sorting.length === 1 ? `Sorted by ${FIELD_LABEL[sorting[0].id as FilterField]}` : `${sorting.length} sorts`}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2">
        {sorting.length === 0 && (
          <p className="px-1.5 pb-2 pt-1 text-xs text-muted-foreground">
            No sorts. Tasks follow the default order: in progress first, then priority.
          </p>
        )}
        <div className="flex flex-col gap-1">
          {sorting.map((s, i) => (
            <div key={s.id} className="flex items-center gap-1.5">
              <Select
                value={s.id}
                onValueChange={(v) => onChange(sorting.map((x, j) => (j === i ? { ...x, id: v } : x)))}
              >
                <SelectTrigger size="sm" className="h-7 flex-1 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORTABLE_FIELDS.filter((f) => f === s.id || !sorting.some((x) => x.id === f)).map((f) => (
                    <SelectItem key={f} value={f} className="text-xs">
                      {FIELD_LABEL[f]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={s.desc ? "desc" : "asc"}
                onValueChange={(v) => onChange(sorting.map((x, j) => (j === i ? { ...x, desc: v === "desc" } : x)))}
              >
                <SelectTrigger size="sm" className="h-7 w-32 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="asc" className="text-xs">
                    <ArrowUpIcon className="size-3" /> Ascending
                  </SelectItem>
                  <SelectItem value="desc" className="text-xs">
                    <ArrowDownIcon className="size-3" /> Descending
                  </SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={() => onChange(sorting.filter((_, j) => j !== i))}
                aria-label={`Remove ${FIELD_LABEL[s.id as FilterField]} sort`}
              >
                <XIcon className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
        <div className="mt-1 flex items-center justify-between">
          {unused.length > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-1.5 text-xs text-muted-foreground"
              onClick={() => onChange([...sorting, { id: unused[0], desc: false }])}
            >
              <PlusIcon className="size-3.5" />
              Add sort
            </Button>
          ) : (
            <span />
          )}
          {sorting.length > 0 && (
            <Button variant="ghost" size="sm" className="h-7 px-1.5 text-xs text-muted-foreground" onClick={() => onChange([])}>
              Clear sorts
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ---- Group by ---------------------------------------------------------------

export function GroupMenu({ groupBy, onChange }: { groupBy: GroupBy; onChange: (g: GroupBy) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn("h-8 gap-1.5 px-2 text-xs", groupBy !== "none" ? "text-primary" : "text-muted-foreground")}
        >
          <Rows3Icon className="size-3.5" />
          {groupBy === "none" ? "Group" : `Grouped by ${GROUP_LABEL[groupBy]}`}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-40">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Group by</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={groupBy} onValueChange={(v) => onChange(v as GroupBy)}>
          {(Object.keys(GROUP_LABEL) as GroupBy[]).map((g) => (
            <DropdownMenuRadioItem key={g} value={g} className="text-xs">
              {GROUP_LABEL[g]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
