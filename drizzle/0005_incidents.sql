CREATE TYPE "incident_status" AS ENUM ('pending_review', 'open', 'closed');

CREATE TABLE "incidents" (
  "id" text PRIMARY KEY,
  "job_id" text REFERENCES "jobs"("id") ON DELETE SET NULL,
  "filed_by" text REFERENCES "user"("id") ON DELETE SET NULL,
  "title" text NOT NULL,
  "description" text NOT NULL,
  "status" "incident_status" NOT NULL DEFAULT 'pending_review',
  "category_id" text REFERENCES "categories"("id") ON DELETE SET NULL,
  "priority" text,
  "root_cause" text,
  "close_reason" text,
  "closed_at" timestamp,
  "closed_by" text REFERENCES "user"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX "incidents_status_idx" ON "incidents" ("status");
CREATE INDEX "incidents_filed_by_idx" ON "incidents" ("filed_by");
CREATE INDEX "incidents_job_idx" ON "incidents" ("job_id");
CREATE INDEX "incidents_created_idx" ON "incidents" ("created_at" DESC);

CREATE TABLE "incident_photos" (
  "id" text PRIMARY KEY,
  "incident_id" text NOT NULL REFERENCES "incidents"("id") ON DELETE CASCADE,
  "path" text NOT NULL,
  "original_filename" text,
  "width" integer,
  "height" integer,
  "taken_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX "incident_photos_incident_idx" ON "incident_photos" ("incident_id");

CREATE TABLE "register_entries" (
  "id" text PRIMARY KEY,
  "incident_id" text NOT NULL UNIQUE REFERENCES "incidents"("id") ON DELETE CASCADE,
  "summary" text NOT NULL,
  "closed_at" timestamp NOT NULL,
  "closed_by" text REFERENCES "user"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX "register_entries_closed_idx" ON "register_entries" ("closed_at" DESC);
