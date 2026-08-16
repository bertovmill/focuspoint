"use client";

import { useEffect, useMemo, useRef } from "react";
import { animate, stagger } from "motion";
import { cn } from "@/lib/utils";

type AnimatedHeadingProps = {
  className?: string;
  /** One string per rendered line. Lines resolve one after another. */
  lines: string[];
  /** Seconds before the first word starts. */
  startDelay?: number;
};

/**
 * The headline, word by word, out of a blur.
 *
 * The animated copy is `aria-hidden` and the real sentence lives on the `h1`'s
 * `aria-label`, so assistive tech reads one clean sentence rather than a pile of
 * spans. If motion is turned off the words are simply already there.
 */
export function AnimatedHeading({ className, lines, startDelay = 0 }: AnimatedHeadingProps) {
  const ref = useRef<HTMLHeadingElement | null>(null);

  // Keep the whitespace as its own token so words stay separable but the line
  // still wraps and spaces the way the browser would do it normally.
  const tokensPerLine = useMemo(() => lines.map((line) => line.split(/(\s+)/)), [lines]);

  useEffect(() => {
    const heading = ref.current;
    if (!heading) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const words = Array.from(heading.querySelectorAll<HTMLSpanElement>("[data-word]"));
    words.forEach((el) => {
      el.style.opacity = "0";
      el.style.filter = "blur(16px)";
      el.style.transform = "translateY(14px)";
    });

    const byLine = new Map<number, HTMLSpanElement[]>();
    for (const el of words) {
      const line = Number(el.dataset.lineIndex ?? 0);
      byLine.set(line, [...(byLine.get(line) ?? []), el]);
    }

    for (const [lineIndex, lineWords] of byLine) {
      animate(
        lineWords,
        { opacity: 1, filter: "blur(0px)", transform: "translateY(0px)" },
        {
          duration: 0.9,
          delay: stagger(0.08, { startDelay: startDelay + lineIndex * 0.3 }),
          ease: [0.22, 1, 0.36, 1],
        },
      );
    }
  }, [startDelay, tokensPerLine]);

  return (
    <h1 ref={ref} className={cn(className)} aria-label={lines.join(" ")}>
      <span aria-hidden>
        {tokensPerLine.map((tokens, lineIndex) => (
          <span key={lines[lineIndex]} className="block">
            {tokens.map((token, tokenIndex) =>
              /^\s+$/.test(token) ? (
                <span key={`space-${lineIndex}-${tokenIndex}`}>{" "}</span>
              ) : (
                <span
                  key={`word-${lineIndex}-${tokenIndex}`}
                  data-word
                  data-line-index={lineIndex}
                  className="inline-block will-change-[transform,filter,opacity]"
                >
                  {token}
                </span>
              ),
            )}
          </span>
        ))}
      </span>
    </h1>
  );
}
