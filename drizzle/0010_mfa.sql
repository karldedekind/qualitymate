ALTER TABLE "user" ADD COLUMN "totp_secret" text;
ALTER TABLE "user" ADD COLUMN "totp_enabled_at" timestamp;
ALTER TABLE "user" ADD COLUMN "totp_recovery_codes" jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE "session" ADD COLUMN "mfa_verified_at" timestamp;
