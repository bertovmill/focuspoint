"use client";

import { useEveAgent } from "eve/react";
import { AlertCircleIcon, DatabaseIcon } from "lucide-react";
import Link from "next/link";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { Thread } from "@/components/assistant-ui/thread";
import { useEveRuntime } from "@/hooks/use-eve-runtime";
import { cn } from "@/lib/utils";

type AgentStatus = ReturnType<typeof useEveAgent>["status"];

export function AgentChat({ hasMobileNav }: { hasMobileNav?: boolean }) {
  const agent = useEveAgent();
  const runtime = useEveRuntime(agent);

  return (
    <main
      className={cn(
        "flex h-dvh flex-col overflow-hidden bg-background text-foreground",
        hasMobileNav && "pb-16 lg:pb-0",
      )}
    >
      <header className="flex h-14 shrink-0 items-center justify-between pl-4 pr-3 border-b border-border">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-muted-foreground text-sm">Cael</span>
          <StatusDot status={agent.status} />
        </span>
        <Link
          href="/explore"
          className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          title="Database Explorer"
        >
          <DatabaseIcon className="size-4" />
        </Link>
      </header>

      {agent.error ? (
        <div className="mx-auto w-full max-w-3xl shrink-0 px-4 pt-2 sm:px-6">
          <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm">
            <AlertCircleIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
            <div>
              <p className="font-medium">Request failed</p>
              <p className="mt-0.5 text-muted-foreground">{agent.error.message}</p>
            </div>
          </div>
        </div>
      ) : null}

      <AssistantRuntimeProvider runtime={runtime}>
        <Thread components={{ Welcome: PersonalizedWelcome }} />
      </AssistantRuntimeProvider>
    </main>
  );
}

function PersonalizedWelcome() {
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="flex flex-col items-center gap-3 px-4 text-center mb-6">
      <h1 className="font-medium text-4xl tracking-tighter">
        {greeting}, Berto.
      </h1>
      <p className="text-muted-foreground text-sm">{today}</p>
      <p className="text-muted-foreground">What would you like to do today?</p>
    </div>
  );
}

function StatusDot({ status }: { readonly status: AgentStatus }) {
  const isLive = status === "submitted" || status === "streaming";
  const tone =
    status === "error"
      ? "bg-destructive"
      : isLive
        ? "bg-emerald-500"
        : status === "ready"
          ? "bg-muted-foreground"
          : "bg-muted-foreground/50";

  return (
    <span className="relative flex size-1">
      {isLive ? (
        <span
          className={cn(
            "absolute inline-flex size-full animate-ping rounded-full opacity-75",
            tone,
          )}
        />
      ) : null}
      <span className={cn("relative inline-flex size-1 rounded-full transition-colors", tone)} />
    </span>
  );
}
