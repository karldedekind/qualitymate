import { describe, expect, it } from "vitest";
import { buildIcs, escapeText, foldLine, formatUtc } from "@/lib/ics";

describe("ics — RFC 5545 minimal compliance", () => {
  const baseEvent = {
    uid: "test-1@qualitymate",
    start: new Date("2026-06-01T10:00:00Z"),
    end: new Date("2026-06-01T11:00:00Z"),
    summary: "Quarterly review",
    dtstamp: new Date("2026-05-06T00:00:00Z"),
  };

  it("emits required calendar/event envelope", () => {
    const ics = buildIcs(baseEvent);
    expect(ics).toContain("BEGIN:VCALENDAR\r\n");
    expect(ics).toContain("VERSION:2.0\r\n");
    expect(ics).toMatch(/PRODID:.+\r\n/);
    expect(ics).toContain("BEGIN:VEVENT\r\n");
    expect(ics).toContain("END:VEVENT\r\n");
    expect(ics).toContain("END:VCALENDAR\r\n");
  });

  it("uses CRLF line endings", () => {
    const ics = buildIcs(baseEvent);
    // Every line break is CRLF; no bare LF.
    const bareLf = ics.match(/(?<!\r)\n/g);
    expect(bareLf).toBeNull();
  });

  it("formats DTSTART/DTEND/DTSTAMP as YYYYMMDDTHHMMSSZ in UTC", () => {
    const ics = buildIcs(baseEvent);
    expect(ics).toContain("DTSTART:20260601T100000Z");
    expect(ics).toContain("DTEND:20260601T110000Z");
    expect(ics).toContain("DTSTAMP:20260506T000000Z");
  });

  it("includes UID and SUMMARY", () => {
    const ics = buildIcs(baseEvent);
    expect(ics).toContain(`UID:${baseEvent.uid}`);
    expect(ics).toContain(`SUMMARY:${baseEvent.summary}`);
  });

  it("escapes commas, semicolons, backslashes, newlines in text", () => {
    expect(escapeText("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
    const ics = buildIcs({
      ...baseEvent,
      summary: "A, B; C\\D",
      description: "line1\nline2",
    });
    expect(ics).toContain("SUMMARY:A\\, B\\; C\\\\D");
    expect(ics).toContain("DESCRIPTION:line1\\nline2");
  });

  it("emits ORGANIZER/ATTENDEE with mailto and CN", () => {
    const ics = buildIcs({
      ...baseEvent,
      organizer: { name: "Alice", email: "alice@example.com" },
      attendees: [
        { name: "Bob", email: "bob@example.com" },
        { email: "carol@example.com" },
      ],
    });
    expect(ics).toContain("ORGANIZER;CN=Alice:mailto:alice@example.com");
    expect(ics).toContain("ATTENDEE;CN=Bob:mailto:bob@example.com");
    expect(ics).toContain("ATTENDEE:mailto:carol@example.com");
  });

  it("folds long content lines to <=75 octets with leading space continuation", () => {
    const longSummary = "A".repeat(200);
    const ics = buildIcs({ ...baseEvent, summary: longSummary });
    const lines = ics.split("\r\n");
    // Every emitted physical line must be <= 75 octets (bytes).
    for (const line of lines) {
      expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
    }
    // Continuation lines must start with a single SPACE.
    const summaryLineIdx = lines.findIndex((l) => l.startsWith("SUMMARY:"));
    expect(summaryLineIdx).toBeGreaterThan(-1);
    expect(lines[summaryLineIdx + 1]?.startsWith(" ")).toBe(true);
  });

  it("formatUtc and foldLine helpers behave", () => {
    expect(formatUtc(new Date("2026-01-02T03:04:05Z"))).toBe("20260102T030405Z");
    expect(foldLine("short")).toBe("short");
    const long = "X".repeat(80);
    const folded = foldLine(long);
    expect(folded.includes("\r\n ")).toBe(true);
  });
});
