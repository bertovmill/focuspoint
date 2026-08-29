"use client";

import type { HandleMessageStreamEvent, SessionState } from "eve/client";
import type { EveMessageData } from "eve/react";
import { useEveAgent } from "eve/react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { deriveTitle, useThreads } from "@/app/_components/threads-provider";
import { getEveClient } from "@/lib/eve-client";

/** How often an in-flight turn writes its progress to the DB. */
const CHECKPOINT_INTERVAL_MS = 2500;

/**
 * What we know about the turn currently in flight. eve only advances the
 * session's own cursor once a turn *ends*, so mid-stream `agent.session` still
 * describes the previous turn. We track this in parallel to write an accurate
 * cursor with every checkpoint.
 */
type TurnCursor = {
  readonly sessionId: string;
  readonly continuationToken: string | undefined;
  /** Stream index this turn started at — 0 whenever the server opened a new session. */
  readonly baseIndex: number;
  /** How many events the thread already had when this turn started. */
  readonly baseEvents: number;
};

function liveSession(
  turn: TurnCursor | null,
  settled: SessionState,
  eventCount: number,
): SessionState {
  if (!turn) return settled;
  return {
    continuationToken: turn.continuationToken,
    sessionId: turn.sessionId,
    streamIndex: turn.baseIndex + Math.max(0, eventCount - turn.baseEvents),
  };
}

function firstUserTextOf(data: EveMessageData): string | undefined {
  const firstUser = data.messages.find((m) => m.role === "user");
  const textPart = firstUser?.parts.find((p) => p.type === "text");
  return textPart && "text" in textPart ? textPart.text : undefined;
}

/**
 * Wires a persisted thread to a live eve agent: restores the saved snapshot,
 * checkpoints the thread continuously while a turn streams, and derives the
 * sidebar title from the first user message.
 *
 * The checkpointing is why we own the `ClientSession` instead of letting
 * `useEveAgent` create one. Saving only when a turn finishes meant a closed tab,
 * a reload, or a stream that gave up took the whole exchange with it — the run
 * completed durably on the server, but nothing ever wrote it down. Owning the
 * session also lets us read the live session ID off the send response, which is
 * what `useResumeInterruptedTurn` needs to reattach to a run the browser lost.
 */
export function useThreadAgent(threadId: string) {
  const { getThread, saveSnapshot, rename } = useThreads();
  const thread = getThread(threadId);

  const turnRef = useRef<TurnCursor | null>(null);
  const eventCountRef = useRef(0);

  // Session config is read once, when useEveAgent builds its store. The chat is
  // keyed by thread id, so pointing at another thread is a fresh mount anyway.
  const initialRef = useRef<{
    session: SessionState | undefined;
    events: readonly HandleMessageStreamEvent[] | undefined;
  }>({ session: thread?.session, events: thread?.events });

  const session = useMemo(() => {
    const owned = getEveClient().session(initialRef.current.session);
    const send = owned.send.bind(owned);
    // The POST that opens a turn is the first (and for a brand-new session, the
    // only) place the live session ID appears. Without it a turn interrupted
    // before it ever finished is unresumable.
    owned.send = async (input) => {
      const before = owned.state;
      const response = await send(input);
      turnRef.current = {
        baseEvents: eventCountRef.current,
        // eve restarts the cursor whenever the server hands back a new session.
        baseIndex: before.sessionId === response.sessionId ? before.streamIndex : 0,
        continuationToken: response.continuationToken ?? before.continuationToken,
        sessionId: response.sessionId,
      };
      return response;
    };
    return owned;
  }, []);

  const agent = useEveAgent({
    initialEvents: initialRef.current.events,
    onFinish: (snapshot) => {
      // The turn is over, so the session's own cursor is authoritative again.
      turnRef.current = null;
      saveSnapshot(threadId, {
        events: snapshot.events,
        firstUserText: firstUserTextOf(snapshot.data),
        session: snapshot.session,
      });
    },
    session,
  });

  // Latest values for the checkpoint timer, which fires outside of render.
  const latestRef = useRef({ agent, saveSnapshot, threadId });
  latestRef.current = { agent, saveSnapshot, threadId };
  eventCountRef.current = agent.events.length;

  const savedCountRef = useRef(agent.events.length);

  const checkpoint = useCallback(() => {
    const { agent: live, saveSnapshot: save, threadId: id } = latestRef.current;
    // Nothing new since the last write — don't re-upload the transcript.
    if (live.events.length === 0 || live.events.length === savedCountRef.current) return;
    savedCountRef.current = live.events.length;
    save(id, {
      events: live.events,
      firstUserText: firstUserTextOf(live.data),
      session: liveSession(turnRef.current, live.session, live.events.length),
    });
  }, []);

  // Checkpoint on a timer for as long as a turn is in flight, and once more when
  // it stops being in flight — which includes unmounting, so switching threads
  // mid-answer keeps whatever had arrived.
  useEffect(() => {
    if (agent.status !== "streaming" && agent.status !== "submitted") return;
    const timer = setInterval(checkpoint, CHECKPOINT_INTERVAL_MS);
    return () => {
      clearInterval(timer);
      checkpoint();
    };
  }, [agent.status, checkpoint]);

  // Backgrounding the tab is the moment right before a laptop sleeps, so flush
  // while the page is still alive enough to do it.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") checkpoint();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [checkpoint]);

  // Set the sidebar title as soon as the first user message appears (optimistic,
  // happens instantly on send) rather than waiting for onFinish after the full response.
  useEffect(() => {
    if (thread?.title) return;
    const text = firstUserTextOf(agent.data);
    if (text) rename(threadId, deriveTitle(text));
  }, [agent.data, thread?.title, threadId, rename]);

  return agent;
}
