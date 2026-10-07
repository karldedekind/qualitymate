-- Document Register: Controlled Documents, their Versions, Legacy IDs,
-- Usage Trigger links and Reviews. Document Categories, Document Types and
-- Usage Triggers are rows in "categories" (kinds doc_category, doc_type,
-- doc_usage_trigger).

CREATE TYPE "controlled_doc_version_status" AS ENUM ('draft', 'issued', 'superseded');

CREATE TYPE "controlled_doc_review_outcome" AS ENUM ('no_change', 'changes_needed');

CREATE TABLE "controlled_documents" (
  "id" text PRIMARY KEY,
  "document_id" text NOT NULL UNIQUE,
  "category_id" text NOT NULL REFERENCES "categories"("id") ON DELETE RESTRICT,
  "type_id" text NOT NULL REFERENCES "categories"("id") ON DELETE RESTRICT,
  "number" integer NOT NULL,
  "title" text NOT NULL,
  "notes" text,
  "created_by" text REFERENCES "user"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

-- The Number is unique per Document Type across all Document Categories.
CREATE UNIQUE INDEX "controlled_documents_type_number_idx"
  ON "controlled_documents" ("type_id", "number");
CREATE INDEX "controlled_documents_category_idx" ON "controlled_documents" ("category_id");

CREATE TABLE "controlled_doc_versions" (
  "id" text PRIMARY KEY,
  "document_id" text NOT NULL REFERENCES "controlled_documents"("id") ON DELETE RESTRICT,
  "version" integer NOT NULL,
  "status" "controlled_doc_version_status" NOT NULL DEFAULT 'draft',
  "date_issued" date,
  "next_review_date" date,
  "approved_by" text REFERENCES "user"("id") ON DELETE SET NULL,
  "approved_by_name" text,
  "archive_date" date,
  "content" jsonb NOT NULL DEFAULT '[]',
  "source_file_path" text,
  "source_file_name" text,
  "created_by" text REFERENCES "user"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX "controlled_doc_versions_doc_version_idx"
  ON "controlled_doc_versions" ("document_id", "version");
-- Exactly one current Version and at most one open draft per document.
CREATE UNIQUE INDEX "controlled_doc_versions_one_issued_idx"
  ON "controlled_doc_versions" ("document_id") WHERE "status" = 'issued';
CREATE UNIQUE INDEX "controlled_doc_versions_one_draft_idx"
  ON "controlled_doc_versions" ("document_id") WHERE "status" = 'draft';

-- Issued and Superseded Versions are retained (7 years, IMS Manual §4.2.1).
-- Only an unissued draft may ever be deleted.
CREATE FUNCTION "controlled_doc_versions_retain"() RETURNS trigger AS $$
BEGIN
  IF OLD."status" <> 'draft' THEN
    RAISE EXCEPTION 'controlled document versions are retained and cannot be deleted (version %, status %)',
      OLD."id", OLD."status";
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "controlled_doc_versions_retain_trg"
  BEFORE DELETE ON "controlled_doc_versions"
  FOR EACH ROW EXECUTE FUNCTION "controlled_doc_versions_retain"();

CREATE TABLE "controlled_doc_legacy_ids" (
  "id" text PRIMARY KEY,
  "document_id" text NOT NULL REFERENCES "controlled_documents"("id") ON DELETE CASCADE,
  "legacy_id" text NOT NULL,
  "source" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX "controlled_doc_legacy_ids_doc_legacy_idx"
  ON "controlled_doc_legacy_ids" ("document_id", "legacy_id");

CREATE TABLE "controlled_doc_usage_triggers" (
  "document_id" text NOT NULL REFERENCES "controlled_documents"("id") ON DELETE CASCADE,
  "trigger_id" text NOT NULL REFERENCES "categories"("id") ON DELETE RESTRICT,
  PRIMARY KEY ("document_id", "trigger_id")
);

CREATE INDEX "controlled_doc_usage_triggers_trigger_idx"
  ON "controlled_doc_usage_triggers" ("trigger_id");

CREATE TABLE "controlled_doc_reviews" (
  "id" text PRIMARY KEY,
  "version_id" text NOT NULL REFERENCES "controlled_doc_versions"("id") ON DELETE RESTRICT,
  "reviewed_on" date NOT NULL,
  "reviewer_id" text REFERENCES "user"("id") ON DELETE SET NULL,
  "reviewer_name" text NOT NULL,
  "outcome" "controlled_doc_review_outcome" NOT NULL,
  "notes" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX "controlled_doc_reviews_version_idx" ON "controlled_doc_reviews" ("version_id");
