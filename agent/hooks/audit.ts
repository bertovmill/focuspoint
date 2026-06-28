import { defineHook } from "eve/hooks";

// Observe-only audit trail. Hooks fire after each stream event is durably
// recorded, so this is a safe place for logging/metrics without touching the
// agent's behavior. Logs land in the platform logs (Vercel / `eve dev`).
//
// Wrapped in try/catch because a throwing hook surfaces as turn.failed — we
// never want audit logging to break a real conversation.
export default defineHook({
  events: {
    async "session.started"(_event, ctx) {
      try {
        console.info("[audit] session.started", { sessionId: ctx.session.id, channel: ctx.channel.kind });
      } catch {
        /* never let logging fail a turn */
      }
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
