import { createIcon } from "./createIcon";

export const Gift = createIcon(
  "gift",
  <>
    <rect x="3" y="8" width="18" height="4" rx="1" />
    <path d="M5 12v9h14v-9" />
    <path d="M12 8v13" />
    <path d="M12 8s-2-6-5-6a2.5 2.5 0 0 0 0 5c3 0 5 1 5 1Z" />
    <path d="M12 8s2-6 5-6a2.5 2.5 0 0 1 0 5c-3 0-5 1-5 1Z" />
  </>,
);
export default Gift;
