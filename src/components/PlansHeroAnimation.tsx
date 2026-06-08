/**
 * One-shot 3.5s animation that plays in the dark hero area of /plans.
 * Tells a tiny story: blank page → text fills in → signature → success ✓.
 * All CSS keyframes use `animation-fill-mode: forwards` and run exactly once,
 * so the final composed state stays on screen after the sequence ends.
 */
export function PlansHeroAnimation() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 mx-auto flex h-[240px] w-full max-w-sm items-center justify-center sm:h-[280px] md:h-[320px]"
    >
      <style>{`
        @keyframes plansDocRise {
          0%   { opacity: 0; transform: translateY(14px) scale(0.96); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes plansLineDraw {
          0%   { transform: scaleX(0); }
          100% { transform: scaleX(1); }
        }
        @keyframes plansStrokeDraw {
          to { stroke-dashoffset: 0; }
        }
        @keyframes plansBadgePop {
          0%   { opacity: 0; transform: scale(0.4); }
          60%  { opacity: 1; transform: scale(1.12); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes plansGlow {
          0%   { opacity: 0; }
          100% { opacity: 1; }
        }
        @keyframes plansFadeIn {
          to { opacity: 1; }
        }

        .plans-anim-doc      { opacity: 0; animation: plansDocRise 600ms cubic-bezier(.2,.8,.2,1) 100ms forwards; transform-origin: 50% 60%; }
        .plans-anim-line     { opacity: 0; animation: plansFadeIn 200ms linear forwards, plansLineDraw 420ms cubic-bezier(.2,.8,.2,1) forwards; transform-origin: left center; }
        .plans-anim-line-1   { animation-delay: 700ms, 700ms; }
        .plans-anim-line-2   { animation-delay: 900ms, 900ms; }
        .plans-anim-line-3   { animation-delay: 1100ms, 1100ms; }
        .plans-anim-line-4   { animation-delay: 1300ms, 1300ms; }

        .plans-anim-sign-base { opacity: 0; animation: plansFadeIn 240ms linear 1600ms forwards; }
        .plans-anim-sign      {
          stroke-dasharray: 220;
          stroke-dashoffset: 220;
          animation: plansStrokeDraw 900ms cubic-bezier(.55,.1,.2,1) 1700ms forwards;
        }

        .plans-anim-badge {
          opacity: 0;
          transform-box: fill-box;
          transform-origin: center;
          animation: plansBadgePop 520ms cubic-bezier(.34,1.56,.64,1) 2700ms forwards;
        }
        .plans-anim-check {
          stroke-dasharray: 40;
          stroke-dashoffset: 40;
          animation: plansStrokeDraw 380ms cubic-bezier(.2,.8,.2,1) 2950ms forwards;
        }
        .plans-anim-glow  { opacity: 0; animation: plansGlow 600ms ease-out 2800ms forwards; }
        .plans-anim-label { opacity: 0; animation: plansFadeIn 400ms ease-out 3200ms forwards; }

        @media (prefers-reduced-motion: reduce) {
          .plans-anim-doc, .plans-anim-line, .plans-anim-sign-base,
          .plans-anim-badge, .plans-anim-label, .plans-anim-glow {
            opacity: 1;
            transform: none;
            animation: none;
          }
          .plans-anim-sign, .plans-anim-check { stroke-dashoffset: 0; animation: none; }
        }
      `}</style>

      <svg
        viewBox="0 0 320 240"
        className="h-full w-full"
        role="img"
        aria-label="Дигитално създаване и подписване на договор"
      >
        <defs>
          <linearGradient id="plansDocFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="hsl(220 35% 16%)" />
            <stop offset="100%" stopColor="hsl(220 40% 12%)" />
          </linearGradient>
          <radialGradient id="plansBadgeGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="hsl(43 75% 60% / 0.55)" />
            <stop offset="100%" stopColor="hsl(43 75% 60% / 0)" />
          </radialGradient>
        </defs>

        {/* Document */}
        <g className="plans-anim-doc">
          {/* Page */}
          <rect
            x="86" y="36" width="148" height="172" rx="6"
            fill="url(#plansDocFill)"
            stroke="hsl(43 55% 54% / 0.35)"
            strokeWidth="1"
          />
          {/* Folded corner */}
          <path d="M214 36 L234 36 L234 56 Z" fill="hsl(43 55% 54% / 0.18)" stroke="hsl(43 55% 54% / 0.35)" strokeWidth="1" />

          {/* Title bar */}
          <rect x="100" y="52" width="60" height="6" rx="2" fill="hsl(43 55% 54% / 0.7)" />
          <rect x="100" y="64" width="34" height="3" rx="1.5" fill="hsl(43 25% 60% / 0.35)" />

          {/* Animated body lines */}
          <g fill="hsl(43 20% 75% / 0.45)">
            <rect className="plans-anim-line plans-anim-line-1" x="100" y="86"  width="116" height="3.5" rx="1.5" />
            <rect className="plans-anim-line plans-anim-line-2" x="100" y="98"  width="100" height="3.5" rx="1.5" />
            <rect className="plans-anim-line plans-anim-line-3" x="100" y="110" width="118" height="3.5" rx="1.5" />
            <rect className="plans-anim-line plans-anim-line-4" x="100" y="122" width="72"  height="3.5" rx="1.5" />
          </g>

          {/* Signature block */}
          <g className="plans-anim-sign-base">
            <rect x="100" y="156" width="120" height="34" rx="3" fill="hsl(220 50% 9% / 0.6)" stroke="hsl(43 55% 54% / 0.25)" strokeWidth="0.8" strokeDasharray="3 3" />
            <text x="106" y="200" fontSize="6" fill="hsl(43 25% 70% / 0.55)" fontFamily="ui-sans-serif, system-ui">Подпис</text>
          </g>
          <path
            className="plans-anim-sign"
            d="M108 180 C 118 162, 128 196, 140 174 S 162 168, 174 182 S 198 170, 212 176"
            fill="none"
            stroke="hsl(43 65% 60%)"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </g>

        {/* Success glow */}
        <circle className="plans-anim-glow" cx="234" cy="42" r="42" fill="url(#plansBadgeGlow)" />

        {/* Success badge */}
        <g className="plans-anim-badge">
          <circle cx="234" cy="42" r="18" fill="hsl(43 55% 54%)" />
          <circle cx="234" cy="42" r="18" fill="none" stroke="hsl(43 75% 70%)" strokeWidth="1.2" />
          <path
            className="plans-anim-check"
            d="M225 43 L232 50 L244 36"
            fill="none"
            stroke="hsl(220 50% 9%)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>

        {/* Final label */}
        <g className="plans-anim-label">
          <rect x="106" y="216" width="108" height="16" rx="8" fill="hsl(43 55% 54% / 0.12)" stroke="hsl(43 55% 54% / 0.4)" strokeWidth="0.8" />
          <text
            x="160" y="227"
            textAnchor="middle"
            fontSize="8"
            letterSpacing="1.4"
            fill="hsl(43 65% 70%)"
            fontFamily="ui-sans-serif, system-ui"
            fontWeight="600"
          >
            ДОГОВОРЪТ Е ПОДПИСАН
          </text>
        </g>
      </svg>
    </div>
  );
}
