CREATE TABLE "notifications" (
  "id" serial PRIMARY KEY,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "type" text NOT NULL,
  "entity_type" text,
  "entity_id" text,
  "body" text NOT NULL,
  "read_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX "notifications_user_unread_idx" ON "notifications" ("user_id", "read_at");
CREATE INDEX "notifications_user_created_idx" ON "notifications" ("user_id", "created_at" DESC);
