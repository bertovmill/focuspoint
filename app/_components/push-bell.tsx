"use client";

import { BellIcon, BellOffIcon, BellRingIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

type State = "loading" | "unsupported" | "off" | "on" | "denied" | "busy";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * The chat header's bell: turns "answer ready" notifications on or off for this
 * device (Berto, 2026-10-03). iOS only offers push to the home-screen app and
 * only asks permission from a tap, which is why this is a button rather than a
 * prompt on load. Hidden where push can't work — a Safari tab on iOS, or before
 * the VAPID key is configured. Server side: app/api/push, lib/push.ts, public/sw.js.
 */
export function PushBell({ className }: { readonly className?: string }) {
  const [state, setState] = useState<State>("loading");

  useEffect(() => {
    if (!PUBLIC_KEY || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setState("unsupported");
      return;
    }
    let cancelled = false;
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        if (cancelled) return;
        if (Notification.permission === "denied") setState("denied");
        else setState(sub ? "on" : "off");
      })
      .catch(() => !cancelled && setState("unsupported"));
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = useCallback(async () => {
    if (state === "loading" || state === "busy" || state === "unsupported") return;
    if (state === "denied") {
      window.alert("Notifications are blocked for Cael. Turn them on in Settings → Notifications → Cael.");
      return;
    }
    const was = state;
    setState("busy");
    try {
      const reg = await navigator.serviceWorker.ready;
      if (was === "on") {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await fetch("/api/push", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          });
          await sub.unsubscribe();
        }
        setState("off");
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(PUBLIC_KEY!) }));
      const res = await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      setState(res.ok ? "on" : "off");
    } catch {
      setState(was);
    }
  }, [state]);

  if (state === "unsupported" || state === "loading") return null;

  const label =
    state === "on"
      ? "Answer notifications on — tap to turn off"
      : state === "denied"
        ? "Notifications blocked in Settings"
        : "Notify me when an answer is ready";
  const Icon = state === "on" ? BellRingIcon : state === "denied" ? BellOffIcon : BellIcon;

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={state === "busy"}
      title={label}
      aria-label={label}
      aria-pressed={state === "on"}
      className={cn(
        "rounded-lg p-2 transition-colors hover:bg-muted",
        state === "on" ? "text-primary" : "text-muted-foreground hover:text-foreground",
        state === "busy" && "animate-pulse",
        className,
      )}
    >
      <Icon className="size-4" />
    </button>
  );
}
