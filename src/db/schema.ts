import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["admin", "project_manager", "site_staff"]);

export const incidentStatusEnum = pgEnum("incident_status", [
  "pending_review",
  "open",
  "closed",
]);

export const actionStatusEnum = pgEnum("action_status", ["open", "resolved"]);

export const meetingStatusEnum = pgEnum("meeting_status", [
  "scheduled",
  "completed",
  "cancelled",
  "approved",
]);

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: roleEnum("role").notNull().default("site_staff"),
  deactivatedAt: timestamp("deactivated_at"),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  totpSecret: text("totp_secret"),
  totpEnabledAt: timestamp("totp_enabled_at"),
  totpRecoveryCodes: jsonb("totp_recovery_codes").$type<string[]>().notNull().default([]),
  signaturePath: text("signature_path"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const invite = pgTable("invite", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  role: roleEnum("role").notNull().default("site_staff"),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  invitedBy: text("invited_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  mfaVerifiedAt: timestamp("mfa_verified_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  ts: timestamp("ts").notNull().defaultNow(),
  userId: text("user_id"),
  userEmailSnapshot: text("user_email_snapshot"),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  action: text("action").notNull(),
  before: jsonb("before"),
  after: jsonb("after"),
  ip: text("ip"),
  userAgent: text("user_agent"),
});

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value"),
  isSecret: boolean("is_secret").notNull().default(false),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
});

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  body: text("body").notNull(),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const jobs = pgTable("jobs", {
  id: text("id").primaryKey(),
  number: text("number").notNull().unique(),
  name: text("name").notNull(),
  address: text("address"),
  active: boolean("active").notNull().default(true),
  principalName: text("principal_name"),
  principalTradingAs: text("principal_trading_as"),
  principalRepName: text("principal_rep_name"),
  principalRepPhone: text("principal_rep_phone"),
  principalRepEmail: text("principal_rep_email"),
  contractDateForPc: date("contract_date_for_pc"),
  contractSumCents: bigint("contract_sum_cents", { mode: "number" }),
  // Whether contract durations count ordinary (calendar) or working days.
  dayBasis: text("day_basis", { enum: ["ordinary", "working"] }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
});

// Contract source documents uploaded against a job: Letter of Acceptance,
// Purchase Order, Principal's rep appointment. Used to AI-populate contract details.
export const jobContractFiles = pgTable("job_contract_files", {
  id: text("id").primaryKey(),
  jobId: text("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "restrict" }),
  kind: text("kind", { enum: ["loa", "po", "sr_rep", "conditions"] }).notNull(),
  path: text("path").notNull(),
  originalFilename: text("original_filename").notNull(),
  uploadedBy: text("uploaded_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const categories = pgTable("categories", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  kind: text("kind").notNull(),
  label: text("label").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const siteAttendances = pgTable("site_attendances", {
  id: text("id").primaryKey(),
  jobId: text("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "restrict" }),
  fullName: text("full_name").notNull(),
  mobile: text("mobile").notNull(),
  companyName: text("company_name").notNull(),
  trade: text("trade").notNull(),
  emergencyContactName: text("emergency_contact_name").notNull(),
  emergencyContactPhone: text("emergency_contact_phone").notNull(),
  whiteCardNumber: text("white_card_number").notNull(),
  whiteCardExpiry: date("white_card_expiry").notNull(),
  declWhsmp: boolean("decl_whsmp").notNull().default(false),
  declEmergency: boolean("decl_emergency").notNull().default(false),
  declFitForWork: boolean("decl_fit_for_work").notNull().default(false),
  declEmergencyAction: boolean("decl_emergency_action").notNull().default(false),
  declHazards: boolean("decl_hazards").notNull().default(false),
  declPpe: boolean("decl_ppe").notNull().default(false),
  declCompetent: boolean("decl_competent").notNull().default(false),
  declSiteRules: boolean("decl_site_rules").notNull().default(false),
  consent: boolean("consent").notNull().default(false),
  signaturePath: text("signature_path").notNull(),
  signedInAt: timestamp("signed_in_at").notNull().defaultNow(),
  plannedDepartureAt: timestamp("planned_departure_at").notNull(),
  ip: text("ip"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const incidents = pgTable("incidents", {
  id: text("id").primaryKey(),
  jobId: text("job_id").references(() => jobs.id, { onDelete: "set null" }),
  filedBy: text("filed_by").references(() => user.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  description: text("description").notNull(),
  status: incidentStatusEnum("status").notNull().default("pending_review"),
  categoryId: text("category_id").references(() => categories.id, { onDelete: "set null" }),
  priority: text("priority"),
  rootCause: text("root_cause"),
  closeReason: text("close_reason"),
  closedAt: timestamp("closed_at"),
  closedBy: text("closed_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const incidentPhotos = pgTable("incident_photos", {
  id: text("id").primaryKey(),
  incidentId: text("incident_id")
    .notNull()
    .references(() => incidents.id, { onDelete: "cascade" }),
  path: text("path").notNull(),
  originalFilename: text("original_filename"),
  width: integer("width"),
  height: integer("height"),
  takenAt: timestamp("taken_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const registerEntries = pgTable("register_entries", {
  id: text("id").primaryKey(),
  incidentId: text("incident_id")
    .notNull()
    .unique()
    .references(() => incidents.id, { onDelete: "cascade" }),
  summary: text("summary").notNull(),
  closedAt: timestamp("closed_at").notNull(),
  closedBy: text("closed_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const correctiveActions = pgTable("corrective_actions", {
  id: text("id").primaryKey(),
  incidentId: text("incident_id").references(() => incidents.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  assigneeId: text("assignee_id").references(() => user.id, { onDelete: "set null" }),
  deadline: timestamp("deadline").notNull(),
  status: actionStatusEnum("status").notNull().default("open"),
  dueSoonNotifiedAt: timestamp("due_soon_notified_at"),
  overdueNotifiedAt: timestamp("overdue_notified_at"),
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: text("resolved_by").references(() => user.id, { onDelete: "set null" }),
  resolutionNote: text("resolution_note"),
  resolutionPhotoPath: text("resolution_photo_path"),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type MeetingAttendee = {
  userId: string | null;
  name: string;
  email?: string | null;
  role?: string | null;
};

export type MeetingPack = {
  summary: string;
  agenda: string[];
  incidents: { id: string; title: string; status: string }[];
  actions: { id: string; title: string; status: string; deadline: string }[];
  trends: string;
  generatedBy: "ai" | "manual";
  generatedAt: string;
};

export type MeetingMinutes = {
  attendees: string[];
  apologies: string[];
  decisions: string[];
  followUps: string[];
  notes: string;
  generatedBy: "ai" | "manual";
  generatedAt: string;
};

export type MeetingSignoff = {
  attendeeKey: string;
  name: string;
  email: string | null;
  signedAt: string;
  ip: string | null;
};

export const meetings = pgTable("meetings", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  scheduledAt: timestamp("scheduled_at").notNull(),
  location: text("location"),
  attendees: jsonb("attendees").$type<MeetingAttendee[]>().notNull().default([]),
  pack: jsonb("pack").$type<MeetingPack | null>(),
  minutes: jsonb("minutes").$type<MeetingMinutes | null>(),
  signoffs: jsonb("signoffs").$type<MeetingSignoff[]>().notNull().default([]),
  signoffTokens: jsonb("signoff_tokens").$type<Record<string, string>>().notNull().default({}),
  signoffIssuedAt: timestamp("signoff_issued_at"),
  distributionList: jsonb("distribution_list").$type<string[]>().notNull().default([]),
  distributedAt: timestamp("distributed_at"),
  approvedBy: text("approved_by").references(() => user.id, { onDelete: "set null" }),
  approvedAt: timestamp("approved_at"),
  status: meetingStatusEnum("status").notNull().default("scheduled"),
  completedAt: timestamp("completed_at"),
  cancelledAt: timestamp("cancelled_at"),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const heartbeatInstances = pgTable("heartbeat_instances", {
  instanceId: text("instance_id").primaryKey(),
  companyName: text("company_name"),
  version: text("version"),
  optedInCompanyName: boolean("opted_in_company_name").notNull().default(false),
  lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const heartbeats = pgTable("heartbeats", {
  id: serial("id").primaryKey(),
  instanceId: text("instance_id").notNull(),
  payload: jsonb("payload").notNull(),
  receivedAt: timestamp("received_at").notNull().defaultNow(),
});

export const contractDocKindEnum = pgEnum("contract_doc_kind", ["rfi", "nod", "eot"]);

export const contractDocStatusEnum = pgEnum("contract_doc_status", [
  "draft",
  "issued",
  "answered",
  "approved",
  "rejected",
  "withdrawn",
  // NOD terminal state: the Principal's representative acknowledged the notice.
  "acknowledged",
]);

export type ContractDocContent = {
  /** RFI: the formal question. */
  question?: string;
  /** NOD: cause of delay / dates occurred / days delayed (prose, as printed). */
  cause?: string;
  datesOccurred?: string;
  daysDelayed?: string;
  /** EOT: contract-clause preamble + claim body (typed fresh per claim). */
  clausePreamble?: string;
  reasons?: string;
  request?: string;
};

export const contractDocuments = pgTable(
  "contract_documents",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "restrict" }),
    kind: contractDocKindEnum("kind").notNull(),
    // Allocated at first issue; null while draft. Gap-free per job+kind.
    number: integer("number"),
    status: contractDocStatusEnum("status").notNull().default("draft"),
    // Version currently issued; 0 = never issued. A revision edits the draft
    // fields then re-issues as currentVersion + 1.
    currentVersion: integer("current_version").notNull().default(0),
    content: jsonb("content").$type<ContractDocContent>().notNull().default({}),
    // Register-facing typed fields (kind-specific, nullable for other kinds).
    responseRequiredBy: date("response_required_by"),
    daysClaimed: integer("days_claimed"),
    pcDateSnapshot: date("pc_date_snapshot"),
    previousEotDays: integer("previous_eot_days"),
    adjustedPcDate: date("adjusted_pc_date"),
    // Cross-links (the printed "RFI Reference Number" etc).
    rfiId: text("rfi_id"),
    nodId: text("nod_id"),
    variationId: text("variation_id"),
    respondedAt: timestamp("responded_at"),
    respondedBy: text("responded_by").references(() => user.id, { onDelete: "set null" }),
    responseNote: text("response_note"),
    withdrawnAt: timestamp("withdrawn_at"),
    overdueNotifiedAt: timestamp("overdue_notified_at"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("contract_documents_job_kind_number_idx")
      .on(t.jobId, t.kind, t.number)
      .where(sql`"number" IS NOT NULL`),
  ],
);

export const contractDocVersions = pgTable("contract_doc_versions", {
  id: text("id").primaryKey(),
  documentId: text("document_id")
    .notNull()
    .references(() => contractDocuments.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  // Full snapshot of the document fields as issued (immutable).
  snapshot: jsonb("snapshot").notNull(),
  pdfPath: text("pdf_path").notNull(),
  issuedAt: timestamp("issued_at").notNull().defaultNow(),
  issuedBy: text("issued_by").references(() => user.id, { onDelete: "set null" }),
  supersededAt: timestamp("superseded_at"),
});

export const contractDocFiles = pgTable("contract_doc_files", {
  id: text("id").primaryKey(),
  documentId: text("document_id")
    .notNull()
    .references(() => contractDocuments.id, { onDelete: "cascade" }),
  // 'attachment' = ours, listed on the issued PDF; 'response' = the Principal's.
  role: text("role").notNull(),
  path: text("path").notNull(),
  originalFilename: text("original_filename").notNull(),
  uploadedBy: text("uploaded_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const variationStatusEnum = pgEnum("variation_status", [
  "proposed",
  "submitted",
  "approved",
  "rejected",
]);

export const variations = pgTable(
  "variations",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "restrict" }),
    number: integer("number").notNull(),
    description: text("description").notNull(),
    claimedValueCents: bigint("claimed_value_cents", { mode: "number" }),
    approvedValueCents: bigint("approved_value_cents", { mode: "number" }),
    timeImpactDays: integer("time_impact_days"),
    status: variationStatusEnum("status").notNull().default("proposed"),
    decidedAt: timestamp("decided_at"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("variations_job_number_idx").on(t.jobId, t.number)],
);

export const variationFiles = pgTable("variation_files", {
  id: text("id").primaryKey(),
  variationId: text("variation_id")
    .notNull()
    .references(() => variations.id, { onDelete: "cascade" }),
  path: text("path").notNull(),
  originalFilename: text("original_filename").notNull(),
  uploadedBy: text("uploaded_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const communications = pgTable("communications", {
  id: text("id").primaryKey(),
  jobId: text("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "restrict" }),
  documentId: text("document_id").references(() => contractDocuments.id, {
    onDelete: "set null",
  }),
  variationId: text("variation_id").references(() => variations.id, { onDelete: "set null" }),
  direction: text("direction").notNull(), // 'inbound' | 'outbound'
  subject: text("subject").notNull(),
  occurredAt: timestamp("occurred_at").notNull(),
  path: text("path"),
  originalFilename: text("original_filename"),
  note: text("note"),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const setupState = pgTable("setup_state", {
  id: integer("id").primaryKey().default(1),
  step: text("step").notNull().default("welcome"),
  companyName: text("company_name"),
  companyShortName: text("company_short_name"),
  primaryColor: text("primary_color"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ── Document Register ────────────────────────────────────────────────────────
// Document Categories, Document Types and Usage Triggers are rows in
// `categories` with these kinds.
export const DOC_CATEGORY_KIND = "doc_category";
export const DOC_TYPE_KIND = "doc_type";
export const DOC_USAGE_TRIGGER_KIND = "doc_usage_trigger";

export const controlledDocVersionStatusEnum = pgEnum("controlled_doc_version_status", [
  "draft",
  "issued",
  "superseded",
]);

export const controlledDocReviewOutcomeEnum = pgEnum("controlled_doc_review_outcome", [
  "no_change",
  "changes_needed",
]);

/** One block of a Version's structured content. The block types are defined
 *  by the House Style renderer. */
export type ControlledDocBlock = { type: string; [key: string]: unknown };

export const controlledDocuments = pgTable(
  "controlled_documents",
  {
    id: text("id").primaryKey(),
    // Built by the Naming Convention; permanent across Versions.
    documentId: text("document_id").notNull().unique(),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    typeId: text("type_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    // Unique per Document Type across all Document Categories.
    number: integer("number").notNull(),
    title: text("title").notNull(),
    notes: text("notes"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("controlled_documents_type_number_idx").on(t.typeId, t.number)],
);

// Issued and superseded rows can never be deleted (DB trigger, 7-year retention).
export const controlledDocVersions = pgTable(
  "controlled_doc_versions",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id")
      .notNull()
      .references(() => controlledDocuments.id, { onDelete: "restrict" }),
    version: integer("version").notNull(),
    status: controlledDocVersionStatusEnum("status").notNull().default("draft"),
    dateIssued: date("date_issued"),
    nextReviewDate: date("next_review_date"),
    approvedBy: text("approved_by").references(() => user.id, { onDelete: "set null" }),
    // Kept so "Approved By" survives the user being removed.
    approvedByName: text("approved_by_name"),
    archiveDate: date("archive_date"),
    content: jsonb("content").$type<ControlledDocBlock[]>().notNull().default([]),
    sourceFilePath: text("source_file_path"),
    sourceFileName: text("source_file_name"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("controlled_doc_versions_doc_version_idx").on(t.documentId, t.version),
    uniqueIndex("controlled_doc_versions_one_issued_idx")
      .on(t.documentId)
      .where(sql`"status" = 'issued'`),
    uniqueIndex("controlled_doc_versions_one_draft_idx")
      .on(t.documentId)
      .where(sql`"status" = 'draft'`),
  ],
);

export const controlledDocLegacyIds = pgTable(
  "controlled_doc_legacy_ids",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id")
      .notNull()
      .references(() => controlledDocuments.id, { onDelete: "cascade" }),
    legacyId: text("legacy_id").notNull(),
    // Where it came from, e.g. "old register" or "file".
    source: text("source"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("controlled_doc_legacy_ids_doc_legacy_idx").on(t.documentId, t.legacyId)],
);

export const controlledDocUsageTriggers = pgTable(
  "controlled_doc_usage_triggers",
  {
    documentId: text("document_id")
      .notNull()
      .references(() => controlledDocuments.id, { onDelete: "cascade" }),
    triggerId: text("trigger_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
  },
  (t) => [primaryKey({ columns: [t.documentId, t.triggerId] })],
);

export const controlledDocReviews = pgTable("controlled_doc_reviews", {
  id: text("id").primaryKey(),
  versionId: text("version_id")
    .notNull()
    .references(() => controlledDocVersions.id, { onDelete: "restrict" }),
  reviewedOn: date("reviewed_on").notNull(),
  reviewerId: text("reviewer_id").references(() => user.id, { onDelete: "set null" }),
  reviewerName: text("reviewer_name").notNull(),
  outcome: controlledDocReviewOutcomeEnum("outcome").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
