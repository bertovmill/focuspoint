// Pure helpers for rendering a raw eve session event stream (see
// node_modules/eve/docs/concepts/sessions-runs-and-streaming.md for the event
// contract) as a human-readable trace. Events are read straight out of the
// `threads.events` JSONB column — no eve API calls needed.

export interface TraceEvent {
  type: string;
  data?: Record<string, unknown>;
  meta?: { at?: string };
}

export interface ToolCall {
  callId: string;
  toolName: string;
  input: unknown;
}

export interface StepUsage {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

export interface ThreadStats {
  model: string | null;
  eveVersion: string | null;
  gitBranch: string | null;
  gitSha: string | null;
  turnCount: number;
  toolCallCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheWriteTokens: number;
  durationMs: number | null;
  status: "completed" | "waiting" | "failed" | "in-progress";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

/** Maps each tool-call `callId` to its `toolName`/`input`, so action.result (which only carries callId) can be labeled. */
export function buildToolCallMap(events: TraceEvent[]): Map<string, ToolCall> {
  const map = new Map<string, ToolCall>();
  for (const event of events) {
    if (event.type !== "actions.requested") continue;
    const actions = asRecord(event.data).actions;
    if (!Array.isArray(actions)) continue;
    for (const action of actions) {
      const a = asRecord(action);
      if (a.kind !== "tool-call") continue;
      const callId = String(a.callId ?? "");
      if (!callId) continue;
      map.set(callId, { callId, toolName: String(a.toolName ?? "unknown"), input: a.input });
    }
  }
  return map;
}

export function computeThreadStats(events: TraceEvent[]): ThreadStats {
  const stats: ThreadStats = {
    model: null,
    eveVersion: null,
    gitBranch: null,
    gitSha: null,
    turnCount: 0,
    toolCallCount: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCacheReadTokens: 0,
    totalCacheWriteTokens: 0,
    durationMs: null,
    status: "in-progress",
  };

  let firstAt: number | null = null;
  let lastAt: number | null = null;

  for (const event of events) {
    const at = event.meta?.at ? Date.parse(event.meta.at) : NaN;
    if (!Number.isNaN(at)) {
      if (firstAt === null) firstAt = at;
      lastAt = at;
    }

    const data = asRecord(event.data);
    switch (event.type) {
      case "session.started": {
        const runtime = asRecord(data.runtime);
        stats.model = typeof runtime.modelId === "string" ? runtime.modelId : null;
        stats.eveVersion = typeof runtime.eveVersion === "string" ? runtime.eveVersion : null;
        const build = asRecord(runtime.build);
        stats.gitBranch = typeof build.gitBranch === "string" ? build.gitBranch : null;
        stats.gitSha = typeof build.gitSha === "string" ? build.gitSha : null;
        break;
      }
      case "turn.started":
        stats.turnCount += 1;
        break;
      case "actions.requested": {
        const actions = data.actions;
        if (Array.isArray(actions)) {
          stats.toolCallCount += actions.filter((a) => asRecord(a).kind === "tool-call").length;
        }
        break;
      }
      case "step.completed": {
        const usage = asRecord(data.usage);
        stats.totalInputTokens += Number(usage.inputTokens ?? 0);
        stats.totalOutputTokens += Number(usage.outputTokens ?? 0);
        stats.totalCacheReadTokens += Number(usage.cacheReadTokens ?? 0);
        stats.totalCacheWriteTokens += Number(usage.cacheWriteTokens ?? 0);
        break;
      }
      case "session.waiting":
        stats.status = "waiting";
        break;
      case "session.completed":
        stats.status = "completed";
        break;
      case "session.failed":
      case "turn.failed":
      case "step.failed":
        stats.status = "failed";
        break;
    }
  }

  stats.durationMs = firstAt !== null && lastAt !== null ? lastAt - firstAt : null;
  return stats;
}

const NOISY_EVENT_TYPES = new Set([
  "reasoning.appended",
  "message.appended",
  "step.started",
]);

/** Whether an event is a streaming delta (superseded by its .completed counterpart) rather than a discrete trace step. */
export function isNoisyEvent(event: TraceEvent): boolean {
  return NOISY_EVENT_TYPES.has(event.type);
}

function truncate(text: string, max: number): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

function safeJson(value: unknown, max = 80): string {
  try {
    return truncate(JSON.stringify(value), max);
  } catch {
    return String(value);
  }
}

/** One-line human summary for an event, used as the collapsed row label in the trace timeline. */
export function summarizeEvent(event: TraceEvent, toolCalls: Map<string, ToolCall>): string {
  const data = asRecord(event.data);
  switch (event.type) {
    case "session.started": {
      const runtime = asRecord(data.runtime);
      return `Session started — ${runtime.modelId ?? "unknown model"}`;
    }
    case "turn.started":
      return `Turn ${data.sequence ?? "?"} started`;
    case "message.received":
      return `User: ${truncate(String(data.message ?? ""), 140)}`;
    case "reasoning.completed":
      return `Reasoning: ${truncate(String(data.reasoning ?? ""), 140)}`;
    case "actions.requested": {
      const actions = Array.isArray(data.actions) ? data.actions : [];
      return actions
        .map((a) => {
          const rec = asRecord(a);
          return `Tool call: ${rec.toolName ?? "?"}(${safeJson(rec.input)})`;
        })
        .join(" · ") || "Tool call requested";
    }
    case "action.result": {
      const result = asRecord(data.result);
      const call = toolCalls.get(String(result.callId ?? ""));
      const name = call?.toolName ?? "tool";
      return `Tool result: ${name} → ${safeJson(result.output)}`;
    }
    case "step.completed": {
      const usage = asRecord(data.usage);
      return `Step complete — ${usage.inputTokens ?? 0} in / ${usage.outputTokens ?? 0} out tokens, finish: ${data.finishReason ?? "?"}`;
    }
    case "message.completed":
      return `Cael: ${truncate(String(data.message ?? ""), 140)}`;
    case "turn.completed":
      return `Turn ${data.sequence ?? "?"} completed`;
    case "subagent.called":
      return `Delegated to subagent (child session ${truncate(String(data.childSessionId ?? ""), 20)})`;
    case "subagent.completed":
      return "Subagent completed";
    case "input.requested":
      return "Waiting on human input (approval or question)";
    case "compaction.requested":
      return "Context compaction started";
    case "compaction.completed":
      return "Context compaction completed";
    case "authorization.required":
      return `Connection needs authorization: ${data.name ?? "unknown"}`;
    case "authorization.completed":
      return `Authorization ${data.outcome ?? "resolved"}`;
    case "session.waiting":
      return "Session waiting for next input";
    case "session.completed":
      return "Session completed";
    case "session.failed":
      return `Session failed: ${asRecord(data).message ?? "unknown error"}`;
    case "turn.failed":
      return `Turn failed: ${asRecord(data).message ?? "unknown error"}`;
    case "step.failed":
      return `Step failed: ${asRecord(data).message ?? "unknown error"}`;
    default:
      return event.type;
  }
}
