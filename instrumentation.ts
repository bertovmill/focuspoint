export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureSchema } = await import("./lib/db");
    // A failed schema check must not take the server down: the tables almost
    // always exist already, and routes that need them call ensureSchema again.
    await ensureSchema().catch((err) => console.error("[instrumentation] schema check failed; serving anyway:", err));
  }
}
