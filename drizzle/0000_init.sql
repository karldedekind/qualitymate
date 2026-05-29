CREATE TYPE "role" AS ENUM ('admin', 'site_staff');

CREATE TABLE "user" (
  "id" text PRIMARY KEY,
  "email" text UNIQUE NOT NULL,
  "name" text NOT NULL,
  "email_verified" boolean NOT NULL DEFAULT false,
  "image" text,
  "role" role NOT NULL DEFAULT 'site_staff',
  "deactivated_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE "session" (
  "id" text PRIMARY KEY,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "token" text UNIQUE NOT NULL,
  "expires_at" timestamp NOT NULL,
  "ip_address" text,
  "user_agent" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE "account" (
  "id" text PRIMARY KEY,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "account_id" text NOT NULL,
  "provider_id" text NOT NULL,
  "access_token" text,
  "refresh_token" text,
  "id_token" text,
  "access_token_expires_at" timestamp,
  "refresh_token_expires_at" timestamp,
  "scope" text,
  "password" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE "verification" (
  "id" text PRIMARY KEY,
  "identifier" text NOT NULL,
  "value" text NOT NULL,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE "audit_log" (
  "id" serial PRIMARY KEY,
  "ts" timestamp NOT NULL DEFAULT now(),
  "user_id" text,
  "user_email_snapshot" text,
  "entity_type" text NOT NULL,
  "entity_id" text,
  "action" text NOT NULL,
  "before" jsonb,
  "after" jsonb,
  "ip" text,
  "user_agent" text
);

CREATE INDEX "audit_log_entity_idx" ON "audit_log" ("entity_type", "entity_id", "ts" DESC);
CREATE INDEX "audit_log_ts_idx" ON "audit_log" ("ts" DESC);
CREATE INDEX "audit_log_user_idx" ON "audit_log" ("user_id", "ts" DESC);

CREATE TABLE "setup_state" (
  "id" integer PRIMARY KEY DEFAULT 1,
  "step" text NOT NULL DEFAULT 'welcome',
  "company_name" text,
  "company_short_name" text,
  "primary_color" text,
  "completed_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CHECK ("id" = 1)
);

INSERT INTO "setup_state" ("id") VALUES (1);
