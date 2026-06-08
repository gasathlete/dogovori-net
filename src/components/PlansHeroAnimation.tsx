/**
 * One-shot ~4s animation for the dark hero area of /plans.
 * Sequence: blank page rises → body lines write themselves → signature is drawn
 * → a 3D fountain pen sweeps along the base of the document leaving a glowing
 * gold underline → success ✓ + label. All keyframes use `forwards` and run
 * exactly once, so the final composed state stays on screen.
 */
export function PlansHeroAnimation() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none mx-auto block w-full max-w-sm"
      style={{ aspectRatio: "360 / 228" }}
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
        @keyframes plansGlow { to { opacity: 1; } }
        @keyframes plansFadeIn { to { opacity: 1; } }

        @keyframes plansPenMove {
          0%   { opacity: 0; transform: translate(0px, -6px) rotate(-22deg); }
          10%  { opacity: 1; transform: translate(0px, 0px) rotate(-22deg); }
          100% { opacity: 1; transform: translate(180px, 0px) rotate(-22deg); }
        }
        @keyframes plansUnderlineDraw {
          0%   { stroke-dashoffset: 200; filter: drop-shadow(0 0 0 hsl(43 75% 60% / 0)); }
          100% { stroke-dashoffset: 0;   filter: drop-shadow(0 0 6px hsl(43 75% 60% / 0.65)); }
        }

        .plans-anim-doc      { opacity: 0; animation: plansDocRise 600ms cubic-bezier(.2,.8,.2,1) 100ms forwards; transform-origin: 50% 60%; }
        .plans-anim-line     { opacity: 0; animation: plansFadeIn 200ms linear forwards, plansLineDraw 420ms cubic-bezier(.2,.8,.2,1) forwards; transform-origin: left center; }
        .plans-anim-line-1   { animation-delay: 700ms, 700ms; }
        .plans-anim-line-2   { animation-delay: 900ms, 900ms; }
        .plans-anim-line-3   { animation-delay: 1100ms, 1100ms; }
        .plans-anim-line-4   { animation-delay: 1300ms, 1300ms; }

        .plans-anim-sign-base { opacity: 0; animation: plansFadeIn 240ms linear 1600ms forwards; }
        .plans-anim-sign {
          stroke-dasharray: 220;
          stroke-dashoffset: 220;
          animation: plansStrokeDraw 900ms cubic-bezier(.55,.1,.2,1) 1700ms forwards;
        }

        /* 3D pen + gold underline */
        .plans-anim-pen {
          opacity: 0;
          transform-box: fill-box;
          transform-origin: 8px 56px; /* near nib */
          animation: plansPenMove 1400ms cubic-bezier(.45,.05,.25,1) 2700ms forwards;
        }
        .plans-anim-underline {
          stroke-dasharray: 200;
          stroke-dashoffset: 200;
          animation: plansUnderlineDraw 1400ms cubic-bezier(.45,.05,.25,1) 2700ms forwards;
        }

        .plans-anim-badge {
          opacity: 0;
          transform-box: fill-box;
          transform-origin: center;
          animation: plansBadgePop 520ms cubic-bezier(.34,1.56,.64,1) 4150ms forwards;
        }
        .plans-anim-check {
          stroke-dasharray: 40;
          stroke-dashoffset: 40;
          animation: plansStrokeDraw 380ms cubic-bezier(.2,.8,.2,1) 4400ms forwards;
        }
        .plans-anim-glow  { opacity: 0; animation: plansGlow 600ms ease-out 4250ms forwards; }
        .plans-anim-label { opacity: 0; animation: plansFadeIn 400ms ease-out 4650ms forwards; }

        @media (prefers-reduced-motion: reduce) {
          .plans-anim-doc, .plans-anim-line, .plans-anim-sign-base,
          .plans-anim-badge, .plans-anim-label, .plans-anim-glow, .plans-anim-pen {
            opacity: 1; transform: none; animation: none;
          }
          .plans-anim-sign, .plans-anim-check, .plans-anim-underline {
            stroke-dashoffset: 0; animation: none;
          }
        }
      `}</style>

      <svg
        viewBox="0 32 360 228"
        className="h-[190px] w-full sm:h-[230px]"
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
          {/* Gold gradient for underline + pen barrel */}
          <linearGradient id="plansGold" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="hsl(43 55% 45%)" />
            <stop offset="50%" stopColor="hsl(43 85% 70%)" />
            <stop offset="100%" stopColor="hsl(43 55% 45%)" />
          </linearGradient>
          <linearGradient id="plansPenBarrel" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="hsl(220 18% 22%)" />
            <stop offset="45%" stopColor="hsl(220 14% 38%)" />
            <stop offset="55%" stopColor="hsl(220 14% 38%)" />
            <stop offset="100%" stopColor="hsl(220 22% 14%)" />
          </linearGradient>
          <linearGradient id="plansPenNib" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="hsl(43 85% 75%)" />
            <stop offset="100%" stopColor="hsl(43 55% 40%)" />
          </linearGradient>
        </defs>

        {/* Document */}
        <g className="plans-anim-doc">
          <rect x="106" y="36" width="148" height="172" rx="6"
            fill="url(#plansDocFill)"
            stroke="hsl(43 55% 54% / 0.35)"
            strokeWidth="1" />
          <path d="M234 36 L254 36 L254 56 Z" fill="hsl(43 55% 54% / 0.18)" stroke="hsl(43 55% 54% / 0.35)" strokeWidth="1" />

          <rect x="120" y="52" width="60" height="6" rx="2" fill="hsl(43 55% 54% / 0.7)" />
          <rect x="120" y="64" width="34" height="3" rx="1.5" fill="hsl(43 25% 60% / 0.35)" />

          <g fill="hsl(43 20% 75% / 0.45)">
            <rect className="plans-anim-line plans-anim-line-1" x="120" y="86"  width="116" height="3.5" rx="1.5" />
            <rect className="plans-anim-line plans-anim-line-2" x="120" y="98"  width="100" height="3.5" rx="1.5" />
            <rect className="plans-anim-line plans-anim-line-3" x="120" y="110" width="118" height="3.5" rx="1.5" />
            <rect className="plans-anim-line plans-anim-line-4" x="120" y="122" width="72"  height="3.5" rx="1.5" />
          </g>

          {/* Signature block */}
          <g className="plans-anim-sign-base">
            <rect x="120" y="156" width="120" height="34" rx="3" fill="hsl(220 50% 9% / 0.6)" stroke="hsl(43 55% 54% / 0.25)" strokeWidth="0.8" strokeDasharray="3 3" />
            <text x="126" y="200" fontSize="6" fill="hsl(43 25% 70% / 0.55)" fontFamily="ui-sans-serif, system-ui">Подпис</text>
          </g>
          <path className="plans-anim-sign"
            d="M128 180 C 138 162, 148 196, 160 174 S 182 168, 194 182 S 218 170, 232 176"
            fill="none"
            stroke="hsl(43 65% 60%)"
            strokeWidth="1.8"
            strokeLinecap="round" />
        </g>

        {/* Gold underline traced by the pen */}
        <line
          className="plans-anim-underline"
          x1="110" y1="218" x2="250" y2="218"
          stroke="url(#plansGold)"
          strokeWidth="2.2"
          strokeLinecap="round"
        />

        {/* 3D fountain pen (starts at x=110, anim translates +180px) */}
        <g className="plans-anim-pen" transform="translate(102,170)">
          {/* shadow */}
          <ellipse cx="18" cy="60" rx="22" ry="3" fill="hsl(220 50% 5% / 0.5)" />
          {/* barrel */}
          <rect x="-2" y="14" width="46" height="10" rx="3" fill="url(#plansPenBarrel)" stroke="hsl(220 14% 50% / 0.5)" strokeWidth="0.5" />
          {/* grip ring */}
          <rect x="-4" y="13.5" width="6" height="11" rx="1.5" fill="url(#plansGold)" />
          {/* cap */}
          <rect x="40" y="13" width="14" height="12" rx="2.5" fill="hsl(220 18% 18%)" stroke="hsl(220 14% 50% / 0.5)" strokeWidth="0.5" />
          <circle cx="52" cy="19" r="1.4" fill="url(#plansGold)" />
          {/* gold band */}
          <rect x="-4" y="17" width="48" height="1.4" fill="hsl(43 85% 70%)" opacity="0.6" />
          {/* nib + tip pointing down-left at (8, 56) */}
          <polygon points="-2,24 -10,42 6,40" fill="url(#plansPenNib)" />
          <line x1="-6" y1="32" x2="2" y2="38" stroke="hsl(220 50% 9%)" strokeWidth="0.6" opacity="0.5" />
          {/* nib tip dot */}
          <circle cx="-9" cy="42" r="1.2" fill="hsl(43 85% 80%)" />
        </g>

        {/* Success glow */}
        <circle className="plans-anim-glow" cx="254" cy="42" r="42" fill="url(#plansBadgeGlow)" />

        {/* Success badge */}
        <g className="plans-anim-badge">
          <circle cx="254" cy="42" r="18" fill="hsl(43 55% 54%)" />
          <circle cx="254" cy="42" r="18" fill="none" stroke="hsl(43 75% 70%)" strokeWidth="1.2" />
          <path className="plans-anim-check"
            d="M245 43 L252 50 L264 36"
            fill="none"
            stroke="hsl(220 50% 9%)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round" />
        </g>

        {/* Final label */}
        <g className="plans-anim-label">
          <rect x="126" y="232" width="108" height="16" rx="8" fill="hsl(43 55% 54% / 0.12)" stroke="hsl(43 55% 54% / 0.4)" strokeWidth="0.8" />
          <text x="180" y="243" textAnchor="middle"
            fontSize="8" letterSpacing="1.4"
            fill="hsl(43 65% 70%)"
            fontFamily="ui-sans-serif, system-ui"
            fontWeight="600">
            ДОГОВОРЪТ Е ПОДПИСАН
          </text>
        </g>
      </svg>
    </div>
  );
}
