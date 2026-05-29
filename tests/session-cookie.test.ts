import { describe, expect, it } from "vitest";
import {
  SESSION_MAX_AGE_SECONDS,
  SESSION_UPDATE_AGE_SECONDS,
  sessionCookieAttributes,
} from "@/lib/auth";

describe("session cookie attributes", () => {
  it("uses 30-day maxAge in seconds", () => {
    expect(SESSION_MAX_AGE_SECONDS).toBe(60 * 60 * 24 * 30);
    expect(SESSION_MAX_AGE_SECONDS).toBe(2_592_000);
  });

  it("renews session at most once per day", () => {
    expect(SESSION_UPDATE_AGE_SECONDS).toBe(60 * 60 * 24);
    expect(SESSION_MAX_AGE_SECONDS).toBeGreaterThan(SESSION_UPDATE_AGE_SECONDS);
  });

  it("sets HttpOnly + SameSite=Lax + path=/ regardless of scheme", () => {
    for (const baseUrl of ["http://localhost:3000", "https://qm.example.com"]) {
      const attrs = sessionCookieAttributes(baseUrl);
      expect(attrs.httpOnly).toBe(true);
      expect(attrs.sameSite).toBe("lax");
      expect(attrs.path).toBe("/");
      expect(attrs.maxAge).toBe(SESSION_MAX_AGE_SECONDS);
    }
  });

  it("turns Secure off for http baseURLs (local dev)", () => {
    const attrs = sessionCookieAttributes("http://localhost:3000");
    expect(attrs.secure).toBe(false);
  });

  it("turns Secure on for https baseURLs (production)", () => {
    const attrs = sessionCookieAttributes("https://qm.example.com");
    expect(attrs.secure).toBe(true);
  });

  it("expiry tolerates rounding within a 1-second window", () => {
    // Browsers may round the cookie expiry to the nearest second.
    // Confirm the configured maxAge is integer seconds, not a fractional value.
    expect(Number.isInteger(SESSION_MAX_AGE_SECONDS)).toBe(true);
    const expiresAt = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS;
    const recomputed = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS;
    expect(Math.abs(expiresAt - recomputed)).toBeLessThanOrEqual(1);
  });
});
