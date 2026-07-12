import { createIcon } from "./createIcon";
export const CalendarDays = createIcon(
  "calendar-days",
  <>
    <rect x="3" y="5" width="18" height="16" rx="2.5" />
    <path d="M3 10h18" />
    <path d="M8 3v4M16 3v4" />
    <circle cx="8" cy="14.5" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="12" cy="14.5" r="0.9" fill="currentColor" stroke="none" />
    <circle cx="16" cy="14.5" r="0.9" fill="currentColor" stroke="none" />
  </>,
);
export default CalendarDays;
