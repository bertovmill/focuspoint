import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { saveXAccount } from "@/lib/x-accounts";
import { finishXConnect, startXConnect } from "@/lib/x-api";

// The request token waits here between the two steps (10 minutes, like X's).
const COOKIE = "x_connect";

/**
 * Connect another X account (e.g. @makersloungeto) for Cael to post as, with
 * X's PIN flow. POST `{}` starts it and returns `authorizeUrl`: open it signed
 * in to X as that account, approve, and X shows a PIN. POST `{ pin }` finishes
 * it and returns the connected `handle`.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const jar = await cookies();

  if (typeof body.pin !== "string") {
    try {
      const { authorizeUrl, token, secret } = await startXConnect();
      jar.set(COOKIE, JSON.stringify({ token, secret }), {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/api/x-accounts",
        maxAge: 600,
      });
      return NextResponse.json({ authorizeUrl });
    } catch (err) {
      console.error("[x accounts] connect start failed:", err);
      return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't reach X" }, { status: 502 });
    }
  }

  const pin = body.pin.trim();
  let pending: { token?: string; secret?: string } = {};
  try {
    pending = JSON.parse(jar.get(COOKIE)?.value ?? "{}");
  } catch {}
  if (!pending.token || !pending.secret) {
    return NextResponse.json({ error: "That took too long. Start again." }, { status: 400 });
  }
  if (!/^\d{4,10}$/.test(pin)) return NextResponse.json({ error: "Enter the PIN X showed you" }, { status: 400 });

  try {
    const account = await finishXConnect(pending.token, pending.secret, pin);
    await saveXAccount(account);
    jar.delete({ name: COOKIE, path: "/api/x-accounts" });
    return NextResponse.json({ handle: account.handle.toLowerCase() });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't connect" }, { status: 400 });
  }
}
