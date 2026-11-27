import { createIcon } from "./createIcon";
export const Banknote = createIcon(
  "banknote",
  <>
    <rect x="2.5" y="6" width="19" height="12" rx="2" />
    <circle cx="12" cy="12" r="2.5" />
    <path d="M6 10v.01M18 14v.01" />
  </>
);
export default Banknote;
