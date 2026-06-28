"use client";

import Lottie from "lottie-react";
import { useRef, useEffect, useCallback } from "react";
import caelAnimation from "@/public/cael-avatar.json";

// Segment layout baked into the Lottie JSON:
//   Frame 0       — static idle pose (eyes open)
//   Frames 1-12   — blink (eyes close → hold → reopen)
//   Frames 20-80  — active breathing (orb scale + glow pulse)
const BLINK: [number, number] = [1, 13];
const ACTIVE: [number, number] = [20, 80];

export function CaelAvatar({
  size = 80,
  active = false,
}: {
  size?: number;
  active?: boolean;
}) {
  const lottieRef = useRef<any>(null);
  const blinkTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const activeRef = useRef(active);

  const goIdle = useCallback(() => {
    lottieRef.current?.goToAndStop(0, true);
  }, []);

  const scheduleBlink = useCallback(() => {
    // Random blink every 5–10 seconds
    const delay = 5000 + Math.random() * 5000;
    blinkTimer.current = setTimeout(() => {
      if (!activeRef.current) {
        lottieRef.current?.playSegments(BLINK, true);
        // Return to idle after the blink segment finishes (~400ms)
        setTimeout(() => {
          if (!activeRef.current) {
            goIdle();
            scheduleBlink();
          }
        }, ((BLINK[1] - BLINK[0]) / 30) * 1000 + 50);
      }
    }, delay);
  }, [goIdle]);

  // When the active segment finishes, loop it or return to idle
  const handleComplete = useCallback(() => {
    if (activeRef.current) {
      lottieRef.current?.playSegments(ACTIVE, true);
    }
  }, []);

  // React to active prop changes
  useEffect(() => {
    activeRef.current = active;
    clearTimeout(blinkTimer.current);

    if (!lottieRef.current) return;

    if (active) {
      lottieRef.current.playSegments(ACTIVE, true);
    } else {
      goIdle();
      scheduleBlink();
    }
  }, [active, goIdle, scheduleBlink]);

  // Initialize: freeze on frame 0, then start the blink cycle
  useEffect(() => {
    const t = setTimeout(() => {
      goIdle();
      scheduleBlink();
    }, 80);
    return () => {
      clearTimeout(t);
      clearTimeout(blinkTimer.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ width: size, height: size }} className="shrink-0">
      <Lottie
        lottieRef={lottieRef}
        animationData={caelAnimation}
        loop={false}
        autoplay={false}
        onComplete={handleComplete}
        style={{ width: "100%", height: "100%" }}
        rendererSettings={{ preserveAspectRatio: "xMidYMid meet" }}
      />
    </div>
  );
}
