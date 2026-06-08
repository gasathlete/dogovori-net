/**
 * HeroBackdrop — one-shot ambient choreography behind the hero.
 *
 * Plays a single elegant sequence on mount, then settles into a static
 * composition (no looping). Pure SVG + CSS keyframes, no JS.
 *
 *  1. A trio of documents drifts into place.
 *  2. A quill + inkwell fades in mid-canvas.
 *  3. A wax/round stamp presses down on the upper-left.
 *  4. A signature stroke writes itself in the lower-right.
 *  5. A verification tick pops in to confirm.
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
        @keyframes hbFadeUp {
          0%   { opacity: 0; transform: translate3d(0, 10px, 0); }
          100% { opacity: 1; transform: translate3d(0, 0, 0); }
        }
        @keyframes hbStampIn {
          0%   { opacity: 0; transform: scale(1.6) rotate(-18deg); }
          70%  { opacity: 1; transform: scale(0.94) rotate(-10deg); }
          100% { opacity: 1; transform: scale(1) rotate(-12deg); }
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
          animation: hbFadeUp 900ms cubic-bezier(.2,.8,.2,1) 1000ms forwards;
        }
        .hb-stamp {
          opacity: 0;
          transform-box: fill-box;
          transform-origin: center;
          animation: hbStampIn 700ms cubic-bezier(.34,1.56,.64,1) 1400ms forwards;
        }

        .hb-sign {
          stroke-dasharray: 260;
          stroke-dashoffset: 260;
          opacity: 0;
          animation: hbSignDraw 1200ms cubic-bezier(.55,.1,.2,1) 1900ms forwards;
        }
        .hb-tick-group {
          opacity: 0;
          transform-box: fill-box;
          transform-origin: center;
          animation: hbTickPop 520ms cubic-bezier(.34,1.56,.64,1) 3150ms forwards;
        }
        .hb-tick-check {
          stroke-dasharray: 40;
          stroke-dashoffset: 40;
          animation: hbTickStroke 380ms cubic-bezier(.2,.8,.2,1) 3400ms forwards;
        }

        @media (prefers-reduced-motion: reduce) {
          .hb-doc        { opacity: 1; transform: none; animation: none; }
          .hb-quill      { opacity: 1; transform: none; animation: none; }
          .hb-stamp      { opacity: 1; transform: rotate(-12deg); animation: none; }
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
        <g transform="translate(1330 470)"><g className="hb-doc hb-doc-3"><Doc w={74} h={96} /></g></g>

        {/* Round wax stamp — upper-left area. */}
        <g transform="translate(280 540)">
          <g className="hb-stamp">
            <circle r="38" fill="hsl(var(--gold) / 0.04)" stroke="hsl(var(--gold) / 0.32)" strokeWidth="1.4" />
            <circle r="30" fill="none" stroke="hsl(var(--gold) / 0.22)" strokeWidth="0.8" />
            <text
              x="0" y="3"
              textAnchor="middle"
              fontFamily="ui-serif, Georgia, serif"
              fontSize="13"
              letterSpacing="2"
              fill="hsl(var(--gold) / 0.55)"
            >VERIFIED</text>
            <path
              d="M -10 10 L 0 18 L 10 10"
              fill="none"
              stroke="hsl(var(--gold) / 0.38)"
              strokeWidth="1"
              strokeLinecap="round"
            />
          </g>
        </g>

        {/* Quill + inkwell — mid-left, anchoring composition. */}
        <g transform="translate(150 640)">
          <g className="hb-quill">
            {/* Inkwell */}
            <ellipse cx="0" cy="38" rx="26" ry="6" fill="hsl(var(--gold) / 0.10)" stroke="hsl(var(--gold) / 0.28)" strokeWidth="0.8" />
            <path d="M -22 38 L -18 12 Q 0 8 18 12 L 22 38 Z" fill="hsl(var(--gold) / 0.05)" stroke="hsl(var(--gold) / 0.30)" strokeWidth="0.9" />
            <ellipse cx="0" cy="12" rx="18" ry="4" fill="hsl(var(--gold) / 0.18)" stroke="hsl(var(--gold) / 0.32)" strokeWidth="0.8" />
            {/* Quill shaft */}
            <path
              d="M 4 12 Q 30 -40, 70 -110"
              fill="none"
              stroke="hsl(var(--gold) / 0.42)"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
            {/* Quill feather barbs */}
            <g stroke="hsl(var(--gold) / 0.26)" strokeWidth="0.8" strokeLinecap="round" fill="none">
              <path d="M 18 -22 Q 28 -28, 36 -22" />
              <path d="M 28 -42 Q 40 -48, 50 -40" />
              <path d="M 38 -62 Q 52 -68, 62 -58" />
              <path d="M 48 -82 Q 62 -86, 70 -76" />
              <path d="M 58 -100 Q 68 -102, 74 -94" />
            </g>
            {/* Feather body */}
            <path
              d="M 8 -8 Q 38 -50, 70 -110 Q 56 -76, 30 -36 Q 18 -16, 8 -8 Z"
              fill="hsl(var(--gold) / 0.06)"
              stroke="hsl(var(--gold) / 0.28)"
              strokeWidth="0.8"
            />
          </g>
        </g>

        {/* Signature + verification tick, bottom-right, clear of all content. */}
        <g transform="translate(980 760)">
          <path
            className="hb-sign"
            d="M0 30 C 20 0, 40 60, 70 20 S 130 0, 160 28 S 220 10, 260 24"
            fill="none"
            stroke="hsl(var(--gold) / 0.42)"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <g className="hb-tick-group" transform="translate(296 22)">
            <circle r="18" fill="hsl(var(--gold) / 0.10)" stroke="hsl(var(--gold) / 0.48)" strokeWidth="1.1" />
            <path
              className="hb-tick-check"
              d="M -7 1 L -1 8 L 9 -6"
              fill="none"
              stroke="hsl(var(--gold) / 0.70)"
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
        stroke="hsl(var(--gold) / 0.20)"
        strokeWidth="0.7"
      />
      <path
        d={`M ${w / 2 - 10} ${-h / 2} L ${w / 2} ${-h / 2 + 10} L ${w / 2 - 10} ${-h / 2 + 10} Z`}
        fill="hsl(var(--gold) / 0.06)"
        stroke="hsl(var(--gold) / 0.20)"
        strokeWidth="0.5"
      />
      <g stroke="hsl(var(--gold) / 0.14)" strokeWidth="0.6" strokeLinecap="round">
        <line x1={-w / 2 + 8} y1={-h / 2 + 24} x2={w / 2 - 14} y2={-h / 2 + 24} />
        <line x1={-w / 2 + 8} y1={-h / 2 + 34} x2={w / 2 - 8}  y2={-h / 2 + 34} />
        <line x1={-w / 2 + 8} y1={-h / 2 + 44} x2={w / 2 - 18} y2={-h / 2 + 44} />
        <line x1={-w / 2 + 8} y1={-h / 2 + 54} x2={w / 2 - 22} y2={-h / 2 + 54} />
      </g>
    </g>
  );
}
