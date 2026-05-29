CREATE TYPE "meeting_status" AS ENUM ('scheduled', 'completed', 'cancelled');

CREATE TABLE "meetings" (
  "id" text PRIMARY KEY,
  "title" text NOT NULL,
  "scheduled_at" timestamp NOT NULL,
  "location" text,
  "attendees" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "pack" jsonb,
  "minutes" jsonb,
  "status" "meeting_status" NOT NULL DEFAULT 'scheduled',
  "completed_at" timestamp,
  "cancelled_at" timestamp,
  "created_by" text REFERENCES "user"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX "meetings_scheduled_idx" ON "meetings" ("scheduled_at" DESC);
CREATE INDEX "meetings_status_idx" ON "meetings" ("status");
