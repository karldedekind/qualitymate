ALTER TYPE "meeting_status" ADD VALUE IF NOT EXISTS 'approved';

ALTER TABLE "meetings" ADD COLUMN "signoffs" jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "meetings" ADD COLUMN "signoff_tokens" jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE "meetings" ADD COLUMN "signoff_issued_at" timestamp;
ALTER TABLE "meetings" ADD COLUMN "approved_by" text REFERENCES "user"("id") ON DELETE SET NULL;
ALTER TABLE "meetings" ADD COLUMN "approved_at" timestamp;
