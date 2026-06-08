/**
 * HeroBackdrop — lightweight, GPU-friendly ambient animation behind the hero.
 *
 * Composition:
 *  • Drifting miniature documents (variety of sizes) — slow translate/rotate loops.
 *  • A signature stroke that writes itself in the lower third every ~14s.
 *  • A verification tick that pops in after the signature, then fades.
 *
 * Constraints:
 *  • Pure SVG + CSS keyframes — no JS, no IntersectionObserver, no deps.
 *  • Only `transform` and `opacity` are animated → composited on the GPU.
 *  • `prefers-reduced-motion` disables motion entirely; a static composition remains.
 *  • `pointer-events: none` and low opacity so it never competes with content.
 */
export function HeroBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <style>{`
        @keyframes hbDrift1 {
          0%, 100% { transform: translate3d(0, 0, 0) rotate(-8deg); }
          50%      { transform: translate3d(0, -10px, 0) rotate(-6deg); }
        }
        @keyframes hbDrift2 {
          0%, 100% { transform: translate3d(0, 0, 0) rotate(6deg); }
          50%      { transform: translate3d(0, 12px, 0) rotate(8deg); }
        }
        @keyframes hbDrift3 {
          0%, 100% { transform: translate3d(0, 0, 0) rotate(-3deg); }
          50%      { transform: translate3d(0, -14px, 0) rotate(-1deg); }
        }
        @keyframes hbDrift4 {
          0%, 100% { transform: translate3d(0, 0, 0) rotate(10deg); }
          50%      { transform: translate3d(0, 8px, 0) rotate(12deg); }
        }
        @keyframes hbDrift5 {
          0%, 100% { transform: translate3d(0, 0, 0) rotate(-12deg); }
          50%      { transform: translate3d(0, -8px, 0) rotate(-14deg); }
        }
        @keyframes hbDrift6 {
          0%, 100% { transform: translate3d(0, 0, 0) rotate(4deg); }
          50%      { transform: translate3d(0, 10px, 0) rotate(2deg); }
        }

        /* Signature: draw → hold → fade. Cycle ~14s. */
        @keyframes hbSignDraw {
          0%   { stroke-dashoffset: 260; opacity: 0; }
          6%   { opacity: 0.18; }
          28%  { stroke-dashoffset: 0;   opacity: 0.18; }
          55%  { stroke-dashoffset: 0;   opacity: 0.18; }
          72%  { stroke-dashoffset: 0;   opacity: 0; }
          100% { stroke-dashoffset: 0;   opacity: 0; }
        }
        /* Tick: pop after signature completes, hold, fade. */
        @keyframes hbTickPop {
          0%, 30% { opacity: 0; transform: scale(0.4); }
          36%     { opacity: 0.28; transform: scale(1.15); }
          42%     { opacity: 0.25; transform: scale(1); }
          62%     { opacity: 0.25; transform: scale(1); }
          74%     { opacity: 0;    transform: scale(1); }
          100%    { opacity: 0;    transform: scale(1); }
        }
        @keyframes hbTickStroke {
          0%, 32%  { stroke-dashoffset: 40; }
          44%      { stroke-dashoffset: 0; }
          100%     { stroke-dashoffset: 0; }
        }

        .hb-doc { will-change: transform; transform-box: fill-box; transform-origin: center; }
        .hb-doc-1 { animation: hbDrift1 16s ease-in-out infinite; }
        .hb-doc-2 { animation: hbDrift2 18s ease-in-out infinite; animation-delay: -3s; }
        .hb-doc-3 { animation: hbDrift3 14s ease-in-out infinite; animation-delay: -6s; }
        .hb-doc-4 { animation: hbDrift4 17s ease-in-out infinite; animation-delay: -2s; }
        .hb-doc-5 { animation: hbDrift5 15s ease-in-out infinite; animation-delay: -8s; }
        .hb-doc-6 { animation: hbDrift6 19s ease-in-out infinite; animation-delay: -5s; }

        .hb-sign {
          stroke-dasharray: 260;
          stroke-dashoffset: 260;
          opacity: 0;
          animation: hbSignDraw 14s ease-in-out infinite;
        }
        .hb-tick-group {
          opacity: 0;
          transform-box: fill-box;
          transform-origin: center;
          animation: hbTickPop 14s ease-in-out infinite;
        }
        .hb-tick-check {
          stroke-dasharray: 40;
          stroke-dashoffset: 40;
          animation: hbTickStroke 14s ease-in-out infinite;
        }

        @media (prefers-reduced-motion: reduce) {
          .hb-doc,
          .hb-sign,
          .hb-tick-group,
          .hb-tick-check {
            animation: none !important;
          }
          .hb-sign { opacity: 0.15; stroke-dashoffset: 0; }
          .hb-tick-group { opacity: 0.22; }
          .hb-tick-check { stroke-dashoffset: 0; }
        }
      `}</style>

      <svg
        viewBox="0 0 1440 800"
        preserveAspectRatio="none"
        width="100%"
        height="100%"
        className="block h-full w-full"
      >
        <defs>
          <linearGradient id="hbDocFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--gold) / 0.14)" />
            <stop offset="100%" stopColor="hsl(var(--gold) / 0.04)" />
          </linearGradient>
        </defs>

        {/* Drifting documents — spread across the full hero canvas.
            Outer <g> positions; inner <g> animates (CSS transform must
            not collide with the SVG transform attribute). */}
        <g transform="translate(90 110)"><g className="hb-doc hb-doc-1"><Doc w={78} h={100} /></g></g>
        <g transform="translate(300 70)"><g className="hb-doc hb-doc-5"><Doc w={54} h={70} /></g></g>
        <g transform="translate(1080 80)"><g className="hb-doc hb-doc-6"><Doc w={62} h={80} /></g></g>
        <g transform="translate(1340 130)"><g className="hb-doc hb-doc-4"><Doc w={92} h={118} /></g></g>

        <g transform="translate(60 400)"><g className="hb-doc hb-doc-3"><Doc w={66} h={86} /></g></g>
        <g transform="translate(1380 420)"><g className="hb-doc hb-doc-2"><Doc w={74} h={96} /></g></g>

        <g transform="translate(160 700)"><g className="hb-doc hb-doc-5"><Doc w={70} h={92} /></g></g>
        <g transform="translate(440 730)"><g className="hb-doc hb-doc-4"><Doc w={56} h={74} /></g></g>
        <g transform="translate(1000 720)"><g className="hb-doc hb-doc-2"><Doc w={64} h={84} /></g></g>
        <g transform="translate(1300 700)"><g className="hb-doc hb-doc-6"><Doc w={96} h={124} /></g></g>

        {/* Signature centered, near the bottom */}
        <g transform="translate(580 600)">
          <path
            className="hb-sign"
            d="M0 30 C 20 0, 40 60, 70 20 S 130 0, 160 28 S 220 10, 260 24"
            fill="none"
            stroke="hsl(var(--gold))"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          {/* Verification tick — right after signature */}
          <g className="hb-tick-group" transform="translate(296 22)">
            <circle r="18" fill="hsl(var(--gold) / 0.18)" stroke="hsl(var(--gold))" strokeWidth="1.4" />
            <path
              className="hb-tick-check"
              d="M -7 1 L -1 8 L 9 -6"
              fill="none"
              stroke="hsl(var(--gold))"
              strokeWidth="2.4"
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
    <g opacity="1">
      <rect
        x={-w / 2}
        y={-h / 2}
        width={w}
        height={h}
        rx="3"
        fill="hsl(var(--gold) / 0.04)"
        stroke="hsl(var(--gold) / 0.30)"
        strokeWidth="0.9"
      />
      {/* corner fold */}
      <path
        d={`M ${w / 2 - 10} ${-h / 2} L ${w / 2} ${-h / 2 + 10} L ${w / 2 - 10} ${-h / 2 + 10} Z`}
        fill="hsl(var(--gold) / 0.12)"
        stroke="hsl(var(--gold) / 0.30)"
        strokeWidth="0.7"
      />
      {/* lines */}
      <g stroke="hsl(var(--gold) / 0.22)" strokeWidth="0.8" strokeLinecap="round">
        <line x1={-w / 2 + 8} y1={-h / 2 + 22} x2={w / 2 - 14} y2={-h / 2 + 22} />
        <line x1={-w / 2 + 8} y1={-h / 2 + 30} x2={w / 2 - 8}  y2={-h / 2 + 30} />
        <line x1={-w / 2 + 8} y1={-h / 2 + 38} x2={w / 2 - 18} y2={-h / 2 + 38} />
        <line x1={-w / 2 + 8} y1={-h / 2 + 46} x2={w / 2 - 10} y2={-h / 2 + 46} />
        <line x1={-w / 2 + 8} y1={-h / 2 + 54} x2={w / 2 - 22} y2={-h / 2 + 54} />
      </g>
    </g>
  );
}
