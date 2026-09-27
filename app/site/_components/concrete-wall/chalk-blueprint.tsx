/**
 * Faint chalk lines on the concrete wall: an abstract architect's plan, drawn
 * as if someone sketched it on the wall and half of it has rubbed off.
 *
 * Pure SVG, no runtime cost. The strokes are roughed up two ways: a turbulence
 * displacement bends them so nothing is ruler-straight, and a grainy mask
 * knocks holes in them so they read as chalk dust rather than ink. Sits over
 * both the WebGPU and CSS walls, under the hero content, and is deliberately
 * low-contrast so the headline still owns the frame.
 *
 * The drawing is pinned to the left edge (`xMinYMid`) and shifted so the plan's
 * left wall lines up with the headline at any viewport width.
 */
export function ChalkBlueprint() {
  return (
    <svg
      aria-hidden
      className="absolute inset-0 h-full w-full text-[#5f5a52] opacity-[0.16] mix-blend-multiply dark:text-[#b5afa5] dark:opacity-[0.11] dark:mix-blend-screen"
      viewBox="0 0 1600 900"
      preserveAspectRatio="xMinYMid slice"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <defs>
        {/* Bend the lines so they look hand-drawn. */}
        <filter id="chalk-wobble" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="2" seed="3" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="6" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        {/* Grain that breaks the strokes up into chalk dust. */}
        <filter id="chalk-grain" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="11" />
          <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 2.2 -0.55" />
        </filter>
        <mask id="chalk-mask">
          <rect width="1600" height="900" fill="#fff" filter="url(#chalk-grain)" />
        </mask>
      </defs>

      <g mask="url(#chalk-mask)" filter="url(#chalk-wobble)">
        <g transform="translate(-610 0)">
        {/* Footprint of the plan. */}
        <g strokeWidth="2.2">
          <path d="M640 210 H1330 V690 H640 Z" />
          <path d="M640 430 H905 M905 210 V690 M905 560 H1330 M1120 210 V560" />
          <path d="M760 430 V510 M760 510 H905" strokeWidth="1.6" />
          {/* Door swings. */}
          <path d="M905 470 A40 40 0 0 1 945 430" strokeWidth="1.4" />
          <path d="M1120 610 A50 50 0 0 0 1170 560" strokeWidth="1.4" />
        </g>

        {/* Columns. */}
        <g strokeWidth="1.8">
          <circle cx="1000" cy="330" r="14" />
          <circle cx="1230" cy="330" r="14" />
          <circle cx="1000" cy="640" r="14" />
          <path d="M1230 620 h20 v20 h-20 Z" />
        </g>

        {/* Dimension lines with tick ends. */}
        <g strokeWidth="1.4">
          <path d="M640 150 H1330 M640 138 V162 M1330 138 V162 M905 140 V160 M1120 140 V160" />
          <path d="M1400 210 V690 M1388 210 H1412 M1388 690 H1412 M1390 430 H1410" />
          <path d="M580 430 V690 M568 430 H592 M568 690 H592" />
        </g>

        {/* Section cut and north arrow. */}
        <g strokeWidth="1.6">
          <path d="M1040 170 V730" strokeDasharray="14 10" />
          <path d="M1040 160 l-12 18 M1040 160 l12 18" />
          <path d="M1470 270 v-90 M1470 180 l-10 16 M1470 180 l10 16" />
          <circle cx="1470" cy="290" r="18" />
        </g>

        {/* Grid ghost in the corner, like the start of a second sheet. */}
        <g strokeWidth="1">
          <path d="M1180 760 H1560 M1180 800 H1560 M1180 840 H1560 M1220 740 V860 M1300 740 V860 M1380 740 V860 M1460 740 V860" />
        </g>

        {/* A few scrawled figures. Small, mono, mostly unreadable on purpose. */}
        <g fill="currentColor" stroke="none" className="font-mono" fontSize="16" letterSpacing="0.12em">
          <text x="960" y="130">6 900</text>
          <text x="1420" y="450" transform="rotate(90 1420 450)">4 800</text>
          <text x="600" y="565" transform="rotate(-90 600 565)">2 600</text>
          <text x="1055" y="720">A</text>
          <text x="1055" y="200">A</text>
          <text x="1350" y="720">r = 0.6</text>
        </g>
        </g>
      </g>
    </svg>
  );
}
