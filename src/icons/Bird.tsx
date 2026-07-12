import { createIcon } from "./createIcon";

/**
 * Dogovori Bird — a simple, friendly owl (бухалче).
 * Clean silhouette: rounded body + head in one shape, two dot eyes,
 * a small triangle beak. Reads instantly at 16–24px.
 */
export const Bird = createIcon(
  "bird",
  <>
    {/* Body + head silhouette */}
    <path d="M4.5 12a7.5 7.5 0 0 1 15 0v4a5.5 5.5 0 0 1-11 0Z" />
    {/* Ear tufts */}
    <path d="M6.5 6 5 3.5" />
    <path d="M17.5 6 19 3.5" />
    {/* Eye rings */}
    <circle cx="9.5" cy="11" r="1.6" />
    <circle cx="14.5" cy="11" r="1.6" />
    {/* Pupils */}
    <circle cx="9.5" cy="11" r=".5" fill="currentColor" />
    <circle cx="14.5" cy="11" r=".5" fill="currentColor" />
    {/* Beak */}
    <path d="M11.2 13.5h1.6L12 15Z" />
    {/* Feet */}
    <path d="M10 21v-1.2" />
    <path d="M14 21v-1.2" />
  </>,
);
export default Bird;
