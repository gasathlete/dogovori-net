import { createIcon } from "./createIcon";
/** Dogovori Image — frame with sun and hill. */
export const Image = createIcon(
  "image",
  <>
    <rect x="3.5" y="3.5" width="17" height="17" rx="2.5" />
    <circle cx="9" cy="9.5" r="1.6" />
    <path d="m20.5 16-5-5-8 9.5" />
  </>
);
export default Image;
