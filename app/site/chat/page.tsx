import type { Metadata } from "next";
import { PublicChat } from "../_components/public-chat";

export const metadata: Metadata = {
  title: "Ask Cael",
  description: "Talk to Cael, Berto's personal AI agent — the public version, which knows only what's published here.",
};

export default function ChatPage() {
  return (
    <div className="mx-auto max-w-3xl px-6">
      <section className="border-b border-border/60 py-12">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Ask Cael</h1>
        <p className="mt-4 max-w-2xl leading-relaxed text-muted-foreground">
          Cael is the agent that runs my life — my goals, my reading, my training, my calendar. This
          is its public face: same voice, none of the keys. Ask it what I&apos;m building.
        </p>
      </section>
      <PublicChat />
    </div>
  );
}
