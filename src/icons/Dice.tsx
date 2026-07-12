import { createIcon } from "./createIcon";
export const Dice = createIcon(
  "dice",
  <>
    <rect x="3.5" y="3.5" width="17" height="17" rx="2.5" />
    <circle cx="8" cy="8" r=".9" fill="currentColor" />
    <circle cx="16" cy="8" r=".9" fill="currentColor" />
    <circle cx="12" cy="12" r=".9" fill="currentColor" />
    <circle cx="8" cy="16" r=".9" fill="currentColor" />
    <circle cx="16" cy="16" r=".9" fill="currentColor" />
  </>
);
export default Dice;
