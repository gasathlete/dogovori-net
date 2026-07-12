import { createIcon } from "./createIcon";
export const IdCard = createIcon(
  "id-card",
  <>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <circle cx="9" cy="12" r="2" />
    <path d="M6 16c.5-1.5 1.7-2.2 3-2.2s2.5.7 3 2.2" />
    <path d="M14 10h4M14 13h3" />
  </>
);
export default IdCard;
