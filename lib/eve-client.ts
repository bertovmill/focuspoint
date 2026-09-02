"use client";

import { Client, type StreamReconnectPolicy } from "eve/client";

/**
 * eve reconnects a dropped event stream this many times before giving up and
 * ending the turn client-side. The default is 3, which is far too few for a
 * laptop that sleeps or a phone that changes network: the run keeps going on the
 * server, so every attempt we don't make is an answer the UI never sees.
 *
 * As of eve 0.49 the budget is a per-stream option rather than a client-wide
 * one, so it travels with the reads that matter (`STREAM_RECONNECT_POLICY`)
 * instead of being configured once on the client.
 */
const MAX_RECONNECT_ATTEMPTS = 30;

export const STREAM_RECONNECT_POLICY: StreamReconnectPolicy = {
  streamIdleReconnectPolicy: { maxAttempts: MAX_RECONNECT_ATTEMPTS },
  streamOpenReconnectPolicy: { maxAttempts: MAX_RECONNECT_ATTEMPTS },
};

let client: Client | undefined;

/**
 * The one browser-side eve client. `host: ""` targets the same-origin eve routes
 * that `withEve()` mounts, which is what `useEveAgent` uses by default — the only
 * reason we build it ourselves is to own the `ClientSession`, so an interrupted
 * turn can be reattached later.
 */
export function getEveClient(): Client {
  client ??= new Client({ host: "" });
  return client;
}
