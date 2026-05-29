import { eq } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { encrypt, decrypt } from "@/lib/crypto";

export const SECRET_KEYS = new Set<string>([
  "smtp.password",
  "ai.anthropic_key",
  "s3.secret_access_key",
  "s3.access_key_id",
  "heartbeat.token",
  "heartbeat.ingest_token",
]);

export const KNOWN_KEYS = {
  COMPANY_NAME: "branding.company_name",
  COMPANY_SHORT_NAME: "branding.company_short_name",
  PRIMARY_COLOR: "branding.primary_color",
  LOGO_PATH: "branding.logo_path",
  ISO_MANAGEMENT_REP: "iso.management_representative_user_id",
  MEETING_DISTRIBUTION_LIST: "meetings.default_distribution_list",
  MFA_REQUIRE_ALL_ADMINS: "mfa.require_all_admins",
  HEARTBEAT_ENABLED: "heartbeat.enabled",
  HEARTBEAT_ENDPOINT: "heartbeat.endpoint",
  HEARTBEAT_INSTANCE_ID: "heartbeat.instance_id",
  HEARTBEAT_INCLUDE_COMPANY_NAME: "heartbeat.include_company_name",
  HEARTBEAT_LAST_AT: "heartbeat.last_at",
  HEARTBEAT_INGEST_TOKEN: "heartbeat.ingest_token",
} as const;

const cache = new Map<string, string | null>();
let cacheLoaded = false;

function isSecret(key: string): boolean {
  return SECRET_KEYS.has(key);
}

async function loadCache(): Promise<void> {
  const rows = await db.select().from(settings);
  cache.clear();
  for (const row of rows) {
    if (row.isSecret) continue;
    cache.set(row.key, row.value);
  }
  cacheLoaded = true;
}

export async function get(key: string): Promise<string | null> {
  if (!isSecret(key) && cache.has(key)) {
    return cache.get(key) ?? null;
  }
  const rows = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
  const row = rows[0];
  if (!row || row.value == null) return null;
  if (row.isSecret) return decrypt(row.value);
  cache.set(row.key, row.value);
  return row.value;
}

export async function set(
  key: string,
  value: string | null,
  opts: { actor?: { id: string } } = {},
): Promise<void> {
  const secret = isSecret(key);
  const stored = value == null ? null : secret ? encrypt(value) : value;

  await db
    .insert(settings)
    .values({
      key,
      value: stored,
      isSecret: secret,
      updatedBy: opts.actor?.id ?? null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: settings.key,
      set: {
        value: stored,
        isSecret: secret,
        updatedBy: opts.actor?.id ?? null,
        updatedAt: new Date(),
      },
    });

  if (!secret) cache.set(key, stored);
  else cache.delete(key);
}

export async function getCached(): Promise<Record<string, string | null>> {
  if (!cacheLoaded) await loadCache();
  return Object.fromEntries(cache);
}

export async function getMany(keys: string[]): Promise<Record<string, string | null>> {
  if (!cacheLoaded) await loadCache();
  const out: Record<string, string | null> = {};
  for (const k of keys) {
    if (isSecret(k)) {
      out[k] = await get(k);
    } else {
      out[k] = cache.get(k) ?? null;
    }
  }
  return out;
}

export function invalidate(): void {
  cache.clear();
  cacheLoaded = false;
}
