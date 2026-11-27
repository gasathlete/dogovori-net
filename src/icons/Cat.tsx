import { createIcon } from "./createIcon";
export const Cat = createIcon(
  "cat",
  <>
    <path d="M4 4v6a7 7 0 0 0 14 0V4l-3 3h-8Z" />
    <circle cx="9" cy="10" r=".8" fill="currentColor" />
    <circle cx="15" cy="10" r=".8" fill="currentColor" />
    <path d="M12 12v1M10.5 14h3" />
    <path d="M4 20h16" />
  </>
);
export default Cat;
