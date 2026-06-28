"use client";

import Lottie from "lottie-react";
import caelAnimation from "@/public/cael-avatar.json";

export function CaelAvatar({ size = 80 }: { size?: number }) {
  return (
    <div style={{ width: size, height: size }} className="shrink-0">
      <Lottie
        animationData={caelAnimation}
        loop
        autoplay
        style={{ width: "100%", height: "100%" }}
        rendererSettings={{ preserveAspectRatio: "xMidYMid meet" }}
      />
    </div>
  );
}
