import { createIcon } from "./createIcon";
export const QrCode = createIcon(
  "qr-code",
  <>
    <rect x="3.5" y="3.5" width="7" height="7" rx="1" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="1" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1" />
    <path d="M13.5 13.5h3v3M20.5 13.5v3M13.5 20.5h3M20.5 20.5v-3" />
  </>
);
export default QrCode;
