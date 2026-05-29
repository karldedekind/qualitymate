-- Vendor-side ingest tables. Stay empty on customer installs unless they accept inbound heartbeats.
CREATE TABLE "heartbeat_instances" (
  "instance_id" text PRIMARY KEY,
  "company_name" text,
  "version" text,
  "opted_in_company_name" boolean NOT NULL DEFAULT false,
  "last_seen_at" timestamp NOT NULL DEFAULT now(),
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE "heartbeats" (
  "id" serial PRIMARY KEY,
  "instance_id" text NOT NULL REFERENCES "heartbeat_instances"("instance_id") ON DELETE CASCADE,
  "payload" jsonb NOT NULL,
  "received_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX "heartbeats_instance_received_idx" ON "heartbeats" ("instance_id", "received_at" DESC);
CREATE INDEX "heartbeats_received_idx" ON "heartbeats" ("received_at" DESC);
