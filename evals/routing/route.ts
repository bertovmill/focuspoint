import { defineEval } from "eve/evals";
import { satisfies } from "eve/evals/expect";

// Routing evals: does Cael reach for the right source of context for a
// question? Each case is a real kind of message Berto sends, plus what a good
// answer has to touch. "Touching" a source means calling one of its tools — or,
// for the things the Daily snapshot already carries, saying what's in it.
//
// These drive the real agent against DATABASE_URL, so keep prompts read-only.

export interface RouteCase {
  description: string;
  prompt: string;
  /** At least one of these tools must be called. */
  anyOf?: string[];
  /** Every one of these must be called. */
  allOf?: string[];
  /** None of these may be called (e.g. publishing without his OK). */
  never?: string[];
  /** The reply must pass this check (e.g. mention today's session from the DB). */
  reply?: { label: string; test: (reply: string) => boolean | Promise<boolean> };
  /** No tool calls at all — the question needs none of his data. */
  noTools?: boolean;
  /** Speed budget for the turn; unset fields use DEFAULT_BUDGET. */
  budget?: Partial<Budget>;
  tags?: string[];
}

// Efficiency budgets, so a regression in speed fails an eval the same way a
// wrong tool does (an extra `load_toolset` round trip, a tool called twice, a
// prompt that stops caching). Set from a baseline run on 2026-10-16 with
// headroom; tighten per case with `budget`.
export interface Budget {
  /** Model calls in the turn (one per tool round trip, plus the reply). */
  steps: number;
  /** Tool calls in the turn. */
  toolCalls: number;
  /** Input tokens not served from the prompt cache, summed over the turn's steps. */
  uncachedInputTokens: number;
  /** Wall-clock time for the whole turn. */
  latencyMs: number;
}

export const DEFAULT_BUDGET: Budget = {
  steps: 4,
  toolCalls: 6,
  uncachedInputTokens: 30_000,
  latencyMs: 45_000,
};

type StepUsage = { inputTokens?: number; cacheReadTokens?: number };

export function routeEval(c: RouteCase) {
  return defineEval({
    description: c.description,
    tags: ["routing", ...(c.tags ?? [])],
    async test(t) {
      const started = Date.now();
      const turn = await t.send(c.prompt);
      const latencyMs = Date.now() - started;
      t.succeeded();
      const called = new Set(turn.toolCalls.map((call) => call.name));
      t.log(`tools: ${[...called].join(", ") || "(none)"}`);

      const budget = { ...DEFAULT_BUDGET, ...c.budget };
      const steps = turn.events.filter((e) => e.type === "step.started").length;
      let uncached = 0;
      for (const e of turn.events) {
        if (e.type !== "step.completed") continue;
        const usage = (e.data as { usage?: StepUsage }).usage;
        uncached += Math.max(0, (usage?.inputTokens ?? 0) - (usage?.cacheReadTokens ?? 0));
      }
      t.log(`steps: ${steps}, tool calls: ${turn.toolCalls.length}, uncached input: ${uncached}, latency: ${latencyMs}ms`);
      t.check(steps, satisfies((n: number) => n <= budget.steps, `at most ${budget.steps} steps`));
      t.check(turn.toolCalls.length, satisfies((n: number) => n <= budget.toolCalls, `at most ${budget.toolCalls} tool calls`));
      t.check(uncached, satisfies((n: number) => n <= budget.uncachedInputTokens, `at most ${budget.uncachedInputTokens} uncached input tokens`));
      t.check(latencyMs, satisfies((n: number) => n <= budget.latencyMs, `under ${budget.latencyMs / 1000}s`));
      if (c.noTools) t.usedNoTools();
      for (const name of c.allOf ?? []) t.calledTool(name);
      for (const name of c.never ?? []) t.notCalledTool(name);
      if (c.anyOf) {
        t.check(
          [...called],
          satisfies((names: string[]) => c.anyOf!.some((n) => names.includes(n)), `called one of ${c.anyOf.join(" / ")}`),
        );
      }
      if (c.reply) {
        const reply = turn.message ?? "";
        const ok = await c.reply.test(reply);
        t.check(ok, satisfies((v: boolean) => v, c.reply.label));
      }
    },
  });
}
