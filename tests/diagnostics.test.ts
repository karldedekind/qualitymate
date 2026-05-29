import { describe, expect, it } from "vitest";
import { sanitiseEnv, tailLines } from "@/lib/diagnostics";

describe("sanitiseEnv", () => {
  it("redacts variables with secret-like names", () => {
    const env = {
      DATABASE_URL: "postgres://user:pw@db",
      BETTER_AUTH_SECRET: "shhh",
      RECOVERY_PASSPHRASE: "topsecret",
      INSTALL_PASSPHRASE: "alsosecret",
      SMTP_PASSWORD: "p4ss",
      ANTHROPIC_API_KEY: "sk-...",
      AWS_SECRET_ACCESS_KEY: "AKIA",
      AWS_PRIVATE_TOKEN: "t",
      APP_URL: "http://localhost:3000",
      NODE_ENV: "production",
      LOG_LEVEL: "info",
    };
    const out = sanitiseEnv(env as unknown as NodeJS.ProcessEnv);
    expect(out.BETTER_AUTH_SECRET).toBe("[REDACTED]");
    expect(out.RECOVERY_PASSPHRASE).toBe("[REDACTED]");
    expect(out.INSTALL_PASSPHRASE).toBe("[REDACTED]");
    expect(out.SMTP_PASSWORD).toBe("[REDACTED]");
    expect(out.ANTHROPIC_API_KEY).toBe("[REDACTED]");
    expect(out.AWS_SECRET_ACCESS_KEY).toBe("[REDACTED]");
    expect(out.AWS_PRIVATE_TOKEN).toBe("[REDACTED]");
    expect(out.APP_URL).toBe("http://localhost:3000");
    expect(out.NODE_ENV).toBe("production");
    expect(out.LOG_LEVEL).toBe("info");
    expect(out.DATABASE_URL).toBe("postgres://user:pw@db");
  });

  it("ignores undefined values", () => {
    const env = { A: undefined, B: "1" };
    const out = sanitiseEnv(env as unknown as NodeJS.ProcessEnv);
    expect(out).toEqual({ B: "1" });
  });
});

describe("tailLines", () => {
  it("returns the full content when below the limit", () => {
    expect(tailLines("a\nb\nc", 10)).toBe("a\nb\nc");
  });

  it("returns the last N lines when above the limit", () => {
    const content = Array.from({ length: 100 }, (_, i) => `line${i}`).join("\n");
    const tailed = tailLines(content, 5);
    expect(tailed.split("\n")).toEqual([
      "line95",
      "line96",
      "line97",
      "line98",
      "line99",
    ]);
  });
});
