CREATE TABLE "settings" (
  "key" text PRIMARY KEY,
  "value" text,
  "is_secret" boolean NOT NULL DEFAULT false,
  "updated_at" timestamp NOT NULL DEFAULT now(),
  "updated_by" text REFERENCES "user"("id") ON DELETE SET NULL
);
