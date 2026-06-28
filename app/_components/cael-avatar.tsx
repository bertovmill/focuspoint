"use client";

import { useRive, Layout, Fit, Alignment } from "@rive-app/react-canvas";
import { useEffect, useState } from "react";

function CaelPlaceholder() {
  return (
    <div className="relative size-full flex items-center justify-center">
      {/* Outer glow ring */}
      <div
        className="absolute inset-0 rounded-full opacity-20"
        style={{
          background: "radial-gradient(circle, hsl(var(--primary)) 0%, transparent 70%)",
          animation: "cael-pulse 3s ease-in-out infinite",
        }}
      />
      {/* Mid ring */}
      <div
        className="absolute inset-[15%] rounded-full border border-primary/30"
        style={{ animation: "cael-spin 8s linear infinite" }}
      />
      {/* Core orb */}
      <div
        className="relative size-[52%] rounded-full bg-gradient-to-br from-primary/60 to-primary/20 border border-primary/40 flex items-center justify-center"
        style={{ animation: "cael-breathe 4s ease-in-out infinite" }}
      >
        {/* Inner highlight */}
        <div className="absolute top-[18%] left-[22%] size-[22%] rounded-full bg-white/30 blur-[2px]" />
      </div>
      <style>{`
        @keyframes cael-pulse {
          0%, 100% { opacity: 0.15; transform: scale(1); }
          50% { opacity: 0.35; transform: scale(1.08); }
        }
        @keyframes cael-breathe {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        @keyframes cael-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

function CaelRive({ src }: { src: string }) {
  const { RiveComponent } = useRive({
    src,
    stateMachines: "Cael_Machine",
    layout: new Layout({ fit: Fit.Contain, alignment: Alignment.Center }),
    autoplay: true,
  });
  return <RiveComponent className="size-full" />;
}

export function CaelAvatar({
  src,
  size = 80,
}: {
  src?: string;
  size?: number;
}) {
  const [riveReady, setRiveReady] = useState(false);

  useEffect(() => {
    if (!src) return;
    fetch(src, { method: "HEAD" })
      .then((r) => { if (r.ok) setRiveReady(true); })
      .catch(() => {});
  }, [src]);

  return (
    <div
      style={{ width: size, height: size }}
      className="shrink-0 relative rounded-full overflow-hidden"
    >
      {riveReady && src ? <CaelRive src={src} /> : <CaelPlaceholder />}
    </div>
  );
}
