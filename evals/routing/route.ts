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
  tags?: string[];
}

export function routeEval(c: RouteCase) {
  return defineEval({
    description: c.description,
    tags: ["routing", ...(c.tags ?? [])],
    async test(t) {
      const turn = await t.send(c.prompt);
      t.succeeded();
      const called = new Set(turn.toolCalls.map((call) => call.name));
      t.log(`tools: ${[...called].join(", ") || "(none)"}`);
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
