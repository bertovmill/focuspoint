"use client";

import type { ClientSessionState, HandleMessageStreamEvent } from "eve/client";
import { isCurrentTurnBoundaryEvent } from "eve/client";
import { type MutableRefObject, useEffect, useRef, useState } from "react";
import { useThreads } from "@/app/_components/threads-provider";
import { STREAM_RECONNECT_POLICY, getEveClient } from "@/lib/eve-client";

/**
 * A thread whose saved events stop mid-turn was interrupted on *this* side: the
 * tab closed, the network died, the laptop slept. The run itself is durable and
 * keeps going on the server, so the rest of the answer exists — we just never
 * received it.
 *
 * The session ID is the tell that the cursor can be trusted. eve's own
 * `advanceSession` wipes it whenever a turn ends without a boundary event, so
 * threads saved before mid-turn checkpointing existed have no session ID and are
 * skipped here rather than replayed from a stale index.
 */
function isResumable(
  events: readonly HandleMessageStreamEvent[] | undefined,
  session: ClientSessionState | undefined,
): session is ClientSessionState {
  if (!session?.sessionId || !events?.length) return false;
  return !isCurrentTurnBoundaryEvent(events[events.length - 1]!);
}

/**
 * Reattaches to an interrupted run on load and collects the rest of its answer.
 *
 * Returns a `generation` to key the chat on: it ticks once, when a resume lands,
 * so the agent remounts with the recovered transcript. `busy` lets the chat tell
 * us a turn is in flight — remounting then would abort a live answer to recover
 * an old one, so in that case the recovered events are only written to the DB and
 * show up the next time the thread is opened.
 */
export function useResumeInterruptedTurn(threadId: string) {
  const { getThread, saveSnapshot } = useThreads();
  const [resuming, setResuming] = useState(false);
  const [generation, setGeneration] = useState(0);
  const busy = useRef(false);

  const latestRef = useRef({ getThread, saveSnapshot });
  latestRef.current = { getThread, saveSnapshot };

  useEffect(() => {
    const thread = latestRef.current.getThread(threadId);
    const saved = thread?.session;
    const base = thread?.events;
    if (!thread || !isResumable(base, saved)) return;

    const controller = new AbortController();
    setResuming(true);

    void (async () => {
      const session = getEveClient().sessions.attach(saved.sessionId, {
        streamIndex: saved.streamIndex,
      });
      const recovered: HandleMessageStreamEvent[] = [];
      try {
        for await (const event of session.stream({
          signal: controller.signal,
          startIndex: saved.streamIndex,
          streamReconnectPolicy: STREAM_RECONNECT_POLICY,
        })) {
          recovered.push(event);
          // The stream stays open between turns; stop at the end of this one.
          if (isCurrentTurnBoundaryEvent(event)) break;
        }
      } catch {
        // The run may be genuinely gone. Whatever we did recover is still worth
        // keeping, and the partial answer already on screen stays put.
      }
      if (controller.signal.aborted) return;
      setResuming(false);
      if (recovered.length === 0) return;
      latestRef.current.saveSnapshot(threadId, {
        events: [...base!, ...recovered],
        session: session.state,
      });
      if (!busy.current) setGeneration((n) => n + 1);
    })();

    return () => controller.abort();
  }, [threadId]);

  return { busy: busy as MutableRefObject<boolean>, generation, resuming };
}
