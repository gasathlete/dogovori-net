import { createIcon } from "./createIcon";
export const Dog = createIcon(
  "dog",
  <>
    <path d="M5 6c0-1.5 1-3 2.5-3S10 4.5 10 6v2" />
    <path d="M19 6c0-1.5-1-3-2.5-3S14 4.5 14 6v2" />
    <path d="M5 10a7 7 0 0 1 14 0v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4Z" />
    <circle cx="9.5" cy="12" r=".8" fill="currentColor" />
    <circle cx="14.5" cy="12" r=".8" fill="currentColor" />
    <path d="M11 15.5h2" />
  </>
);
export default Dog;
