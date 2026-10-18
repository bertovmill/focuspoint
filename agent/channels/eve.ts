import { eveChannel } from "eve/channels/eve";
import { localDev, vercelOidc, type AuthFn } from "eve/channels/auth";
import { createClerkClient } from "@clerk/backend";
import { SESSION_COOKIE, isValidSession } from "@/lib/session";
import { CLERK_SERVER_ENABLED, isOwnerUser } from "@/lib/owner";
import { sendPush } from "@/lib/push";

/**
 * The agent transport is the app's back door — it can drive every tool Cael has —
 * so it authenticates independently of the page gate in middleware.
 *
 * Two credentials are accepted, matching the two ways into the app:
 * a Clerk session belonging to the owner, or the password cookie. Holding an
 * account is *not* enough; a signed-in non-owner is rejected here exactly as
 * they are everywhere else.
 */

function cookieAuth(): AuthFn<Request> {
  return (request) => {
    const cookieHeader = request.headers.get("cookie") ?? "";
    const cookies = Object.fromEntries(
      cookieHeader.split(";").map((c) => {
        const eq = c.indexOf("=");
        return eq === -1 ? [c.trim(), ""] : [c.slice(0, eq).trim(), c.slice(eq + 1).trim()];
      })
    );
    if (!isValidSession(cookies[SESSION_COOKIE])) return null;
    return {
      attributes: {},
      authenticator: "cookie",
      principalId: "owner",
      principalType: "user",
    };
  };
}

function clerkAuth(): AuthFn<Request> {
  // Built once. When Clerk isn't configured this entry always skips, and the
  // cookie below is the only way in — which is the point of keeping it.
  const client = CLERK_SERVER_ENABLED
    ? createClerkClient({
        secretKey: process.env.CLERK_SECRET_KEY!,
        publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY!,
      })
    : null;

  return async (request) => {
    if (!client) return null;
    try {
      const state = await client.authenticateRequest(request);
      if (!state.isAuthenticated) return null;
      const { userId } = state.toAuth();
      if (!userId) return null;

      // Same rule as the page gate, from the same module: a verified owner
      // address, resolved from Clerk rather than trusted from a claim. An account
      // can carry an email it never confirmed, and accepting one here would hand
      // the agent to whoever typed the owner's address into their own profile.
      if (!isOwnerUser(await client.users.getUser(userId))) return null;

      return {
        attributes: {},
        authenticator: "clerk",
        principalId: userId,
        principalType: "user",
      };
    } catch {
      // Unreachable or misconfigured Clerk skips to the next entry rather than
      // failing the request outright.
      return null;
    }
  };
}

export default eveChannel({
  auth: [vercelOidc(), localDev(), clerkAuth(), cookieAuth()],
  // A message sent mid-answer waits for that answer instead of cancelling it
  // (Berto, 2026-10-03). On the phone, coming back from another app and typing
  // "hello?" used to throw away the turn still running on the server. Stop is the
  // way to interrupt.
  turnPolicy: "queue",
  events: {
    // Web push when an answer is ready (Berto, 2026-10-03), so he can switch apps
    // while Cael works. Only the terminal reply counts: `message.completed` also
    // fires for the narration before a tool call, which ends in "tool-calls".
    // Never throws (lib/push.ts), so a failed push can't fail the turn.
    async "message.completed"(data) {
      if (data.finishReason !== "stop") return;
      const text = (data.message ?? "").replace(/[*_`#>\[\]]/g, "").replace(/\s+/g, " ").trim();
      if (!text) return;
      await sendPush({
        title: "Cael",
        body: text.length > 140 ? `${text.slice(0, 139)}…` : text,
        url: "/chat",
        tag: "cael-answer",
      });
    },
  },
});
