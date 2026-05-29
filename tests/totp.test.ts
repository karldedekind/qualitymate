import { describe, expect, it } from "vitest";
import {
  base32Decode,
  base32Encode,
  buildOtpauthUri,
  generateSecret,
  hotp,
  totp,
  verifyTotp,
} from "@/lib/totp";

describe("base32 — round trip", () => {
  it("encode→decode preserves bytes", () => {
    const samples = [
      Buffer.from([]),
      Buffer.from([0x00]),
      Buffer.from([0xff]),
      Buffer.from([0x12, 0x34, 0x56, 0x78, 0x9a]),
      Buffer.from("hello world"),
    ];
    for (const s of samples) {
      expect(Buffer.compare(base32Decode(base32Encode(s)), s)).toBe(0);
    }
  });
});

describe("HOTP — RFC 4226 Appendix D test vectors", () => {
  // Secret = ASCII "12345678901234567890" (20 bytes)
  const secret = Buffer.from("12345678901234567890");
  const expected = [
    "755224",
    "287082",
    "359152",
    "969429",
    "338314",
    "254676",
    "287922",
    "162583",
    "399871",
    "520489",
  ];
  it("returns the canonical HOTP values for counters 0..9", () => {
    for (let c = 0; c < expected.length; c++) {
      expect(hotp(secret, c)).toBe(expected[c]);
    }
  });
});

describe("TOTP — RFC 6238 SHA1 test vector", () => {
  // Secret "12345678901234567890" base32-encoded
  const secret = base32Encode(Buffer.from("12345678901234567890"));
  it("matches the published TOTP value at T=59 (counter=1) → 287082", () => {
    expect(totp(secret, 59 * 1000)).toBe("287082");
  });
});

describe("verifyTotp — code window + format checks", () => {
  it("accepts the current step and ±1 step", () => {
    const secret = generateSecret(20);
    const t = 1_700_000_000_000;
    expect(verifyTotp(secret, totp(secret, t), { time: t })).toBe(true);
    expect(verifyTotp(secret, totp(secret, t - 30_000), { time: t })).toBe(true);
    expect(verifyTotp(secret, totp(secret, t + 30_000), { time: t })).toBe(true);
  });

  it("rejects codes 2 steps away with the default window", () => {
    const secret = generateSecret(20);
    const t = 1_700_000_000_000;
    expect(verifyTotp(secret, totp(secret, t - 60_000), { time: t })).toBe(false);
  });

  it("rejects non-6-digit input", () => {
    const secret = generateSecret(20);
    expect(verifyTotp(secret, "12345")).toBe(false);
    expect(verifyTotp(secret, "abcdef")).toBe(false);
    expect(verifyTotp(secret, "1234567")).toBe(false);
  });
});

describe("buildOtpauthUri", () => {
  it("encodes issuer + accountName and includes the secret + algorithm", () => {
    const uri = buildOtpauthUri({
      secretBase32: "JBSWY3DPEHPK3PXP",
      accountName: "alice@example.com",
      issuer: "QualityMate",
    });
    expect(uri.startsWith("otpauth://totp/QualityMate:alice%40example.com?")).toBe(true);
    expect(uri).toContain("secret=JBSWY3DPEHPK3PXP");
    expect(uri).toContain("issuer=QualityMate");
    expect(uri).toContain("algorithm=SHA1");
    expect(uri).toContain("digits=6");
    expect(uri).toContain("period=30");
  });
});
