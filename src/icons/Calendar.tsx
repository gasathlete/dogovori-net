import { createIcon } from "./createIcon";
/** Dogovori Calendar — soft rounded top, matched to CalendarDays. */
export const Calendar = createIcon(
  "calendar",
  <>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
    <path d="M3.5 9.5h17" />
    <path d="M8 3.5v3.5" />
    <path d="M16 3.5v3.5" />
  </>
);
export default Calendar;
