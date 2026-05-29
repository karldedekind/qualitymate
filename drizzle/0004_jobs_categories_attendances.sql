CREATE TABLE "jobs" (
  "id" text PRIMARY KEY,
  "number" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "address" text,
  "active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  "created_by" text REFERENCES "user"("id") ON DELETE SET NULL
);

CREATE INDEX "jobs_active_idx" ON "jobs" ("active");
CREATE INDEX "jobs_number_idx" ON "jobs" ("number");

CREATE TABLE "categories" (
  "id" text PRIMARY KEY,
  "code" text NOT NULL UNIQUE,
  "kind" text NOT NULL,
  "label" text NOT NULL,
  "sort_order" integer NOT NULL DEFAULT 0,
  "active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX "categories_kind_idx" ON "categories" ("kind", "sort_order");

INSERT INTO "categories" ("id", "code", "kind", "label", "sort_order") VALUES
  ('cat_q01', 'Q01', 'quality', 'Workmanship defect', 10),
  ('cat_q02', 'Q02', 'quality', 'Material non-conformance', 20),
  ('cat_q03', 'Q03', 'quality', 'Design / drawing error', 30),
  ('cat_q04', 'Q04', 'quality', 'Specification deviation', 40),
  ('cat_q05', 'Q05', 'quality', 'Dimensional / setout error', 50),
  ('cat_q06', 'Q06', 'quality', 'Damage to existing works', 60),
  ('cat_q07', 'Q07', 'quality', 'Subcontractor non-conformance', 70),
  ('cat_q08', 'Q08', 'quality', 'Supplier non-conformance', 80),
  ('cat_q09', 'Q09', 'quality', 'Inspection / test failure', 90),
  ('cat_q10', 'Q10', 'quality', 'Documentation error', 100),
  ('cat_q11', 'Q11', 'quality', 'Calibration / equipment issue', 110),
  ('cat_q12', 'Q12', 'quality', 'Customer / client complaint', 120),
  ('cat_q13', 'Q13', 'quality', 'Rework required', 130),
  ('cat_q14', 'Q14', 'quality', 'Handover / completion defect', 140),
  ('cat_q15', 'Q15', 'quality', 'Storage / handling damage', 150),
  ('cat_q16', 'Q16', 'quality', 'Procedure not followed', 160),
  ('cat_q17', 'Q17', 'quality', 'Training / competency gap', 170),
  ('cat_q18', 'Q18', 'quality', 'Communication breakdown', 180),
  ('cat_q19', 'Q19', 'quality', 'Schedule / programme slip', 190),
  ('cat_q20', 'Q20', 'quality', 'Other quality issue', 200),
  ('cat_e01', 'E01', 'environment', 'Spill or leak', 10),
  ('cat_e02', 'E02', 'environment', 'Sediment / erosion control failure', 20),
  ('cat_e03', 'E03', 'environment', 'Waste segregation breach', 30),
  ('cat_e04', 'E04', 'environment', 'Illegal dumping', 40),
  ('cat_e05', 'E05', 'environment', 'Dust / air quality', 50),
  ('cat_e06', 'E06', 'environment', 'Noise / vibration breach', 60),
  ('cat_e07', 'E07', 'environment', 'Water discharge / stormwater', 70),
  ('cat_e08', 'E08', 'environment', 'Vegetation / habitat damage', 80),
  ('cat_e09', 'E09', 'environment', 'Hazardous material handling', 90),
  ('cat_e10', 'E10', 'environment', 'Heritage / cultural finding', 100),
  ('cat_e11', 'E11', 'environment', 'Resource use / energy waste', 110),
  ('cat_e12', 'E12', 'environment', 'Other environmental issue', 120);

CREATE TABLE "site_attendances" (
  "id" text PRIMARY KEY,
  "job_id" text NOT NULL REFERENCES "jobs"("id") ON DELETE RESTRICT,
  "full_name" text NOT NULL,
  "mobile" text NOT NULL,
  "company_name" text NOT NULL,
  "trade" text NOT NULL,
  "emergency_contact_name" text NOT NULL,
  "emergency_contact_phone" text NOT NULL,
  "white_card_number" text NOT NULL,
  "white_card_expiry" date NOT NULL,
  "decl_whsmp" boolean NOT NULL DEFAULT false,
  "decl_emergency" boolean NOT NULL DEFAULT false,
  "decl_fit_for_work" boolean NOT NULL DEFAULT false,
  "decl_emergency_action" boolean NOT NULL DEFAULT false,
  "decl_hazards" boolean NOT NULL DEFAULT false,
  "decl_ppe" boolean NOT NULL DEFAULT false,
  "decl_competent" boolean NOT NULL DEFAULT false,
  "decl_site_rules" boolean NOT NULL DEFAULT false,
  "consent" boolean NOT NULL DEFAULT false,
  "signature_path" text NOT NULL,
  "signed_in_at" timestamp NOT NULL DEFAULT now(),
  "planned_departure_at" timestamp NOT NULL,
  "ip" text,
  "user_agent" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX "site_attendances_job_signedin_idx" ON "site_attendances" ("job_id", "signed_in_at" DESC);
CREATE INDEX "site_attendances_signedin_idx" ON "site_attendances" ("signed_in_at" DESC);
