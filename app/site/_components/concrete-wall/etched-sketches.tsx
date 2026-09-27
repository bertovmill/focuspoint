/**
 * Sketches etched into the concrete wall beside the chalk plan, like a gallery
 * wall someone has been carving notes into for years: a column of running
 * paces coming down from 5:20 to 3:20 a km, a couple of code diagrams, and a
 * shelf of books that shaped how Berto thinks.
 *
 * Unlike the chalk, these read as cut *into* the wall. Each stroke is drawn
 * three times by the `etch` filter: a dark core, a shadow nudged up-left (the
 * lip the light can't reach) and a pale highlight nudged down-right (the far
 * wall of the groove catching the window light). That's what gives them depth.
 *
 * Same coordinate space and pinning as `ChalkBlueprint`, so the two stay laid
 * out together at any width.
 */

const PACES = [
  ["5:20", "first 5k"],
  ["5:02", ""],
  ["4:48", "10k"],
  ["4:31", ""],
  ["4:15", "tempo"],
  ["4:02", ""],
  ["3:51", "½"],
  ["3:40", ""],
  ["3:31", "800s"],
  ["3:20", "→"],
] as const;

const BOOKS = [
  { title: "ANTIFRAGILE", w: 34, h: 250, tilt: 0 },
  { title: "THE TALENT CODE", w: 30, h: 228, tilt: 0 },
  { title: "THE ALCHEMIST", w: 26, h: 204, tilt: 0 },
  { title: "DEEP WORK", w: 28, h: 236, tilt: 0 },
  { title: "HIGH OUTPUT MGMT", w: 32, h: 244, tilt: 0 },
  { title: "ZERO TO ONE", w: 24, h: 210, tilt: 0 },
  { title: "MEDITATIONS", w: 30, h: 226, tilt: -9 },
] as const;

export function EtchedSketches() {
  // Shelf baseline for the books.
  const shelfY = 770;
  let x = 1218;
  const books = BOOKS.map((b) => {
    const book = { ...b, x };
    x += b.w + 6;
    return book;
  });

  return (
    <svg
      aria-hidden
      className="absolute inset-0 h-full w-full text-[#4d4841] opacity-[0.3] dark:text-[#0f0e0d] dark:opacity-[0.5]"
      viewBox="0 0 1600 900"
      preserveAspectRatio="xMinYMid slice"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <defs>
        {/* Groove: dark core, shadow up-left, highlight down-right. */}
        <filter id="etch" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="2" seed="5" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="3" xChannelSelector="R" yChannelSelector="G" result="cut" />
          <feOffset in="cut" dx="1.6" dy="2" result="lowOff" />
          <feFlood floodColor="#ffffff" floodOpacity="0.95" />
          <feComposite in2="lowOff" operator="in" result="highlight" />
          <feOffset in="cut" dx="-1" dy="-1.2" result="highOff" />
          <feFlood floodColor="#000000" floodOpacity="0.55" />
          <feComposite in2="highOff" operator="in" result="shadow" />
          <feMerge>
            <feMergeNode in="highlight" />
            <feMergeNode in="shadow" />
            <feMergeNode in="cut" />
          </feMerge>
        </filter>
        {/* Wear: pits in the cut so it isn't machine-clean. */}
        <filter id="etch-wear" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="2" seed="21" />
          <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1.8 -0.25" />
        </filter>
        <mask id="etch-mask">
          <rect width="1600" height="900" fill="#fff" filter="url(#etch-wear)" />
        </mask>
      </defs>

      <g mask="url(#etch-mask)">
        <g filter="url(#etch)">
          {/* Running paces, a rough tally scratched down the wall. */}
          <g className="font-mono" fill="currentColor" stroke="none" fontSize="17" letterSpacing="0.08em">
            <text x="1002" y="140" fontSize="13" letterSpacing="0.3em">MIN / KM</text>
            {PACES.map(([pace, note], i) => (
              <g key={pace} transform={`translate(${1004 + (i % 2) * 3} ${178 + i * 38}) rotate(${(i % 3) - 1})`}>
                <text x="0" y="0" textDecoration={i < PACES.length - 1 ? "line-through" : undefined}>
                  {pace}
                </text>
                {note && (
                  <text x="62" y="0" fontSize="12" opacity="0.8">
                    {note}
                  </text>
                )}
              </g>
            ))}
          </g>
          <g strokeWidth="1.6">
            {/* Strike-throughs on all but the last, and a ring round 3:20. */}
            {PACES.slice(0, -1).map((_, i) => (
              <path key={i} d={`M${1000 + (i % 2) * 3} ${172 + i * 38} l52 ${(i % 3) - 1}`} />
            ))}
            <ellipse cx="1030" cy="514" rx="40" ry="18" transform="rotate(-4 1030 514)" />
            {/* Falling line down the side, like a chart axis scratched in. */}
            <path d="M990 160 C 986 280, 996 400, 988 530" />
            <path d="M982 520 l6 12 l6 -12" />
          </g>

          {/* Code diagrams: a little request flow and a bracketed snippet. */}
          <g strokeWidth="1.6">
            <rect x="1230" y="150" width="96" height="46" rx="4" />
            <rect x="1400" y="150" width="96" height="46" rx="4" />
            <rect x="1315" y="268" width="96" height="46" rx="4" />
            <path d="M1326 173 H1396 M1388 167 l8 6 l-8 6" />
            <path d="M1448 196 C 1448 236, 1420 240, 1400 266 M1398 256 l2 10 l10 -3" />
            <path d="M1278 196 C 1278 236, 1300 244, 1318 266" strokeDasharray="5 6" />
            <circle cx="1540" cy="173" r="16" />
            <path d="M1496 173 H1524" />
          </g>
          <g className="font-mono" fill="currentColor" stroke="none" fontSize="13" letterSpacing="0.1em">
            <text x="1250" y="178">client</text>
            <text x="1424" y="178">api</text>
            <text x="1338" y="296">agent</text>
            <text x="1533" y="178">db</text>
            <text x="1236" y="360" fontSize="14">{"{ ship → learn → repeat }"}</text>
            <text x="1236" y="386" fontSize="12" opacity="0.8">{"while (!done) iterate();"}</text>
            <text x="1236" y="410" fontSize="12" opacity="0.8">{"f(x) = small · daily"}</text>
          </g>

          {/* A shelf of books, spines out, titles cut sideways. */}
          <g strokeWidth="1.6">
            <path d={`M1204 ${shelfY} H${x + 20}`} strokeWidth="2.2" />
            {books.map((b) => (
              <g key={b.title} transform={`rotate(${b.tilt} ${b.x} ${shelfY})`}>
                <rect x={b.x} y={shelfY - b.h} width={b.w} height={b.h} rx="2" />
                <path d={`M${b.x + 3} ${shelfY - b.h + 16} h${b.w - 6} M${b.x + 3} ${shelfY - 16} h${b.w - 6}`} strokeWidth="1" />
              </g>
            ))}
          </g>
          <g className="font-mono" fill="currentColor" stroke="none" fontSize="11" letterSpacing="0.14em">
            {books.map((b) => {
              const cx = b.x + b.w / 2 + 4;
              const cy = shelfY - 26;
              return (
                <g key={b.title} transform={`rotate(${b.tilt} ${b.x} ${shelfY})`}>
                  <text x={cx} y={cy} transform={`rotate(-90 ${cx} ${cy})`}>
                    {b.title}
                  </text>
                </g>
              );
            })}
          </g>
        </g>
      </g>
    </svg>
  );
}
