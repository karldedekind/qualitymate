import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { basename } from "node:path";
import { S3Client, PutObjectCommand, type S3ClientConfig } from "@aws-sdk/client-s3";
import { get } from "@/lib/settings";

export type S3Config = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  prefix: string;
};

let testClient: S3Client | null = null;

export function _setClientForTests(c: S3Client | null): void {
  testClient = c;
}

export async function readS3Config(): Promise<S3Config | null> {
  const [endpoint, region, bucket, accessKeyId, secretAccessKey, pathStyle, prefix] =
    await Promise.all([
      get("s3.endpoint"),
      get("s3.region"),
      get("s3.bucket"),
      get("s3.access_key_id"),
      get("s3.secret_access_key"),
      get("s3.force_path_style"),
      get("s3.prefix"),
    ]);
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;
  return {
    endpoint,
    region: region ?? "us-east-1",
    bucket,
    accessKeyId,
    secretAccessKey,
    forcePathStyle: pathStyle !== "false",
    prefix: prefix ?? "qualitymate/",
  };
}

export async function isConfigured(): Promise<boolean> {
  return (await readS3Config()) !== null;
}

function makeClient(cfg: S3Config): S3Client {
  if (testClient) return testClient;
  const opts: S3ClientConfig = {
    endpoint: cfg.endpoint,
    region: cfg.region,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
    forcePathStyle: cfg.forcePathStyle,
  };
  return new S3Client(opts);
}

export type PushResult =
  | { ok: true; key: string; bytes: number; etag: string | null }
  | { ok: false; error: string };

/**
 * Upload a local file to the configured S3-compatible bucket. Key is
 * `<prefix><basename>` unless `keyOverride` is supplied.
 */
export async function pushObject(
  filepath: string,
  keyOverride?: string,
): Promise<PushResult> {
  if (process.env.E2E === "1") {
    const fileStat = await stat(filepath).catch(() => null);
    return {
      ok: true,
      key: keyOverride ?? `e2e/${basename(filepath)}`,
      bytes: fileStat?.size ?? 0,
      etag: "e2e-stub",
    };
  }
  const cfg = await readS3Config();
  if (!cfg) return { ok: false, error: "S3 not configured" };
  const client = makeClient(cfg);
  const key = keyOverride ?? `${cfg.prefix}${basename(filepath)}`;
  const fileStat = await stat(filepath);
  try {
    const out = await client.send(
      new PutObjectCommand({
        Bucket: cfg.bucket,
        Key: key,
        Body: createReadStream(filepath),
        ContentLength: fileStat.size,
        ContentType: "application/gzip",
      }),
    );
    return { ok: true, key, bytes: fileStat.size, etag: out.ETag ?? null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "push failed" };
  }
}

/** Tiny "are credentials valid" probe: tries to put a 0-byte ping object. */
export async function testPush(): Promise<PushResult> {
  if (process.env.E2E === "1") {
    return { ok: true, key: "e2e-ping", bytes: 2, etag: "e2e-stub" };
  }
  const cfg = await readS3Config();
  if (!cfg) return { ok: false, error: "S3 not configured" };
  const client = makeClient(cfg);
  const key = `${cfg.prefix}.qualitymate-ping-${Date.now()}`;
  try {
    const out = await client.send(
      new PutObjectCommand({
        Bucket: cfg.bucket,
        Key: key,
        Body: Buffer.from("ok"),
        ContentLength: 2,
        ContentType: "text/plain",
      }),
    );
    return { ok: true, key, bytes: 2, etag: out.ETag ?? null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "push failed" };
  }
}
