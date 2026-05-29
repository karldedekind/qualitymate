ALTER TABLE "user" ADD COLUMN "must_change_password" boolean NOT NULL DEFAULT false;

CREATE TABLE "invite" (
  "id" text PRIMARY KEY,
  "email" text NOT NULL,
  "role" role NOT NULL DEFAULT 'site_staff',
  "token" text UNIQUE NOT NULL,
  "expires_at" timestamp NOT NULL,
  "used_at" timestamp,
  "invited_by" text REFERENCES "user"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX "invite_email_idx" ON "invite" ("email");
