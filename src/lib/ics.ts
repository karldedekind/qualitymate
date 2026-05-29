// Minimal RFC 5545 VCALENDAR/VEVENT generator. Single event, no recurrence.

export type IcsAttendee = {
  name?: string | null;
  email: string;
};

export type IcsEvent = {
  uid: string;
  start: Date;
  end: Date;
  summary: string;
  description?: string | null;
  location?: string | null;
  organizer?: IcsAttendee | null;
  attendees?: IcsAttendee[];
  /** Defaults to `now`. Pass a fixed value for deterministic tests. */
  dtstamp?: Date;
};

/** Escape per RFC 5545 §3.3.11: backslash, semicolon, comma, newline. */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

/** Format Date as UTC `YYYYMMDDTHHMMSSZ`. */
export function formatUtc(d: Date): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

/**
 * Fold a content line to 75 octets per RFC 5545 §3.1.
 * Continuation lines start with a single SPACE.
 */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  const bytes = enc.encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let i = 0;
  // First chunk: up to 75 octets. Subsequent chunks: up to 74 (1 octet for leading space).
  let limit = 75;
  while (i < bytes.length) {
    let end = Math.min(i + limit, bytes.length);
    // Don't split inside a multi-byte UTF-8 sequence — back off until we land on a byte
    // that is not a continuation byte (0x80–0xBF).
    while (end < bytes.length && (bytes[end]! & 0xc0) === 0x80) end--;
    const chunk = new TextDecoder().decode(bytes.slice(i, end));
    out.push(out.length === 0 ? chunk : ` ${chunk}`);
    i = end;
    limit = 74;
  }
  return out.join("\r\n");
}

function attendeeLine(prop: "ORGANIZER" | "ATTENDEE", a: IcsAttendee): string {
  const params = a.name ? `;CN=${escapeText(a.name)}` : "";
  return `${prop}${params}:mailto:${a.email}`;
}

/** Render a single VEVENT calendar. Output uses CRLF line endings per RFC 5545. */
export function buildIcs(event: IcsEvent, prodId = "-//QualityMate//EN"): string {
  const stamp = event.dtstamp ?? new Date();
  const lines: string[] = [];
  lines.push("BEGIN:VCALENDAR");
  lines.push("VERSION:2.0");
  lines.push(`PRODID:${prodId}`);
  lines.push("CALSCALE:GREGORIAN");
  lines.push("METHOD:PUBLISH");
  lines.push("BEGIN:VEVENT");
  lines.push(`UID:${event.uid}`);
  lines.push(`DTSTAMP:${formatUtc(stamp)}`);
  lines.push(`DTSTART:${formatUtc(event.start)}`);
  lines.push(`DTEND:${formatUtc(event.end)}`);
  lines.push(`SUMMARY:${escapeText(event.summary)}`);
  if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
  if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
  if (event.organizer) lines.push(attendeeLine("ORGANIZER", event.organizer));
  for (const a of event.attendees ?? []) lines.push(attendeeLine("ATTENDEE", a));
  lines.push("END:VEVENT");
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
