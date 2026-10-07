-- Seed the Document Register's admin-editable lists (rows in "categories").
-- Document Categories and Types from IMS Manual §4.2.1, plus POL, with FRM in
-- place of FORM (inconsistencies #1 and #2). SOP sub-types sort directly
-- under SOP. Usage Trigger codes are internal and never shown.

INSERT INTO "categories" ("id", "code", "kind", "label", "sort_order") VALUES
  ('doc_cat_qse', 'QSE', 'doc_category', 'Quality, Safety, Environmental', 10),
  ('doc_cat_pro', 'PRO', 'doc_category', 'Projects', 20),
  ('doc_cat_mar', 'MAR', 'doc_category', 'Marketing', 30),
  ('doc_cat_hr', 'HR', 'doc_category', 'Human Resources', 40),
  ('doc_cat_am', 'AM', 'doc_category', 'Administration', 50),
  ('doc_cat_sal', 'SAL', 'doc_category', 'Sales', 60),
  ('doc_type_temp', 'TEMP', 'doc_type', 'Template', 10),
  ('doc_type_man', 'MAN', 'doc_type', 'Manual', 20),
  ('doc_type_frm', 'FRM', 'doc_type', 'Form', 30),
  ('doc_type_ctr', 'CTR', 'doc_type', 'Contract', 40),
  ('doc_type_reg', 'REG', 'doc_type', 'Register', 50),
  ('doc_type_pla', 'PLA', 'doc_type', 'Plan', 60),
  ('doc_type_gen', 'GEN', 'doc_type', 'General Documentation', 70),
  ('doc_type_chk', 'CHK', 'doc_type', 'Checklist', 80),
  ('doc_type_cop', 'COP', 'doc_type', 'Code of Practice', 90),
  ('doc_type_swms', 'SWMS', 'doc_type', 'Safe Work Method Statement', 100),
  ('doc_type_sop', 'SOP', 'doc_type', 'Standard Operating Procedure', 110),
  ('doc_type_sops', 'SOPS', 'doc_type', 'Standard Operating Procedure – Safety', 120),
  ('doc_type_sope', 'SOPE', 'doc_type', 'Standard Operating Procedure – Environmental', 130),
  ('doc_type_sopq', 'SOPQ', 'doc_type', 'Standard Operating Procedure – Quality', 140),
  ('doc_type_sopa', 'SOPA', 'doc_type', 'Standard Operating Procedure – Administration', 150),
  ('doc_type_sopm', 'SOPM', 'doc_type', 'Standard Operating Procedure – Marketing', 160),
  ('doc_type_pol', 'POL', 'doc_type', 'Policy', 170),
  ('doc_trg_onboarding', 'TRG_ONBOARDING', 'doc_usage_trigger', 'Onboarding', 10),
  ('doc_trg_project_start', 'TRG_PROJECT_START', 'doc_usage_trigger', 'Project start', 20),
  ('doc_trg_site_activity', 'TRG_SITE_ACTIVITY', 'doc_usage_trigger', 'Site activity', 30),
  ('doc_trg_as_required', 'TRG_AS_REQUIRED', 'doc_usage_trigger', 'As required', 40)
ON CONFLICT DO NOTHING;
