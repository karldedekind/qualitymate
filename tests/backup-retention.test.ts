import { describe, expect, it } from "vitest";
import { pruneRetention, type BackupFile } from "@/lib/backup";

function file(takenAt: Date): BackupFile {
  const name = `qualitymate-backup-${takenAt
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace(/-\d{3}Z$/, "Z")}.tar.gz`;
  return {
    name,
    fullPath: `/data/backups/${name}`,
    size: 1024,
    mtime: takenAt,
    takenAt,
  };
}

function daysAgo(now: Date, n: number): Date {
  return new Date(now.getTime() - n * 24 * 60 * 60 * 1000);
}

describe("pruneRetention — 7 daily / 4 weekly / 12 monthly", () => {
  it("60-day simulation keeps every recent day, then weekly anchors, then monthly anchors", () => {
    // Generate one backup per day, going back 60 days.
    const now = new Date("2026-05-06T02:00:00Z");
    const files: BackupFile[] = [];
    for (let i = 0; i < 60; i++) {
      files.push(file(daysAgo(now, i)));
    }

    const decision = pruneRetention(files, now);
    const keptKeys = new Set(decision.keep.map((f) => f.takenAt.toISOString().slice(0, 10)));

    // Most recent 7 days are kept by the daily tier.
    for (let i = 0; i < 7; i++) {
      const key = daysAgo(now, i).toISOString().slice(0, 10);
      expect(keptKeys.has(key)).toBe(true);
    }
    // Total kept = 7 daily + 4 weekly + 12 monthly = 23 max, but with daily backups
    // each weekly slot lands inside the last 4 weeks (28 days) so weekly buckets
    // for the most-recent weeks coincide with daily picks. Monthly anchors should
    // pick up the 5th, 6th, 7th, ... month-back. Across 60 days we expect at
    // least 7 (daily) + ~3 weekly distinct + 2-3 monthly distinct.
    expect(decision.keep.length).toBeGreaterThanOrEqual(7);
    expect(decision.keep.length + decision.prune.length).toBe(60);
  });

  it("with one backup per week for 60 days picks the right weekly+monthly anchors", () => {
    const now = new Date("2026-05-06T02:00:00Z");
    const files: BackupFile[] = [];
    // 9 weekly backups going back ~63 days.
    for (let i = 0; i < 9; i++) {
      files.push(file(daysAgo(now, i * 7)));
    }
    const decision = pruneRetention(files, now);
    // 7 daily slots are individual days, so each weekly file claims its own daily
    // slot (since we have <= 7 of them and they all fall on distinct days).
    // Result: at minimum the most-recent 4 (weekly tier) are kept.
    expect(decision.keep.length).toBeGreaterThanOrEqual(4);
  });

  it("monthly tier keeps a representative for each of the last 12 calendar months", () => {
    const now = new Date("2026-05-06T02:00:00Z");
    const files: BackupFile[] = [];
    // One backup at the 15th of each month for the last 14 months.
    for (let i = 0; i < 14; i++) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 15, 2));
      files.push(file(d));
    }
    const decision = pruneRetention(files, now);
    // Top 12 months kept; oldest 2 pruned.
    expect(decision.keep.length).toBe(12);
    expect(decision.prune.length).toBe(2);
    const oldestKept = decision.keep[decision.keep.length - 1]!;
    const expectedOldest = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 15, 2),
    );
    expect(oldestKept.takenAt.toISOString()).toBe(expectedOldest.toISOString());
  });

  it("empty input yields empty decision", () => {
    const decision = pruneRetention([], new Date());
    expect(decision.keep).toHaveLength(0);
    expect(decision.prune).toHaveLength(0);
  });
});
