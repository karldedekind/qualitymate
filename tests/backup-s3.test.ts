import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { startEphemeralPostgres, stopEphemeralPostgres } from "./db-helper";

let workDir: string;

beforeAll(async () => {
  process.env.INSTALL_PASSPHRASE = "test-install-passphrase-32-bytes-min-aaaaa";
  workDir = join(tmpdir(), `qm-s3-${randomBytes(6).toString("hex")}`);
  await mkdir(workDir, { recursive: true });
  await startEphemeralPostgres();
});

afterAll(async () => {
  await stopEphemeralPostgres();
  await rm(workDir, { recursive: true, force: true });
});

beforeEach(async () => {
  const { db } = await import("@/db");
  const { sql } = await import("drizzle-orm");
  await db.execute(sql`TRUNCATE "settings"`);
  const { invalidate } = await import("@/lib/settings");
  invalidate();
});

describe("pushObject — sends file to S3 with correct key/body", () => {
  it("composes the key as `<prefix><basename>` and includes the file body", async () => {
    const { set } = await import("@/lib/settings");
    await set("s3.endpoint", "http://localhost:9000");
    await set("s3.region", "us-east-1");
    await set("s3.bucket", "qualitymate");
    await set("s3.access_key_id", "minio");
    await set("s3.secret_access_key", "minio12345");
    await set("s3.prefix", "qualitymate/");
    await set("s3.force_path_style", "true");

    const filepath = join(workDir, "qualitymate-backup-2026-05-06T02-00-00Z.tar.gz");
    const payload = Buffer.from("hello-tarball-bytes");
    await writeFile(filepath, payload);

    // Mock the underlying S3 client so the test does not need a network.
    const sendMock = vi.fn().mockResolvedValue({ ETag: '"abc123"' });
    const fakeClient = { send: sendMock } as unknown as S3Client;
    const { _setClientForTests, pushObject } = await import("@/lib/s3");
    _setClientForTests(fakeClient);

    const result = await pushObject(filepath);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.key).toBe("qualitymate/qualitymate-backup-2026-05-06T02-00-00Z.tar.gz");
    expect(result.bytes).toBe(payload.length);
    expect(result.etag).toBe('"abc123"');
    expect(sendMock).toHaveBeenCalledTimes(1);
    const cmd = sendMock.mock.calls[0]![0] as PutObjectCommand;
    expect(cmd).toBeInstanceOf(PutObjectCommand);
    expect(cmd.input.Bucket).toBe("qualitymate");
    expect(cmd.input.Key).toBe("qualitymate/qualitymate-backup-2026-05-06T02-00-00Z.tar.gz");
    expect(cmd.input.ContentLength).toBe(payload.length);

    _setClientForTests(null);
  });

  it("returns ok=false when S3 is unconfigured", async () => {
    const { _setClientForTests, pushObject } = await import("@/lib/s3");
    _setClientForTests(null);
    const r = await pushObject(join(workDir, "nope.tar.gz"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("S3 not configured");
  });
});

describe("testPush — credential probe sends a tiny ping object", () => {
  it("sends a 2-byte body and returns the resulting key", async () => {
    const { set } = await import("@/lib/settings");
    await set("s3.endpoint", "http://localhost:9000");
    await set("s3.bucket", "qualitymate");
    await set("s3.access_key_id", "minio");
    await set("s3.secret_access_key", "minio12345");
    await set("s3.prefix", "ping-prefix/");

    const sendMock = vi.fn().mockResolvedValue({ ETag: '"def456"' });
    const fakeClient = { send: sendMock } as unknown as S3Client;
    const { _setClientForTests, testPush } = await import("@/lib/s3");
    _setClientForTests(fakeClient);

    const r = await testPush();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.bytes).toBe(2);
    expect(r.key.startsWith("ping-prefix/.qualitymate-ping-")).toBe(true);
    const cmd = sendMock.mock.calls[0]![0] as PutObjectCommand;
    expect(cmd.input.ContentLength).toBe(2);
    expect((cmd.input.Body as Buffer).toString()).toBe("ok");

    _setClientForTests(null);
  });
});
