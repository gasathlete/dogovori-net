import { createIcon } from "./createIcon";
/** Dogovori Globe — meridians balanced for small sizes. */
export const Globe = createIcon(
  "globe",
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18" />
    <path d="M12 3c2.6 3 4 6 4 9s-1.4 6-4 9c-2.6-3-4-6-4-9s1.4-6 4-9Z" />
  </>
);
export default Globe;
