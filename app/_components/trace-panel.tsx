"use client";

import type { EveMessageData, UseEveAgentSnapshot } from "eve/react";
import { useMemo, useState } from "react";
import {
  BrainIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  MessageSquareIcon,
  WrenchIcon,
  XIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type EveEvents = UseEveAgentSnapshot<EveMessageData>["events"];
type EveEvent = EveEvents[number];

type ToolCallEntry = {
  callId: string;
  kind: string;
  name: string;
  input?: unknown;
  output?: unknown;
  isError?: boolean;
  status: "pending" | "completed" | "failed" | "rejected";
};

type StepEntry = {
  stepIndex: number;
  startedAt?: string;
  completedAt?: string;
  finishReason?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  };
  reasoning?: string;
  message?: string;
  toolCalls: ToolCallEntry[];
};

type TurnEntry = {
  turnId: string;
  sequence: number;
  startedAt?: string;
  completedAt?: string;
  failed?: { code: string; message: string };
  steps: Map<number, StepEntry>;
};

function ensureTurn(turns: Map<string, TurnEntry>, turnId: string, sequence: number): TurnEntry {
  let turn = turns.get(turnId);
  if (!turn) {
    turn = { turnId, sequence, steps: new Map() };
    turns.set(turnId, turn);
  }
  return turn;
}

function ensureStep(turn: TurnEntry, stepIndex: number): StepEntry {
  let step = turn.steps.get(stepIndex);
  if (!step) {
    step = { stepIndex, toolCalls: [] };
    turn.steps.set(stepIndex, step);
  }
  return step;
}

function buildTurns(events: EveEvents): TurnEntry[] {
  const turns = new Map<string, TurnEntry>();
  // callId -> { turnId, stepIndex } so action.result can find its request
  const callIndex = new Map<string, { turnId: string; stepIndex: number }>();

  for (const event of events) {
    const at = (event as { meta?: { at?: string } }).meta?.at;
    switch (event.type) {
      case "turn.started": {
        const turn = ensureTurn(turns, event.data.turnId, event.data.sequence);
        turn.startedAt = at;
        break;
      }
      case "turn.completed": {
        const turn = ensureTurn(turns, event.data.turnId, event.data.sequence);
        turn.completedAt = at;
        break;
      }
      case "turn.failed": {
        const turn = ensureTurn(turns, event.data.turnId, event.data.sequence);
        turn.completedAt = at;
        turn.failed = { code: event.data.code, message: event.data.message };
        break;
      }
      case "step.started": {
        const turn = ensureTurn(turns, event.data.turnId, event.data.sequence);
        const step = ensureStep(turn, event.data.stepIndex);
        step.startedAt = at;
        break;
      }
      case "step.completed": {
        const turn = ensureTurn(turns, event.data.turnId, event.data.sequence);
        const step = ensureStep(turn, event.data.stepIndex);
        step.completedAt = at;
        step.finishReason = event.data.finishReason;
        step.usage = event.data.usage;
        break;
      }
      case "step.failed": {
        const turn = ensureTurn(turns, event.data.turnId, event.data.sequence);
        const step = ensureStep(turn, event.data.stepIndex);
        step.completedAt = at;
        step.finishReason = "error";
        break;
      }
      case "reasoning.completed": {
        const turn = ensureTurn(turns, event.data.turnId, event.data.sequence);
        const step = ensureStep(turn, event.data.stepIndex);
        step.reasoning = event.data.reasoning;
        break;
      }
      case "message.completed": {
        const turn = ensureTurn(turns, event.data.turnId, event.data.sequence);
        const step = ensureStep(turn, event.data.stepIndex);
        if (event.data.message) step.message = event.data.message;
        break;
      }
      case "actions.requested": {
        const turn = ensureTurn(turns, event.data.turnId, event.data.sequence);
        const step = ensureStep(turn, event.data.stepIndex);
        for (const action of event.data.actions) {
          const name =
            action.kind === "tool-call"
              ? action.toolName
              : action.kind === "subagent-call"
                ? action.subagentName
                : "load-skill";
          step.toolCalls.push({
            callId: action.callId,
            kind: action.kind,
            name,
            input: action.input,
            status: "pending",
          });
          callIndex.set(action.callId, { turnId: event.data.turnId, stepIndex: event.data.stepIndex });
        }
        break;
      }
      case "action.result": {
        const ref = callIndex.get(event.data.result.callId);
        const turn = ref
          ? ensureTurn(turns, ref.turnId, event.data.sequence)
          : ensureTurn(turns, event.data.turnId, event.data.sequence);
        const step = ensureStep(turn, ref?.stepIndex ?? event.data.stepIndex);
        const existing = step.toolCalls.find((t) => t.callId === event.data.result.callId);
        const status =
          event.data.status === "completed"
            ? event.data.result.isError
              ? "failed"
              : "completed"
            : event.data.status;
        if (existing) {
          existing.output = event.data.result.output;
          existing.isError = event.data.result.isError;
          existing.status = status;
        } else {
          step.toolCalls.push({
            callId: event.data.result.callId,
            kind: event.data.result.kind,
            name: "toolName" in event.data.result ? event.data.result.toolName : event.data.result.kind,
            output: event.data.result.output,
            isError: event.data.result.isError,
            status,
          });
        }
        break;
      }
      default:
        break;
    }
  }

  return [...turns.values()].sort((a, b) => a.sequence - b.sequence);
}

function msBetween(a?: string, b?: string): number | undefined {
  if (!a || !b) return undefined;
  const diff = new Date(b).getTime() - new Date(a).getTime();
  return Number.isFinite(diff) ? diff : undefined;
}

export function TracePanel({ events, onClose }: { events: EveEvents; onClose: () => void }) {
  const turns = useMemo(() => buildTurns(events), [events]);

  return (
    <div className="absolute inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-md flex-col border-l border-border bg-background">
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-3">
          <span className="text-sm text-muted-foreground">Trace</span>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Close trace"
          >
            <XIcon className="size-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {turns.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">No events yet.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {turns.map((turn, i) => (
                <TurnBlock key={turn.turnId} turn={turn} defaultOpen={i === turns.length - 1} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TurnBlock({ turn, defaultOpen }: { turn: TurnEntry; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const steps = [...turn.steps.values()].sort((a, b) => a.stepIndex - b.stepIndex);
  const duration = msBetween(turn.startedAt, turn.completedAt);

  return (
    <div className="rounded-lg border border-border">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <span className="flex items-center gap-1.5 text-sm font-medium">
          {open ? <ChevronDownIcon className="size-3.5" /> : <ChevronRightIcon className="size-3.5" />}
          Turn {turn.sequence + 1}
        </span>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          {turn.failed ? <span className="text-destructive">failed</span> : null}
          {duration !== undefined ? <span>{duration}ms</span> : null}
          <span>{steps.length} step{steps.length === 1 ? "" : "s"}</span>
        </span>
      </button>
      {open ? (
        <div className="flex flex-col gap-2 border-t border-border p-2">
          {steps.map((step) => (
            <StepBlock key={step.stepIndex} step={step} />
          ))}
          {turn.failed ? (
            <p className="rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
              {turn.failed.code}: {turn.failed.message}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function StepBlock({ step }: { step: StepEntry }) {
  const duration = msBetween(step.startedAt, step.completedAt);
  return (
    <div className="rounded-md bg-muted/40 p-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Step {step.stepIndex + 1}</span>
        <span className="flex items-center gap-2">
          {step.finishReason ? <span>{step.finishReason}</span> : null}
          {duration !== undefined ? <span>{duration}ms</span> : null}
        </span>
      </div>
      {step.usage ? (
        <div className="mt-1 flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
          {step.usage.inputTokens !== undefined ? (
            <span className="rounded bg-background px-1.5 py-0.5">in {step.usage.inputTokens}</span>
          ) : null}
          {step.usage.outputTokens !== undefined ? (
            <span className="rounded bg-background px-1.5 py-0.5">out {step.usage.outputTokens}</span>
          ) : null}
          {step.usage.cacheReadTokens ? (
            <span className="rounded bg-background px-1.5 py-0.5">cache-read {step.usage.cacheReadTokens}</span>
          ) : null}
          {step.usage.cacheWriteTokens ? (
            <span className="rounded bg-background px-1.5 py-0.5">cache-write {step.usage.cacheWriteTokens}</span>
          ) : null}
        </div>
      ) : null}

      {step.reasoning ? (
        <details className="mt-1.5">
          <summary className="flex cursor-pointer items-center gap-1 text-xs text-muted-foreground">
            <BrainIcon className="size-3" /> reasoning
          </summary>
          <p className="mt-1 whitespace-pre-wrap rounded bg-background p-1.5 text-xs italic text-muted-foreground">
            {step.reasoning}
          </p>
        </details>
      ) : null}

      {step.toolCalls.map((tool) => (
        <ToolCallRow key={tool.callId} tool={tool} />
      ))}

      {step.message ? (
        <details className="mt-1.5" open>
          <summary className="flex cursor-pointer items-center gap-1 text-xs text-muted-foreground">
            <MessageSquareIcon className="size-3" /> message
          </summary>
          <p className="mt-1 whitespace-pre-wrap rounded bg-background p-1.5 text-xs">{step.message}</p>
        </details>
      ) : null}
    </div>
  );
}

function ToolCallRow({ tool }: { tool: ToolCallEntry }) {
  const [open, setOpen] = useState(false);
  const statusColor =
    tool.status === "completed"
      ? "text-emerald-600 dark:text-emerald-400"
      : tool.status === "failed"
        ? "text-destructive"
        : tool.status === "rejected"
          ? "text-amber-600 dark:text-amber-400"
          : "text-muted-foreground";

  return (
    <div className="mt-1.5 rounded bg-background">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-1.5 py-1 text-left text-xs"
      >
        <span className="flex items-center gap-1.5 truncate">
          <WrenchIcon className="size-3 shrink-0" />
          <span className="truncate font-mono">{tool.name}</span>
        </span>
        <span className={cn("shrink-0", statusColor)}>{tool.status}</span>
      </button>
      {open ? (
        <div className="space-y-1 border-t border-border px-1.5 py-1 text-[10px]">
          {tool.input !== undefined ? (
            <pre className="overflow-x-auto whitespace-pre-wrap text-muted-foreground">
              {JSON.stringify(tool.input, null, 2)}
            </pre>
          ) : null}
          {tool.output !== undefined ? (
            <pre className="overflow-x-auto whitespace-pre-wrap text-muted-foreground">
              → {JSON.stringify(tool.output, null, 2)}
            </pre>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
