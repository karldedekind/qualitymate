-- ContractFlow documents: RFI / NOD / EOT drafts, immutable issued versions,
-- and per-document files.

CREATE TYPE "contract_doc_kind" AS ENUM ('rfi', 'nod', 'eot');

CREATE TYPE "contract_doc_status" AS ENUM (
  'draft', 'issued', 'answered', 'approved', 'rejected', 'withdrawn', 'acknowledged'
);

CREATE TABLE "contract_documents" (
  "id" text PRIMARY KEY,
  "job_id" text NOT NULL REFERENCES "jobs"("id") ON DELETE RESTRICT,
  "kind" "contract_doc_kind" NOT NULL,
  "number" integer,
  "status" "contract_doc_status" NOT NULL DEFAULT 'draft',
  "current_version" integer NOT NULL DEFAULT 0,
  "content" jsonb NOT NULL DEFAULT '{}',
  "response_required_by" date,
  "days_claimed" integer,
  "pc_date_snapshot" date,
  "previous_eot_days" integer,
  "adjusted_pc_date" date,
  "rfi_id" text,
  "nod_id" text,
  "variation_id" text,
  "responded_at" timestamp,
  "responded_by" text REFERENCES "user"("id") ON DELETE SET NULL,
  "response_note" text,
  "withdrawn_at" timestamp,
  "overdue_notified_at" timestamp,
  "created_by" text REFERENCES "user"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX "contract_documents_job_kind_number_idx"
  ON "contract_documents" ("job_id", "kind", "number")
  WHERE "number" IS NOT NULL;

CREATE INDEX "contract_documents_job_idx" ON "contract_documents" ("job_id");
CREATE INDEX "contract_documents_status_idx" ON "contract_documents" ("status");

CREATE TABLE "contract_doc_versions" (
  "id" text PRIMARY KEY,
  "document_id" text NOT NULL REFERENCES "contract_documents"("id") ON DELETE CASCADE,
  "version" integer NOT NULL,
  "snapshot" jsonb NOT NULL,
  "pdf_path" text NOT NULL,
  "issued_at" timestamp NOT NULL DEFAULT now(),
  "issued_by" text REFERENCES "user"("id") ON DELETE SET NULL,
  "superseded_at" timestamp
);

CREATE INDEX "contract_doc_versions_document_idx" ON "contract_doc_versions" ("document_id");

CREATE TABLE "contract_doc_files" (
  "id" text PRIMARY KEY,
  "document_id" text NOT NULL REFERENCES "contract_documents"("id") ON DELETE CASCADE,
  "role" text NOT NULL,
  "path" text NOT NULL,
  "original_filename" text NOT NULL,
  "uploaded_by" text REFERENCES "user"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX "contract_doc_files_document_idx" ON "contract_doc_files" ("document_id");
