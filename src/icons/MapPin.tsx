import { createIcon } from "./createIcon";
/** Dogovori MapPin — teardrop with centered dot. */
export const MapPin = createIcon(
  "map-pin",
  <>
    <path d="M20 10.5c0 6-8 11.5-8 11.5S4 16.5 4 10.5a8 8 0 0 1 16 0Z" />
    <circle cx="12" cy="10.5" r="2.6" />
  </>
);
export default MapPin;
