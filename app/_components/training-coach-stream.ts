"use client";

import type { MessageStreamEvent } from "eve/client";
import { getEveClient, STREAM_RECONNECT_POLICY } from "@/lib/eve-client";

export interface CoachProgress {
  /** What the coach is doing right now, in a few words. */
  onStatus: (text: string) => void;
  /** The day it's writing (ISO), or null between days. */
  onWriting: (date: string | null) => void;
  /** A session landed, moved or went away: re-read the week. */
  onWrote: () => void;
}

/**
 * "Draft this week", the agentic way. Starts an eve session whose first message
 * Cael hands straight to the training_coach subagent, then follows the coach's
 * own child stream: each set_training_session call it makes is reported as it
 * happens so the grid fills in live. Resolves with the coach's one-line summary.
 */
export async function draftWeekWithCoach(weekStart: string, sessionsPerWeek: number, progress: CoachProgress): Promise<string | null> {
  const client = getEveClient();
  progress.onStatus("Handing the week to your coach…");
  const { session, response } = await client.sessions.create({
    message: `[draft-training-week] Draft the training week starting Monday ${weekStart}: ${sessionsPerWeek} sessions.`,
  });

  // The coach runs as a background task: Cael's first turn only gets its task
  // receipt, and `subagent.called` (which carries the child session to follow)
  // lands on the stream just after that turn settles.
  let delegated = false;
  for await (const ev of response) {
    if (ev.type === "action.result" && ev.data.result.kind === "tool-result" && ev.data.result.toolName === "training_coach") delegated = true;
  }
  if (!delegated) throw new Error("Cael didn't hand the week to the coach.");
  let childSessionId: string | null = null;
  for await (const ev of session.stream({ streamReconnectPolicy: STREAM_RECONNECT_POLICY })) {
    if (ev.type === "subagent.called" && ev.data.name === "training_coach") {
      childSessionId = ev.data.childSessionId;
      break;
    }
  }
  if (!childSessionId) throw new Error("Lost track of the coach.");

  progress.onStatus("Reading your plan, races and recent load…");
  let summary: string | null = null;
  const child = client.sessions.attach(childSessionId);
  for await (const ev of child.stream({ streamReconnectPolicy: STREAM_RECONNECT_POLICY })) {
    handle(ev, progress, (s) => (summary = s));
    if (ev.type === "session.failed") throw new Error("The coach stopped partway through.");
    if (ev.type === "session.waiting" || ev.type === "session.completed") break;
  }
  progress.onWriting(null);
  return summary;
}

function handle(ev: MessageStreamEvent, progress: CoachProgress, setSummary: (s: string) => void) {
  if (ev.type === "actions.requested") {
    for (const a of ev.data.actions) {
      if (a.kind !== "tool-call") continue;
      const input = a.input as Record<string, unknown>;
      if (a.toolName === "set_training_session") {
        const date = typeof input.session_date === "string" ? input.session_date : null;
        const title = typeof input.title === "string" ? input.title : null;
        progress.onWriting(date);
        progress.onStatus(input.delete ? "Clearing a session that doesn't fit…" : input.id ? `Refining ${title ?? "a session"}…` : `Writing ${title ?? "a session"}…`);
      } else if (a.toolName === "task_update") {
        const note = Object.values(input).find((v): v is string => typeof v === "string" && v.trim().length > 0);
        if (note) progress.onStatus(note);
      }
    }
  } else if (ev.type === "action.result") {
    if (ev.data.result.kind === "tool-result" && ev.data.result.toolName === "set_training_session") progress.onWrote();
  } else if (ev.type === "message.completed" && ev.data.finishReason !== "tool-calls" && ev.data.message?.trim()) {
    setSummary(ev.data.message!.trim());
  }
}
