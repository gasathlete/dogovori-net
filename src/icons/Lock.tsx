import { createIcon } from "./createIcon";

export const Lock = createIcon(
  "lock",
  <>
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    <circle cx="12" cy="16" r="1" />
  </>,
);
export default Lock;
