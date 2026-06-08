/**
 * HeroBackdrop — one-shot ambient choreography behind the hero.
 *
 * Plays a single ~4s elegant sequence on mount, then settles into a
 * static composition (no looping). Pure SVG + CSS keyframes, no JS.
 *
 *  1. A few documents fade/drift into place from off-axis positions.
 *  2. A signature stroke writes itself in the lower third.
 *  3. A verification tick pops in to confirm.
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
        @keyframes hbFadeIn     { to { opacity: 1; } }

        .hb-doc {
          opacity: 0;
          transform-box: fill-box;
          transform-origin: center;
          animation: hbDocIn 900ms cubic-bezier(.2,.8,.2,1) forwards;
        }
        .hb-doc-1 { --hb-from-y: 18px; --hb-rot: -6deg;  --hb-rot-from: -10deg; animation-delay: 200ms; }
        .hb-doc-2 { --hb-from-y: 22px; --hb-rot:  8deg;  --hb-rot-from:  12deg; animation-delay: 400ms; }
        .hb-doc-3 { --hb-from-y: 14px; --hb-rot: -3deg;  --hb-rot-from:  -7deg; animation-delay: 600ms; }
        .hb-doc-4 { --hb-from-y: 20px; --hb-rot:  10deg; --hb-rot-from:  14deg; animation-delay: 800ms; }
        .hb-doc-5 { --hb-from-y: 16px; --hb-rot: -12deg; --hb-rot-from: -16deg; animation-delay: 1000ms; }

        .hb-sign {
          stroke-dasharray: 260;
          stroke-dashoffset: 260;
          opacity: 0;
          animation: hbSignDraw 1200ms cubic-bezier(.55,.1,.2,1) 1600ms forwards;
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
        {/* Sparse, balanced composition — 5 documents, asymmetric but settled. */}
        <g transform="translate(150 180)"><g className="hb-doc hb-doc-1"><Doc w={72} h={94} /></g></g>
        <g transform="translate(1290 200)"><g className="hb-doc hb-doc-2"><Doc w={86} h={112} /></g></g>
        <g transform="translate(100 420)"><g className="hb-doc hb-doc-3"><Doc w={64} h={84} /></g></g>
        <g transform="translate(1340 440)"><g className="hb-doc hb-doc-4"><Doc w={78} h={102} /></g></g>
        <g transform="translate(1140 110)"><g className="hb-doc hb-doc-5"><Doc w={54} h={70} /></g></g>

        {/* Signature + verification tick, bottom-right, clear of all content. */}
        <g transform="translate(980 760)">
          <path
            className="hb-sign"
            d="M0 30 C 20 0, 40 60, 70 20 S 130 0, 160 28 S 220 10, 260 24"
            fill="none"
            stroke="hsl(var(--gold) / 0.55)"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <g className="hb-tick-group" transform="translate(296 22)">
            <circle r="18" fill="hsl(var(--gold) / 0.16)" stroke="hsl(var(--gold) / 0.65)" strokeWidth="1.2" />
            <path
              className="hb-tick-check"
              d="M -7 1 L -1 8 L 9 -6"
              fill="none"
              stroke="hsl(var(--gold) / 0.85)"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        </g>
      </svg>
    </div>
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
        fill="hsl(var(--gold) / 0.03)"
        stroke="hsl(var(--gold) / 0.28)"
        strokeWidth="0.8"
      />
      <path
        d={`M ${w / 2 - 10} ${-h / 2} L ${w / 2} ${-h / 2 + 10} L ${w / 2 - 10} ${-h / 2 + 10} Z`}
        fill="hsl(var(--gold) / 0.10)"
        stroke="hsl(var(--gold) / 0.28)"
        strokeWidth="0.6"
      />
      <g stroke="hsl(var(--gold) / 0.20)" strokeWidth="0.7" strokeLinecap="round">
        <line x1={-w / 2 + 8} y1={-h / 2 + 24} x2={w / 2 - 14} y2={-h / 2 + 24} />
        <line x1={-w / 2 + 8} y1={-h / 2 + 34} x2={w / 2 - 8}  y2={-h / 2 + 34} />
        <line x1={-w / 2 + 8} y1={-h / 2 + 44} x2={w / 2 - 18} y2={-h / 2 + 44} />
        <line x1={-w / 2 + 8} y1={-h / 2 + 54} x2={w / 2 - 22} y2={-h / 2 + 54} />
      </g>
    </g>
  );
}
