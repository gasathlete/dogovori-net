// Minimal RFC 5545 .ics generator for document reminders.
// Single-day, all-day VEVENTs in UTC date format.

export type IcsEvent = {
  uid: string;
  title: string;
  description?: string;
  url?: string;
  /** ISO timestamp (date will be used; treated as all-day) */
  dateISO: string;
};

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function toIcsDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}

function toIcsStamp(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(
    d.getUTCHours(),
  )}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function foldLine(line: string): string {
  // RFC 5545 line folding at 75 octets.
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  let i = 0;
  while (i < line.length) {
    chunks.push((i === 0 ? "" : " ") + line.slice(i, i + 73));
    i += 73;
  }
  return chunks.join("\r\n");
}

export function buildIcs(events: IcsEvent[], calName = "DogovaryAI"): string {
  const now = toIcsStamp(new Date());
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//DogovaryAI//Reminders//BG",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(calName)}`,
  ];
  for (const ev of events) {
    const start = toIcsDate(ev.dateISO);
    // All-day events: DTEND = next day
    const endDate = new Date(ev.dateISO);
    endDate.setUTCDate(endDate.getUTCDate() + 1);
    const end = `${endDate.getUTCFullYear()}${pad(endDate.getUTCMonth() + 1)}${pad(
      endDate.getUTCDate(),
    )}`;
    lines.push(
      "BEGIN:VEVENT",
      foldLine(`UID:${ev.uid}@dogovori.net`),
      `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${start}`,
      `DTEND;VALUE=DATE:${end}`,
      foldLine(`SUMMARY:${escapeText(ev.title)}`),
    );
    if (ev.description) lines.push(foldLine(`DESCRIPTION:${escapeText(ev.description)}`));
    if (ev.url) lines.push(foldLine(`URL:${ev.url}`));
    lines.push(
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      foldLine(`DESCRIPTION:${escapeText(ev.title)}`),
      "TRIGGER:-P1D",
      "END:VALARM",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

export function downloadIcs(filename: string, events: IcsEvent[]): void {
  const ics = buildIcs(events);
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".ics") ? filename : `${filename}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
