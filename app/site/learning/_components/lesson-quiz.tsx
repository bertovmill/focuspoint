"use client";

import { useState } from "react";
import { CheckIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { QuizQuestion } from "@/lib/learning";

/**
 * The quiz under every lesson. Each question locks after one pick and shows
 * why. When all are answered, the score card appears with a "Post on X" link:
 * a plain intent URL, so nothing is posted without the reader pressing Post
 * on x.com themselves.
 */
export function LessonQuiz({
  title,
  questions,
  shareUrl,
}: {
  title: string;
  questions: QuizQuestion[];
  shareUrl: string;
}) {
  const [picks, setPicks] = useState<(number | null)[]>(() => questions.map(() => null));
  const answered = picks.filter((p) => p !== null).length;
  const right = picks.filter((p, i) => p === questions[i].answer).length;
  const done = answered === questions.length;
  const perfect = done && right === questions.length;

  const tweet =
    `I got ${right}/${questions.length} on @robrt_mill's ${title} quiz. Your turn: ${shareUrl}`;
  const intent = `https://x.com/intent/post?text=${encodeURIComponent(tweet)}`;

  return (
    <div className="mt-8 space-y-6">
      {questions.map((q, i) => {
        const pick = picks[i];
        return (
          <fieldset key={i} className="rounded-2xl border border-border bg-card p-5 sm:p-6">
            <legend className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Question {i + 1} of {questions.length}
            </legend>
            <p className="mt-2 font-medium leading-snug">{q.prompt}</p>
            <div className="mt-4 space-y-2">
              {q.options.map((opt, j) => {
                const chosen = pick === j;
                const isRight = j === q.answer;
                return (
                  <button
                    key={j}
                    type="button"
                    disabled={pick !== null}
                    onClick={() =>
                      setPicks((prev) => prev.map((p, k) => (k === i ? j : p)))
                    }
                    className={cn(
                      "flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-left text-sm leading-relaxed transition-colors",
                      pick === null && "border-border hover:border-primary/60 hover:bg-primary/5",
                      pick !== null && isRight && "border-emerald-500/60 bg-emerald-500/10",
                      pick !== null && chosen && !isRight && "border-destructive/60 bg-destructive/10",
                      pick !== null && !chosen && !isRight && "border-border/60 text-muted-foreground",
                    )}
                  >
                    {pick !== null && isRight && <CheckIcon className="mt-0.5 size-4 shrink-0 text-emerald-600" />}
                    {pick !== null && chosen && !isRight && <XIcon className="mt-0.5 size-4 shrink-0 text-destructive" />}
                    <span>{opt}</span>
                  </button>
                );
              })}
            </div>
            {pick !== null && (
              <p className={cn("mt-4 text-sm leading-relaxed", pick === q.answer ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground")}>
                {pick === q.answer ? "Right. " : "Not quite. "}
                {q.why}
              </p>
            )}
          </fieldset>
        );
      })}

      {done && (
        <div id="score" className="rounded-2xl border border-primary/30 bg-primary/5 p-6">
          <p className="text-2xl font-semibold tracking-tight">
            {right} of {questions.length}
          </p>
          <p className="mt-2 text-muted-foreground">
            {perfect
              ? "You got it. Tell people."
              : "Re-read the feedback on the ones you missed, then post your score anyway. Honest beats perfect."}
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <a
              href={intent}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
            >
              Post your score on X
            </a>
            <button
              type="button"
              onClick={() => setPicks(questions.map(() => null))}
              className="inline-flex items-center rounded-full border border-border px-5 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
            >
              Try again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
