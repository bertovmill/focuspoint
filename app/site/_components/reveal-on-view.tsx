"use client";

import { useEffect, useRef } from "react";
import type { CSSProperties, ElementType, ReactNode } from "react";
import { animate, inView, stagger } from "motion";

type RevealOnViewProps = {
  as?: ElementType;
  className?: string;
  children: ReactNode;
  style?: CSSProperties;
  /** Seconds to wait before this element animates — used to cascade a list. */
  delay?: number;
  /** `hero` lifts further and blurs harder; `soft` is the default for cards. */
  intensity?: "soft" | "hero";
  /** Animate the direct children in sequence instead of the element itself. */
  staggerChildren?: boolean;
};

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Lifts its contents into place — up, into focus, out of a blur — the first time
 * they scroll into view. Content is fully laid out from the start; only opacity,
 * transform and filter move, so nothing reflows and nothing is hidden from a
 * crawler or a screen reader.
 */
export function RevealOnView({
  as: Tag = "div",
  className,
  children,
  style,
  delay = 0,
  intensity = "soft",
  staggerChildren = false,
}: RevealOnViewProps) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element || prefersReducedMotion()) return;

    const translate = intensity === "hero" ? 28 : 18;
    const blur = intensity === "hero" ? 16 : 10;
    const scale = intensity === "hero" ? 0.965 : 0.98;

    const hide = (el: HTMLElement) => {
      el.style.opacity = "0";
      el.style.transform = `translateY(${translate}px) scale(${scale})`;
      el.style.filter = `blur(${blur}px)`;
    };

    // When staggering, the children carry the animation and the parent stays put.
    const targets = staggerChildren ? (Array.from(element.children) as HTMLElement[]) : [element];
    targets.forEach(hide);

    return inView(element, () => {
      animate(
        targets,
        { opacity: 1, transform: "translateY(0px) scale(1)", filter: "blur(0px)" },
        {
          duration: 0.95,
          delay: targets.length > 1 ? stagger(0.12, { startDelay: delay }) : delay,
          ease: [0.22, 1, 0.36, 1],
        },
      );
    });
  }, [delay, intensity, staggerChildren]);

  return (
    <Tag ref={ref} className={className} style={style}>
      {children}
    </Tag>
  );
}
