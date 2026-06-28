import { eveChannel } from "eve/channels/eve";
import { localDev, vercelOidc, type AuthFn } from "eve/channels/auth";
import { SESSION_COOKIE, isValidSession } from "@/lib/session";

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

export default eveChannel({
  auth: [vercelOidc(), localDev(), cookieAuth()],
});
