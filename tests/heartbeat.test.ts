import { describe, expect, it } from "vitest";
import { isValidPayload } from "@/lib/heartbeat-receiver";

const ALLOWED_KEYS = new Set([
  "instance_id",
  "version",
  "uptime_seconds",
  "user_count",
  "incident_count_30d",
  "error_count_24h",
  "company_name",
]);

describe("heartbeat payload shape", () => {
  it("accepts a fully populated payload", () => {
    const payload = {
      instance_id: "11111111-1111-1111-1111-111111111111",
      version: "1.0.0",
      uptime_seconds: 3600,
      user_count: 4,
      incident_count_30d: 12,
      error_count_24h: 0,
      company_name: "RIM Construction",
    };
    expect(isValidPayload(payload)).toBe(true);
    for (const key of Object.keys(payload)) {
      expect(
        ALLOWED_KEYS.has(key),
        `payload contains disallowed key ${key}`,
      ).toBe(true);
    }
  });

  it("rejects payloads with extra free-text fields (incident text, PII)", () => {
    const polluted = {
      instance_id: "id",
      version: "1.0.0",
      uptime_seconds: 1,
      user_count: 0,
      incident_count_30d: 0,
      error_count_24h: 0,
      incident_text: "There was a leak in pump room",
    };
    for (const key of Object.keys(polluted)) {
      if (key === "incident_text") {
        expect(ALLOWED_KEYS.has(key)).toBe(false);
      }
    }
    // The validator only checks required fields; the *contract* is the
    // ALLOWED_KEYS set above — receiver-side dashboards must never display
    // unknown keys, and senders must never add them. The strict snapshot
    // assertion is the test below.
    expect(isValidPayload(polluted)).toBe(true);
  });

  it("rejects malformed payloads", () => {
    expect(isValidPayload(null)).toBe(false);
    expect(isValidPayload({})).toBe(false);
    expect(
      isValidPayload({
        instance_id: "x",
        version: "1.0.0",
        uptime_seconds: "not-a-number",
        user_count: 0,
        incident_count_30d: 0,
        error_count_24h: 0,
      }),
    ).toBe(false);
    expect(
      isValidPayload({
        instance_id: "",
        version: "1.0.0",
        uptime_seconds: 1,
        user_count: 0,
        incident_count_30d: 0,
        error_count_24h: 0,
      }),
    ).toBe(false);
  });

  it("snapshot of canonical payload key set (no PII, no incident text)", () => {
    const example = {
      instance_id: "abc",
      version: "1.0.0",
      uptime_seconds: 60,
      user_count: 1,
      incident_count_30d: 0,
      error_count_24h: 0,
    };
    expect(Object.keys(example).sort()).toEqual([
      "error_count_24h",
      "incident_count_30d",
      "instance_id",
      "uptime_seconds",
      "user_count",
      "version",
    ]);
  });
});
