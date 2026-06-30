import { defineHook } from "eve/hooks";

export default defineHook({
  events: {
    async "session.started"(_event, ctx) {
      try {
        console.info("[audit] session.started", { sessionId: ctx.session.id, channel: ctx.channel.kind });
      } catch {
        /* never let logging fail a turn */
      }
    },
    async "step.completed"(event, ctx) {
      try {
        console.info("[audit] step.completed", {
          sessionId: ctx.session.id,
          finishReason: event.data.finishReason,
          inputTokens: event.data.usage?.inputTokens,
          outputTokens: event.data.usage?.outputTokens,
        });
      } catch { /* swallow */ }
    },
    async "turn.completed"(_event, ctx) {
      try {
        console.info("[audit] turn.completed", { sessionId: ctx.session.id });
      } catch { /* swallow */ }
    },
    async "turn.failed"(event, ctx) {
      try {
        console.info("[audit] turn.failed", {
          sessionId: ctx.session.id,
          code: (event.data as { code?: string }).code,
          message: (event.data as { message?: string }).message,
        });
      } catch { /* swallow */ }
    },
    async "action.result"(event, ctx) {
      try {
        const result = event.data.result as { toolName?: string; isError?: boolean } | undefined;
        console.info("[audit] tool.call", {
          sessionId: ctx.session.id,
          tool: result?.toolName,
          error: result?.isError ?? false,
        });
      } catch {
        /* swallow */
      }
    },
  },
});
