import { createIcon } from "./createIcon";

/**
 * Dogovori Bird — a cute, friendly little owl (бухалче).
 * Soft round body, gentle sleepy eyes (arcs, not staring circles),
 * a tiny curved beak. No sharp features, reads as friendly at any size.
 */
export const Bird = createIcon(
  "bird",
  <>
    {/* Rounded body */}
    <path d="M5 11a7 7 0 0 1 14 0v5a5 5 0 0 1-10 0v-1" />
    <path d="M5 11v4a4 4 0 0 0 4 4" />
    {/* Small ear tufts — soft, not spikes */}
    <path d="M7.5 5.5c.3-.8.9-1.3 1.6-1.4" />
    <path d="M16.5 5.5c-.3-.8-.9-1.3-1.6-1.4" />
    {/* Sleepy happy eyes (arcs, closed-ish) */}
    <path d="M8.5 11.5c.4-.6 1-1 1.7-1s1.3.4 1.7 1" />
    <path d="M12.1 11.5c.4-.6 1-1 1.7-1s1.3.4 1.7 1" />
    {/* Tiny beak */}
    <path d="M11.6 13.5c.2.3.6.3.8 0" />
    {/* Little wing hint */}
    <path d="M8.5 15c1 .6 2 .8 3 .8" />
  </>,
);
export default Bird;
