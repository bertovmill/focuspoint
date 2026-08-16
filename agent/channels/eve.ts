import { eveChannel } from "eve/channels/eve";
import { localDev, vercelOidc, type AuthFn } from "eve/channels/auth";
import { createClerkClient } from "@clerk/backend";
import { SESSION_COOKIE, isValidSession } from "@/lib/session";
import { CLERK_SERVER_ENABLED, isOwnerEmail } from "@/lib/owner";

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

      // Resolve the email from Clerk rather than trusting a claim shape: this
      // grants full tool access, so it's worth the round trip.
      const user = await client.users.getUser(userId);
      const email = user.primaryEmailAddress?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? null;
      if (!isOwnerEmail(email)) return null;

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
});
