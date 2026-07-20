-- ContractFlow: variations register.

CREATE TYPE "variation_status" AS ENUM ('proposed', 'submitted', 'approved', 'rejected');

CREATE TABLE "variations" (
  "id" text PRIMARY KEY,
  "job_id" text NOT NULL REFERENCES "jobs"("id") ON DELETE RESTRICT,
  "number" integer NOT NULL,
  "description" text NOT NULL,
  "claimed_value_cents" bigint,
  "approved_value_cents" bigint,
  "time_impact_days" integer,
  "status" "variation_status" NOT NULL DEFAULT 'proposed',
  "decided_at" timestamp,
  "created_by" text REFERENCES "user"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX "variations_job_number_idx" ON "variations" ("job_id", "number");

CREATE TABLE "variation_files" (
  "id" text PRIMARY KEY,
  "variation_id" text NOT NULL REFERENCES "variations"("id") ON DELETE CASCADE,
  "path" text NOT NULL,
  "original_filename" text NOT NULL,
  "uploaded_by" text REFERENCES "user"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX "variation_files_variation_idx" ON "variation_files" ("variation_id");
