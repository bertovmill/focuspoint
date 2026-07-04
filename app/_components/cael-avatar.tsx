"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export function CaelAvatar({ size = 80, active = false }: { size?: number; active?: boolean }) {
  const [blinking, setBlinking] = useState(false);
  const blinkTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const activeRef = useRef(active);

  useEffect(() => { activeRef.current = active; }, [active]);

  const scheduleBlink = useCallback(() => {
    clearTimeout(blinkTimer.current);
    const delay = 3000 + Math.random() * 5000;
    blinkTimer.current = setTimeout(() => {
      if (activeRef.current) return;
      setBlinking(true);
      setTimeout(() => {
        setBlinking(false);
        if (!activeRef.current) scheduleBlink();
      }, 150);
    }, delay);
  }, []);

  useEffect(() => {
    scheduleBlink();
    return () => clearTimeout(blinkTimer.current);
  }, [scheduleBlink]);

  useEffect(() => {
    if (!active) scheduleBlink();
  }, [active, scheduleBlink]);

  // 80×80 viewBox, each "pixel" = 5×5 SVG units (16×16 grid)
  return (
    <div style={{ width: size, height: size }} className="shrink-0">
      <svg viewBox="0 0 80 80" style={{ width: "100%", height: "100%" }}>
        <style>{`
          @keyframes wizard-pulse {
            0%, 100% { filter: drop-shadow(0 0 3px #A78BFA); }
            50%       { filter: drop-shadow(0 0 12px #7C3AED) drop-shadow(0 0 24px #6D28D9); }
          }
          .wiz-active { animation: wizard-pulse 1.5s ease-in-out infinite; }
        `}</style>
        <g className={active ? "wiz-active" : ""}>

          {/* ── HAT ─────────────────────────────────── */}
          <rect x="35" y="0"  width="10" height="5"  fill="#7C3AED"/>
          <rect x="30" y="5"  width="20" height="5"  fill="#7C3AED"/>
          <rect x="25" y="10" width="30" height="5"  fill="#7C3AED"/>
          <rect x="20" y="15" width="40" height="5"  fill="#7C3AED"/>
          {/* Star on hat (overrides row 3 center) */}
          <rect x="35" y="15" width="10" height="5"  fill="#FCD34D"/>
          <rect x="15" y="20" width="50" height="5"  fill="#7C3AED"/>
          {/* Brim */}
          <rect x="10" y="25" width="60" height="5"  fill="#6D28D9"/>
          <rect x="10" y="30" width="60" height="5"  fill="#5B21B6"/>

          {/* ── FACE ────────────────────────────────── */}
          <rect x="20" y="35" width="40" height="20" fill="#FBBF73"/>
          {/* Chin */}
          <rect x="25" y="55" width="30" height="5"  fill="#FBBF73"/>

          {/* ── EYES ────────────────────────────────── */}
          {blinking ? (
            <>
              <rect x="25" y="42" width="10" height="2" fill="#1C1917"/>
              <rect x="45" y="42" width="10" height="2" fill="#1C1917"/>
            </>
          ) : (
            <>
              <rect x="25" y="40" width="10" height="5" fill="#1C1917"/>
              <rect x="45" y="40" width="10" height="5" fill="#1C1917"/>
              {/* Shines */}
              <rect x="26" y="41" width="3"  height="3" fill="#FFFFFF"/>
              <rect x="46" y="41" width="3"  height="3" fill="#FFFFFF"/>
            </>
          )}

          {/* ── NOSE ────────────────────────────────── */}
          <rect x="35" y="50" width="10" height="5" fill="#D97706"/>

          {/* ── BLUSH ───────────────────────────────── */}
          <rect x="20" y="46" width="5"  height="4" fill="#FCA5A5"/>
          <rect x="55" y="46" width="5"  height="4" fill="#FCA5A5"/>

          {/* ── ROBE SHOULDERS ──────────────────────── */}
          {/* Rows 11-12 (y=55-65) */}
          <rect x="10" y="55" width="15" height="10" fill="#6D28D9"/>
          <rect x="55" y="55" width="15" height="10" fill="#6D28D9"/>
          {/* Rows 13-15 (y=65-80) — flare slightly wider */}
          <rect x="8"  y="65" width="17" height="15" fill="#5B21B6"/>
          <rect x="55" y="65" width="17" height="15" fill="#5B21B6"/>

          {/* ── BEARD ───────────────────────────────── */}
          {/* Mustache row 11 */}
          <rect x="25" y="55" width="30" height="5"  fill="#F8FAFC"/>
          {/* Wide rows 12-13 */}
          <rect x="20" y="60" width="40" height="10" fill="#F8FAFC"/>
          {/* Tapering gray rows 14-15 */}
          <rect x="25" y="70" width="30" height="10" fill="#CBD5E1"/>

        </g>
      </svg>
    </div>
  );
}
