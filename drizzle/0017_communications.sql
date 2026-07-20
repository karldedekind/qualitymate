-- ContractFlow: per-job communications log.

CREATE TABLE "communications" (
  "id" text PRIMARY KEY,
  "job_id" text NOT NULL REFERENCES "jobs"("id") ON DELETE RESTRICT,
  "document_id" text REFERENCES "contract_documents"("id") ON DELETE SET NULL,
  "variation_id" text REFERENCES "variations"("id") ON DELETE SET NULL,
  "direction" text NOT NULL,
  "subject" text NOT NULL,
  "occurred_at" timestamp NOT NULL,
  "path" text,
  "original_filename" text,
  "note" text,
  "created_by" text REFERENCES "user"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX "communications_job_idx" ON "communications" ("job_id");
CREATE INDEX "communications_document_idx" ON "communications" ("document_id");
