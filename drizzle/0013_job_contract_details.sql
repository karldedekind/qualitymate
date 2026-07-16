-- Job contract particulars (Principal, rep, Date for PC, contract sum, day
-- basis) plus contract source documents (LOA, PO, rep appointment, conditions)
-- uploaded against a job.

ALTER TABLE "jobs" ADD COLUMN "principal_name" text;
ALTER TABLE "jobs" ADD COLUMN "principal_trading_as" text;
ALTER TABLE "jobs" ADD COLUMN "principal_rep_name" text;
ALTER TABLE "jobs" ADD COLUMN "principal_rep_phone" text;
ALTER TABLE "jobs" ADD COLUMN "principal_rep_email" text;
ALTER TABLE "jobs" ADD COLUMN "contract_date_for_pc" date;
ALTER TABLE "jobs" ADD COLUMN "contract_sum_cents" bigint;
ALTER TABLE "jobs" ADD COLUMN "day_basis" text;

CREATE TABLE "job_contract_files" (
  "id" text PRIMARY KEY,
  "job_id" text NOT NULL REFERENCES "jobs"("id") ON DELETE RESTRICT,
  "kind" text NOT NULL,
  "path" text NOT NULL,
  "original_filename" text NOT NULL,
  "uploaded_by" text REFERENCES "user"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX "job_contract_files_job_idx" ON "job_contract_files" ("job_id");
