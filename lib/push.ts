import webpush, { type PushSubscription } from "web-push";
import { getDb } from "./db";

/**
 * Web push for the home-screen app: a notification when a Cael answer is ready
 * while Berto is in another app (2026-10-03). iOS 16.4+ delivers these to a site
 * added to the home screen, so no native app or Apple Developer account needed.
 *
 * Subscriptions live in `app_settings` as one JSON list — this is a one-person
 * app with a phone or two, not a table's worth of devices.
 */
const SUBSCRIPTIONS_KEY = "push_subscriptions";

export function pushConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

async function readSubscriptions(): Promise<PushSubscription[]> {
  const sql = getDb();
  const [row] = await sql`SELECT value FROM app_settings WHERE key = ${SUBSCRIPTIONS_KEY}`;
  if (!row) return [];
  try {
    const list = JSON.parse(row.value as string);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

async function writeSubscriptions(list: PushSubscription[]): Promise<void> {
  const sql = getDb();
  const value = JSON.stringify(list);
  await sql`
    INSERT INTO app_settings (key, value, updated_at) VALUES (${SUBSCRIPTIONS_KEY}, ${value}, NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
  `;
}

/** Adds or refreshes a device, keyed by its endpoint. */
export async function saveSubscription(sub: PushSubscription): Promise<void> {
  const list = await readSubscriptions();
  await writeSubscriptions([...list.filter((s) => s.endpoint !== sub.endpoint), sub]);
}

export async function removeSubscription(endpoint: string): Promise<void> {
  const list = await readSubscriptions();
  await writeSubscriptions(list.filter((s) => s.endpoint !== endpoint));
}

export type PushPayload = { title: string; body: string; url?: string; tag?: string };

/**
 * Sends to every saved device. A device that has gone away (404/410 — app
 * removed from the home screen, permission revoked) is dropped from the list.
 * Never throws: a failed notification must not fail the turn that sent it.
 */
export async function sendPush(payload: PushPayload): Promise<void> {
  if (!pushConfigured()) return;
  try {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || "https://cael.bertomill.com",
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!,
    );
    const list = await readSubscriptions();
    if (list.length === 0) return;
    const gone: string[] = [];
    await Promise.all(
      list.map(async (sub) => {
        try {
          await webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 60 * 60 });
        } catch (error) {
          const status = (error as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) gone.push(sub.endpoint);
          else console.warn("[push] send failed", status);
        }
      }),
    );
    if (gone.length) await writeSubscriptions(list.filter((s) => !gone.includes(s.endpoint)));
  } catch (error) {
    console.warn("[push] sendPush failed", error);
  }
}
