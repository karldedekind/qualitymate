import { describe, expect, it } from "vitest";
import { addWorkingDays, isWorkingDay, workingDaysBetween } from "@/lib/working-days";

describe("isWorkingDay", () => {
  it("weekdays are working days", () => {
    expect(isWorkingDay("2026-07-16")).toBe(true); // Thursday
    expect(isWorkingDay("2026-07-13")).toBe(true); // Monday
  });

  it("weekends are not", () => {
    expect(isWorkingDay("2026-07-18")).toBe(false); // Saturday
    expect(isWorkingDay("2026-07-19")).toBe(false); // Sunday
  });

  it("QLD public holidays are not", () => {
    expect(isWorkingDay("2026-01-01")).toBe(false); // New Year's Day
    expect(isWorkingDay("2026-01-26")).toBe(false); // Australia Day
    expect(isWorkingDay("2026-04-03")).toBe(false); // Good Friday
    expect(isWorkingDay("2026-04-06")).toBe(false); // Easter Monday
    expect(isWorkingDay("2026-05-04")).toBe(false); // Labour Day (QLD)
    expect(isWorkingDay("2026-10-05")).toBe(false); // King's Birthday (QLD)
    expect(isWorkingDay("2026-12-25")).toBe(false); // Christmas Day
    expect(isWorkingDay("2026-12-28")).toBe(false); // Boxing Day substitute (26th is a Saturday)
  });
});

describe("addWorkingDays", () => {
  it("skips weekends", () => {
    // Thursday + 2 working days = Monday
    expect(addWorkingDays("2026-07-16", 2)).toBe("2026-07-20");
  });

  it("skips public holidays", () => {
    // Thursday 2026-04-02 + 1 working day skips Good Friday + Easter Monday block
    expect(addWorkingDays("2026-04-02", 1)).toBe("2026-04-07");
  });

  it("zero days returns the start date", () => {
    expect(addWorkingDays("2026-07-16", 0)).toBe("2026-07-16");
  });

  it("matches the real EOT 01 example: 23 Jul 2026 + 48 wd = 29 Sep 2026", () => {
    expect(addWorkingDays("2026-07-23", 48)).toBe("2026-09-29");
  });

  it("handles year boundaries with Christmas/New Year holidays", () => {
    // Wed 2026-12-23 + 3 working days: skips 25th (Fri), 28th (sub), weekend,
    // lands 24th (1), 29th (2), 30th (3).
    expect(addWorkingDays("2026-12-23", 3)).toBe("2026-12-30");
  });

  it("rejects negative day counts", () => {
    expect(() => addWorkingDays("2026-07-16", -1)).toThrow();
  });
});

describe("workingDaysBetween", () => {
  it("counts working days after start up to and including end", () => {
    expect(workingDaysBetween("2026-07-23", "2026-09-29")).toBe(48);
    expect(workingDaysBetween("2026-07-16", "2026-07-20")).toBe(2);
    expect(workingDaysBetween("2026-07-16", "2026-07-16")).toBe(0);
  });
});
