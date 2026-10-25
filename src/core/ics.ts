import type { ExitPlan } from "./exitPlan";

function icsDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

function escape(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");
}

/** RFC 5545 lines are limited to 75 octets; continuation lines start with a space. */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let size = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (size + n > (parts.length === 0 ? 75 : 74)) {
      parts.push(current);
      current = "";
      size = 0;
    }
    current += ch;
    size += n;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

interface CalendarEvent {
  date: Date;
  title: string;
  body: string;
}

export function planEvents(plan: ExitPlan, service: string, url: string): CalendarEvent[] {
  const sources = plan.quotes.map((q) => `"${q}"`).join("\n\n");
  const body = `${plan.steps.join("\n")}\n\nWhere this comes from:\n${sources}\n\n${url}`;
  const events: CalendarEvent[] = [];
  if (plan.freeCancelBy) events.push({ date: plan.freeCancelBy, title: `Cancel ${service} to pay nothing`, body });
  if (plan.noticeBy) events.push({ date: plan.noticeBy, title: `Send ${service} cancellation notice`, body });
  else if (plan.penaltyFreeFrom) events.push({ date: plan.penaltyFreeFrom, title: `${service}: you can now leave for free`, body });
  return events;
}

export function toICS(plan: ExitPlan, service: string, url: string, now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Catch//Exit plan//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  planEvents(plan, service, url).forEach((e, i) => {
    const next = new Date(e.date.getTime() + 24 * 60 * 60 * 1000);
    lines.push(
      "BEGIN:VEVENT",
      `UID:catch-${icsDate(e.date)}-${i}-${stamp}@catch.local`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${icsDate(e.date)}`,
      `DTEND;VALUE=DATE:${icsDate(next)}`,
      fold(`SUMMARY:${escape(e.title)}`),
      fold(`DESCRIPTION:${escape(e.body)}`),
      fold(`URL:${url}`),
      "BEGIN:VALARM",
      "TRIGGER:-P2D",
      "ACTION:DISPLAY",
      fold(`DESCRIPTION:${escape(e.title)}`),
      "END:VALARM",
      "END:VEVENT",
    );
  });
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

/** A Google Calendar link for the first event, for people who don't use .ics files. */
export function googleCalendarLink(plan: ExitPlan, service: string, url: string): string | undefined {
  const e = planEvents(plan, service, url)[0];
  if (!e) return undefined;
  const next = new Date(e.date.getTime() + 24 * 60 * 60 * 1000);
  const params = new URLSearchParams({ action: "TEMPLATE", text: e.title, dates: `${icsDate(e.date)}/${icsDate(next)}`, details: e.body });
  return `https://calendar.google.com/calendar/render?${params}`;
}
