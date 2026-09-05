"use client";

import { ClientError, type ClientSessionState, type HandleMessageStreamEvent } from "eve/client";
import type { EveMessageData, PrepareSend } from "eve/react";
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
  /** Stream index this turn started at — 0 whenever the server opened a new session. */
  readonly baseIndex: number;
  /** How many events the thread already had when this turn started. */
  readonly baseEvents: number;
};

function liveSession(
  turn: TurnCursor | null,
  settled: ClientSessionState | undefined,
  eventCount: number,
): ClientSessionState | undefined {
  if (!turn) return settled;
  return {
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
/**
 * A message that failed because its thread's session had gone stale, waiting to
 * be sent again once the chat has remounted on a fresh session. Keyed by thread
 * so it survives the remount that `onSessionLost` triggers.
 */
const pendingResend = new Map<string, Parameters<PrepareSend>[0]>();

/**
 * eve answers a send to a session it no longer holds — expired (30 days by
 * default), reset, or minted by another deployment — with 409
 * `session_not_active`. Under 0.18 the server quietly opened a new session in
 * that case; since 0.49 sessions are fixed IDs and the client has to do it.
 */
function isStaleSession(error: Error): boolean {
  return error instanceof ClientError && error.code === "session_not_active";
}

export function useThreadAgent(
  threadId: string,
  options: {
    /**
     * The saved session is dead. The transcript has already been re-saved with
     * no session; remount the chat so it starts a fresh one, and the message
     * that failed goes out again on mount.
     */
    onSessionLost?: () => void;
  } = {},
) {
  const { getThread, saveSnapshot, rename } = useThreads();
  const thread = getThread(threadId);

  const turnRef = useRef<TurnCursor | null>(null);
  const eventCountRef = useRef(0);
  // Last session ID the store reported. Survives across turns so a checkpoint
  // taken mid-turn can name the session the events belong to.
  const sessionIdRef = useRef<string | undefined>(thread?.session?.sessionId);

  // Session config is read once, when useEveAgent builds its store. The chat is
  // keyed by thread id, so pointing at another thread is a fresh mount anyway.
  const initialRef = useRef<{
    session: ClientSessionState | undefined;
    events: readonly HandleMessageStreamEvent[] | undefined;
  }>({ session: thread?.session, events: thread?.events });

  // A thread we have seen before is addressed by its own session ID, so we attach
  // a handle to it and hand that to the store. A brand-new thread has no ID yet:
  // the store creates the session on the first send and reports it back through
  // `onSessionChange`, which is where `turnRef` picks it up from then on.
  const session = useMemo(() => {
    const saved = initialRef.current.session;
    if (!saved?.sessionId) return undefined;
    return getEveClient().sessions.attach(saved.sessionId, {
      streamIndex: saved.streamIndex,
    });
  }, []);

  const sessionLostRef = useRef(false);
  const lastSendRef = useRef<Parameters<PrepareSend>[0] | null>(null);
  const onSessionLostRef = useRef(options.onSessionLost);
  onSessionLostRef.current = options.onSessionLost;

  const agent = useEveAgent({
    initialEvents: initialRef.current.events,
    prepareSend: (input) => {
      lastSendRef.current = input;
      return input;
    },
    onError: (error) => {
      if (!isStaleSession(error) || sessionLostRef.current) return;
      sessionLostRef.current = true;
      const { agent: live, saveSnapshot: save, threadId: id } = latestRef.current;
      // Keep every event we have; only the session pointer is wrong.
      save(id, { events: live.events, firstUserText: firstUserTextOf(live.data), session: null });
      if (lastSendRef.current) pendingResend.set(id, lastSendRef.current);
      onSessionLostRef.current?.();
    },
    // Threads saved under eve 0.18 can carry a session with no ID (only a
    // continuation token, which no longer exists). The store's `attach` throws
    // on an undefined ID, so such a thread starts a fresh session instead.
    initialSession:
      session || !initialRef.current.session?.sessionId
        ? undefined
        : initialRef.current.session,
    onSessionChange: (next) => {
      // Where the live session ID comes from once a turn has opened one. Without
      // it a turn interrupted before it ever finished is unresumable.
      if (!next?.sessionId) return;
      sessionIdRef.current = next.sessionId;
    },
    onFinish: (snapshot) => {
      // The turn is over, so the session's own cursor is authoritative again.
      turnRef.current = null;
      saveSnapshot(threadId, {
        events: snapshot.events,
        firstUserText: firstUserTextOf(snapshot.data),
        // A stale session must not be written back over the clear from onError.
        session: sessionLostRef.current ? null : snapshot.session,
      });
    },
    session,
  });

  // Latest values for the checkpoint timer, which fires outside of render.
  const latestRef = useRef({ agent, saveSnapshot, threadId });
  latestRef.current = { agent, saveSnapshot, threadId };

  // Fresh mount after a stale session: send the message that failed, now that
  // there is no session pinned and the store will create one.
  useEffect(() => {
    const pending = pendingResend.get(threadId);
    if (!pending) return;
    pendingResend.delete(threadId);
    const { message, inputResponses: _ignored, ...rest } = pending;
    if (message === undefined) return;
    void latestRef.current.agent.send(message, rest);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);
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
      session: sessionLostRef.current
        ? null
        : liveSession(turnRef.current, live.session, live.events.length),
    });
  }, []);

  // Checkpoint on a timer for as long as a turn is in flight, and once more when
  // it stops being in flight — which includes unmounting, so switching threads
  // mid-answer keeps whatever had arrived.
  useEffect(() => {
    if (agent.status !== "streaming" && agent.status !== "submitted") return;
    // A turn just opened. Remember where it started, because the store only
    // advances its own cursor once a turn *ends* — mid-stream `agent.session`
    // still describes the previous turn. With no session ID yet (the very first
    // turn of a brand-new thread) we leave this null and let the checkpoint fall
    // back to the store's cursor rather than write a cursor with no session.
    if (!turnRef.current) {
      const settled = agent.session;
      const sessionId = sessionIdRef.current ?? settled?.sessionId;
      if (sessionId) {
        turnRef.current = {
          baseEvents: eventCountRef.current,
          // eve restarts the cursor whenever the server hands back a new session.
          baseIndex: settled?.sessionId === sessionId ? settled.streamIndex : 0,
          sessionId,
        };
      }
    }
    const timer = setInterval(checkpoint, CHECKPOINT_INTERVAL_MS);
    return () => {
      clearInterval(timer);
      checkpoint();
    };
  }, [agent.session, agent.status, checkpoint]);

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
