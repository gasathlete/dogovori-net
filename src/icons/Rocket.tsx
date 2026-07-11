import { createIcon } from "./createIcon";

export const Rocket = createIcon(
  "rocket",
  <>
    <path d="M13 3c4 0 8 4 8 8l-4 2-6 6-2-2 6-6 2-4Z" />
    <path d="M13 3c-4 0-8 4-8 8l2 4 6-6-2-2Z" />
    <circle cx="14" cy="10" r="1.5" />
    <path d="M7 17c-1.5 1.5-1.5 4-1.5 4s2.5 0 4-1.5" />
  </>,
);
export default Rocket;
