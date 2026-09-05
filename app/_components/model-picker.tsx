"use client";

import { CheckIcon, ChevronsUpDownIcon, PinIcon, PinOffIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";

import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorLogo,
  ModelSelectorName,
  ModelSelectorSeparator,
  ModelSelectorTrigger,
} from "@/components/ai-elements/model-selector";
import {
  CHAT_MODEL_DEFAULT,
  CHAT_MODEL_DEFAULT_PINS,
  CHAT_MODEL_FALLBACK,
  type ChatModel,
  formatPricePerMillion,
  providerLabel,
  providerRank,
} from "@/lib/chat-model";
import { cn } from "@/lib/utils";

/**
 * Which model Cael runs on — one global setting, shared by every picker on the
 * page (the floating chat bar and the chat composer both render one), so the
 * store lives at module scope rather than in either component's tree.
 */
type Settings = {
  model: string;
  pinned: string[];
  models: readonly ChatModel[];
  loaded: boolean;
};

let state: Settings = {
  model: CHAT_MODEL_DEFAULT,
  pinned: [...CHAT_MODEL_DEFAULT_PINS],
  models: CHAT_MODEL_FALLBACK,
  loaded: false,
};

const listeners = new Set<() => void>();

function publish(next: Partial<Settings>) {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

let loadStarted = false;

function loadOnce() {
  if (loadStarted) return;
  loadStarted = true;
  fetch("/api/settings/chat-model")
    .then((r) => r.json())
    .then((d) => {
      publish({
        model: typeof d?.model === "string" ? d.model : state.model,
        pinned: Array.isArray(d?.pinned) ? d.pinned : state.pinned,
        models: Array.isArray(d?.models) && d.models.length ? d.models : state.models,
        loaded: true,
      });
    })
    .catch(() => publish({ loaded: true }));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function useModelSettings() {
  const snapshot = useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
  useEffect(loadOnce, []);
  return snapshot;
}

/** Optimistic locally, then persisted; a failed save just leaves the UI ahead. */
function save(patch: { model?: string; pinned?: string[] }) {
  publish(patch);
  void fetch("/api/settings/chat-model", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
}

/** A model id the catalog doesn't know about still deserves a readable row. */
function synthesize(id: string): ChatModel {
  return {
    id,
    label: id.split("/")[1] ?? id,
    provider: id.split("/")[0] ?? "unknown",
    inputPrice: null,
    outputPrice: null,
  };
}

type ModelPickerProps = {
  /** `bar` is the wide chat bar's text button; `compact` is the composer's. */
  variant?: "bar" | "compact";
  className?: string;
};

export function ModelPicker({ variant = "bar", className }: ModelPickerProps) {
  const { model, pinned, models } = useModelSettings();
  const [open, setOpen] = useState(false);

  const byId = useMemo(() => new Map(models.map((m) => [m.id, m])), [models]);
  const current = byId.get(model) ?? synthesize(model);

  const pinnedModels = useMemo(
    () => pinned.map((id) => byId.get(id) ?? synthesize(id)),
    [pinned, byId],
  );

  // Everything not pinned, grouped by provider in PROVIDER_ORDER order.
  const groups = useMemo(() => {
    const pinnedSet = new Set(pinned);
    const out = new Map<string, ChatModel[]>();
    for (const m of models) {
      if (pinnedSet.has(m.id)) continue;
      const list = out.get(m.provider);
      if (list) list.push(m);
      else out.set(m.provider, [m]);
    }
    return [...out.entries()].sort(
      ([a], [b]) => providerRank(a) - providerRank(b) || a.localeCompare(b),
    );
  }, [models, pinned]);

  const pick = useCallback((id: string) => {
    save({ model: id });
    setOpen(false);
  }, []);

  const togglePin = useCallback(
    (id: string) => {
      save({ pinned: pinned.includes(id) ? pinned.filter((p) => p !== id) : [...pinned, id] });
    },
    [pinned],
  );

  return (
    <ModelSelector onOpenChange={setOpen} open={open}>
      <ModelSelectorTrigger asChild>
        <button
          aria-label={`Model: ${current.label}`}
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            variant === "bar" ? "h-8 px-2 text-xs" : "h-7 px-2 text-xs",
            className,
          )}
          title="Pick Cael's model"
          type="button"
        >
          <ModelSelectorLogo provider={current.provider} />
          <span className="max-w-[10rem] truncate">{current.label}</span>
          <ChevronsUpDownIcon className="size-3 shrink-0" />
        </button>
      </ModelSelectorTrigger>
      <ModelSelectorContent className="sm:max-w-xl" title="Pick Cael's model">
        <ModelSelectorInput placeholder="Search models…" />
        <ModelSelectorList className="max-h-[24rem]">
          <ModelSelectorEmpty>No model matches that.</ModelSelectorEmpty>
          {pinnedModels.length > 0 && (
            <>
              <ModelSelectorGroup heading="Pinned">
                {pinnedModels.map((m) => (
                  <ModelRow
                    key={m.id}
                    isPinned
                    model={m}
                    onPick={pick}
                    onTogglePin={togglePin}
                    selected={m.id === model}
                  />
                ))}
              </ModelSelectorGroup>
              <ModelSelectorSeparator />
            </>
          )}
          {groups.map(([provider, list]) => (
            <ModelSelectorGroup heading={providerLabel(provider)} key={provider}>
              {list.map((m) => (
                <ModelRow
                  key={m.id}
                  isPinned={false}
                  model={m}
                  onPick={pick}
                  onTogglePin={togglePin}
                  selected={m.id === model}
                />
              ))}
            </ModelSelectorGroup>
          ))}
        </ModelSelectorList>
        <div className="border-t px-3 py-2 text-xs text-muted-foreground">
          Prices are USD per 1M tokens (in / out), straight from the AI Gateway catalog.
        </div>
      </ModelSelectorContent>
    </ModelSelector>
  );
}

function ModelRow({
  model,
  selected,
  isPinned,
  onPick,
  onTogglePin,
}: {
  model: ChatModel;
  selected: boolean;
  isPinned: boolean;
  onPick: (id: string) => void;
  onTogglePin: (id: string) => void;
}) {
  const Icon = isPinned ? PinOffIcon : PinIcon;
  return (
    <ModelSelectorItem
      className="gap-2"
      onSelect={() => onPick(model.id)}
      // Searching by provider and by raw id, not just the display name.
      value={`${model.label} ${model.id}`}
    >
      <CheckIcon className={cn("size-4 shrink-0", selected ? "opacity-100" : "opacity-0")} />
      <ModelSelectorLogo provider={model.provider} />
      <ModelSelectorName className={cn(selected && "font-medium")}>{model.label}</ModelSelectorName>
      <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
        {formatPricePerMillion(model.inputPrice)} / {formatPricePerMillion(model.outputPrice)}
      </span>
      <button
        aria-label={isPinned ? `Unpin ${model.label}` : `Pin ${model.label}`}
        className={cn(
          "-mr-1 flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
          isPinned && "text-foreground",
        )}
        onClick={(e) => {
          // The row is a command item: pinning must not also pick the model.
          e.stopPropagation();
          onTogglePin(model.id);
        }}
        onPointerDown={(e) => e.stopPropagation()}
        title={isPinned ? "Unpin" : "Pin to the top"}
        type="button"
      >
        <Icon className="size-3.5" />
      </button>
    </ModelSelectorItem>
  );
}
