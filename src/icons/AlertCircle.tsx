import { createIcon } from "./createIcon";
/** Dogovori AlertCircle — hand-drawn to match brand stroke. */
export const AlertCircle = createIcon(
  "alert-circle",
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v4.5" />
    <path d="M12 16.2h.01" />
  </>
);
export default AlertCircle;
