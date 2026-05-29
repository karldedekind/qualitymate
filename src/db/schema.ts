import {
  boolean,
  date,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["admin", "site_staff"]);

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
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
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
