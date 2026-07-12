import { createIcon } from "./createIcon";
export const LifeRing = createIcon(
  "life-ring",
  <>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="3.5" />
    <path d="m4.5 4.5 5 5M14.5 14.5l5 5M19.5 4.5l-5 5M9.5 14.5l-5 5" />
  </>
);
export default LifeRing;
