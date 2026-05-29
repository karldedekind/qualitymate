CREATE TYPE "action_status" AS ENUM ('open', 'resolved');

CREATE TABLE "corrective_actions" (
  "id" text PRIMARY KEY,
  "incident_id" text REFERENCES "incidents"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "description" text,
  "assignee_id" text REFERENCES "user"("id") ON DELETE SET NULL,
  "deadline" timestamp NOT NULL,
  "status" "action_status" NOT NULL DEFAULT 'open',
  "due_soon_notified_at" timestamp,
  "overdue_notified_at" timestamp,
  "resolved_at" timestamp,
  "resolved_by" text REFERENCES "user"("id") ON DELETE SET NULL,
  "resolution_note" text,
  "created_by" text REFERENCES "user"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX "corrective_actions_assignee_idx" ON "corrective_actions" ("assignee_id");
CREATE INDEX "corrective_actions_status_idx" ON "corrective_actions" ("status");
CREATE INDEX "corrective_actions_deadline_idx" ON "corrective_actions" ("deadline");
CREATE INDEX "corrective_actions_incident_idx" ON "corrective_actions" ("incident_id");
