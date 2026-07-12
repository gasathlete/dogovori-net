import { createIcon } from "./createIcon";

/**
 * Dogovori Bird — reimagined as a friendly little owl (бухалче).
 * Round head, tufted ears, two big eyes, small beak, plump body,
 * feet perched on a branch. Keeps the "bird" name for drop-in compatibility.
 */
export const Bird = createIcon(
  "bird",
  <>
    {/* Ear tufts */}
    <path d="M7.5 5 6 2.5" />
    <path d="M16.5 5 18 2.5" />
    {/* Head + body silhouette (single continuous shape) */}
    <path d="M5 8.5a7 7 0 0 1 14 0v2.2a6 6 0 0 1-1 3.3l.6 3a1 1 0 0 1-1 1.2h-1.4l-1-1.6a6 6 0 0 1-6.4 0L7.8 18H6.4a1 1 0 0 1-1-1.2l.6-3A6 6 0 0 1 5 10.7Z" />
    {/* Eyes — big owl eyes */}
    <circle cx="9" cy="10" r="1.8" />
    <circle cx="15" cy="10" r="1.8" />
    <circle cx="9" cy="10" r=".5" fill="currentColor" />
    <circle cx="15" cy="10" r=".5" fill="currentColor" />
    {/* Beak */}
    <path d="M11 12.5h2l-1 1.5Z" />
    {/* Feet on branch */}
    <path d="M4 21h16" />
    <path d="M10 18.5v2M14 18.5v2" />
  </>,
);
export default Bird;
