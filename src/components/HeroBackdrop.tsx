/**
 * HeroBackdrop — one-shot ambient choreography behind the hero.
 *
 * Plays a single elegant sequence on mount, then settles into a static
 * composition (no looping). Pure SVG + CSS keyframes, no JS.
 *
 *  1. Three documents drift into place.
 *  2. A classic feather quill glides in from the lower-left.
 *  3. A signature stroke writes itself in the lower-right.
 *  4. A verification tick pops in to confirm.
 *
 * All keyframes use `forwards` so the final frame stays on screen.
 * `prefers-reduced-motion` skips motion and renders the final composition.
 */
export function HeroBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <style>{`
        @keyframes hbDocIn {
          0%   { opacity: 0; transform: translate3d(var(--hb-from-x, 0), var(--hb-from-y, 16px), 0) rotate(var(--hb-rot-from, 0deg)); }
          100% { opacity: 1; transform: translate3d(0, 0, 0) rotate(var(--hb-rot, 0deg)); }
        }
        @keyframes hbQuillIn {
          0%   { opacity: 0; transform: translate3d(-24px, 18px, 0) rotate(-6deg); }
          100% { opacity: 1; transform: translate3d(0, 0, 0) rotate(0deg); }
        }
        @keyframes hbSignDraw {
          0%   { stroke-dashoffset: 260; opacity: 0; }
          10%  { opacity: 1; }
          100% { stroke-dashoffset: 0;   opacity: 1; }
        }
        @keyframes hbTickPop {
          0%   { opacity: 0; transform: scale(0.4); }
          70%  { opacity: 1; transform: scale(1.12); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes hbTickStroke { to { stroke-dashoffset: 0; } }

        .hb-doc {
          opacity: 0;
          transform-box: fill-box;
          transform-origin: center;
          animation: hbDocIn 900ms cubic-bezier(.2,.8,.2,1) forwards;
        }
        .hb-doc-1 { --hb-from-y: 18px; --hb-rot: -6deg;  --hb-rot-from: -10deg; animation-delay: 200ms; }
        .hb-doc-2 { --hb-from-y: 22px; --hb-rot:  8deg;  --hb-rot-from:  12deg; animation-delay: 450ms; }
        .hb-doc-3 { --hb-from-y: 20px; --hb-rot:  10deg; --hb-rot-from:  14deg; animation-delay: 700ms; }

        .hb-quill {
          opacity: 0;
          transform-box: fill-box;
          transform-origin: center;
          animation: hbQuillIn 1100ms cubic-bezier(.2,.8,.2,1) 950ms forwards;
        }

        .hb-sign {
          stroke-dasharray: 260;
          stroke-dashoffset: 260;
          opacity: 0;
          animation: hbSignDraw 1200ms cubic-bezier(.55,.1,.2,1) 1700ms forwards;
        }
        .hb-tick-group {
          opacity: 0;
          transform-box: fill-box;
          transform-origin: center;
          animation: hbTickPop 520ms cubic-bezier(.34,1.56,.64,1) 2950ms forwards;
        }
        .hb-tick-check {
          stroke-dasharray: 40;
          stroke-dashoffset: 40;
          animation: hbTickStroke 380ms cubic-bezier(.2,.8,.2,1) 3200ms forwards;
        }

        @media (prefers-reduced-motion: reduce) {
          .hb-doc        { opacity: 1; transform: none; animation: none; }
          .hb-quill      { opacity: 1; transform: none; animation: none; }
          .hb-sign       { opacity: 1; stroke-dashoffset: 0; animation: none; }
          .hb-tick-group { opacity: 1; transform: none; animation: none; }
          .hb-tick-check { stroke-dashoffset: 0; animation: none; }
        }
      `}</style>

      <svg
        viewBox="0 0 1440 800"
        preserveAspectRatio="none"
        width="100%"
        height="100%"
        className="block h-full w-full"
      >
        {/* Three documents — sparse, balanced. */}
        <g transform="translate(170 200)"><g className="hb-doc hb-doc-1"><Doc w={72} h={94} /></g></g>
        <g transform="translate(1290 220)"><g className="hb-doc hb-doc-2"><Doc w={86} h={112} /></g></g>
        <g transform="translate(1330 480)"><g className="hb-doc hb-doc-3"><Doc w={74} h={96} /></g></g>

        {/* Classic feather quill — lower-left, diagonal sweep. */}
        <g transform="translate(170 600) rotate(-32)">
          <g className="hb-quill">
            <Quill />
          </g>
        </g>

        {/* Signature + verification tick, bottom-right, clear of all content. */}
        <g transform="translate(980 760)">
          <path
            className="hb-sign"
            d="M0 30 C 20 0, 40 60, 70 20 S 130 0, 160 28 S 220 10, 260 24"
            fill="none"
            stroke="hsl(var(--gold) / 0.38)"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <g className="hb-tick-group" transform="translate(296 22)">
            <circle r="18" fill="hsl(var(--gold) / 0.08)" stroke="hsl(var(--gold) / 0.42)" strokeWidth="1" />
            <path
              className="hb-tick-check"
              d="M -7 1 L -1 8 L 9 -6"
              fill="none"
              stroke="hsl(var(--gold) / 0.65)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        </g>
      </svg>
    </div>
  );
}

/**
 * Quill drawn along +X axis: nib at origin, feather tip at (~220, 0).
 * Shaft curves gently; barbs angle outward on both sides; nib has a split.
 */
function Quill() {
  const stroke = "hsl(var(--gold) / 0.34)";
  const strokeStrong = "hsl(var(--gold) / 0.50)";
  const barb = "hsl(var(--gold) / 0.22)";
  return (
    <g>
      {/* Feather vane — asymmetric leaf around the shaft */}
      <path
        d="M 8 0
           C 40 -22, 110 -30, 180 -14
           C 200 -10, 215 -5, 222 0
           C 215 5, 200 10, 180 14
           C 110 30, 40 22, 8 0 Z"
        fill="hsl(var(--gold) / 0.05)"
        stroke={stroke}
        strokeWidth="0.8"
      />

      {/* Central rachis (shaft) */}
      <path
        d="M 0 0 Q 110 -2, 222 0"
        fill="none"
        stroke={strokeStrong}
        strokeWidth="1.2"
        strokeLinecap="round"
      />

      {/* Upper barbs */}
      <g stroke={barb} strokeWidth="0.65" strokeLinecap="round" fill="none">
        <path d="M 30 -2 Q 36 -10, 44 -18" />
        <path d="M 55 -4 Q 62 -14, 70 -23" />
        <path d="M 80 -6 Q 88 -16, 96 -26" />
        <path d="M 105 -7 Q 114 -17, 122 -27" />
        <path d="M 130 -8 Q 140 -16, 148 -25" />
        <path d="M 155 -8 Q 165 -14, 172 -21" />
        <path d="M 180 -7 Q 188 -11, 195 -16" />
      </g>

      {/* Lower barbs */}
      <g stroke={barb} strokeWidth="0.65" strokeLinecap="round" fill="none">
        <path d="M 30 2 Q 36 10, 44 18" />
        <path d="M 55 4 Q 62 14, 70 23" />
        <path d="M 80 6 Q 88 16, 96 26" />
        <path d="M 105 7 Q 114 17, 122 27" />
        <path d="M 130 8 Q 140 16, 148 25" />
        <path d="M 155 8 Q 165 14, 172 21" />
        <path d="M 180 7 Q 188 11, 195 16" />
      </g>

      {/* Nib — tapered metal tip with split */}
      <path
        d="M 8 -2 L -14 0 L 8 2 Z"
        fill="hsl(var(--gold) / 0.22)"
        stroke={strokeStrong}
        strokeWidth="0.9"
        strokeLinejoin="round"
      />
      <line x1="-12" y1="0" x2="2" y2="0" stroke={strokeStrong} strokeWidth="0.6" strokeLinecap="round" />

      {/* A single tiny ink dot trailing from the nib */}
      <circle cx="-22" cy="2" r="1.3" fill="hsl(var(--gold) / 0.45)" />
    </g>
  );
}

function Doc({ w, h }: { w: number; h: number }) {
  return (
    <g>
      <rect
        x={-w / 2}
        y={-h / 2}
        width={w}
        height={h}
        rx="3"
        fill="hsl(var(--gold) / 0.02)"
        stroke="hsl(var(--gold) / 0.18)"
        strokeWidth="0.7"
      />
      <path
        d={`M ${w / 2 - 10} ${-h / 2} L ${w / 2} ${-h / 2 + 10} L ${w / 2 - 10} ${-h / 2 + 10} Z`}
        fill="hsl(var(--gold) / 0.05)"
        stroke="hsl(var(--gold) / 0.18)"
        strokeWidth="0.5"
      />
      <g stroke="hsl(var(--gold) / 0.13)" strokeWidth="0.6" strokeLinecap="round">
        <line x1={-w / 2 + 8} y1={-h / 2 + 24} x2={w / 2 - 14} y2={-h / 2 + 24} />
        <line x1={-w / 2 + 8} y1={-h / 2 + 34} x2={w / 2 - 8}  y2={-h / 2 + 34} />
        <line x1={-w / 2 + 8} y1={-h / 2 + 44} x2={w / 2 - 18} y2={-h / 2 + 44} />
        <line x1={-w / 2 + 8} y1={-h / 2 + 54} x2={w / 2 - 22} y2={-h / 2 + 54} />
      </g>
    </g>
  );
}
