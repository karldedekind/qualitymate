ALTER TABLE "meetings" ADD COLUMN "distribution_list" jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "meetings" ADD COLUMN "distributed_at" timestamp;
