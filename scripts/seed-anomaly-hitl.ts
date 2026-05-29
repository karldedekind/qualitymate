import { randomBytes } from "node:crypto";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("[seed-anomaly-hitl] DATABASE_URL is required");
    process.exit(1);
  }

  const scenario = process.argv[2] ?? "below"; // "below" = 5 unknowns, "above" = 6
  const dateIso = process.argv[3] ?? new Date().toISOString().slice(0, 10);
  const count = scenario === "above" ? 6 : 5;

  const { db } = await import("@/db");
  const { jobs, siteAttendances } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");

  const jobNumber = scenario === "above" ? "HITL-09B" : "HITL-09A";
  const jobName = scenario === "above" ? "Anomaly HITL — above threshold" : "Anomaly HITL — below threshold";

  // Clean prior runs
  const existing = await db.select().from(jobs).where(eq(jobs.number, jobNumber));
  for (const j of existing) {
    await db.delete(siteAttendances).where(eq(siteAttendances.jobId, j.id));
    await db.delete(jobs).where(eq(jobs.id, j.id));
  }

  const jobId = randomBytes(8).toString("base64url");
  await db.insert(jobs).values({ id: jobId, number: jobNumber, name: jobName, active: true });

  const signedInAt = new Date(`${dateIso}T08:00:00Z`);
  const plannedDeparture = new Date(signedInAt.getTime() + 8 * 60 * 60 * 1000);

  for (let i = 1; i <= count; i++) {
    await db.insert(siteAttendances).values({
      id: randomBytes(8).toString("base64url"),
      jobId,
      fullName: `HITL Worker ${i}`,
      mobile: "0400000000",
      companyName: `HITL-Unknown-${scenario}-${i}`,
      trade: "Carpenter",
      emergencyContactName: "EC",
      emergencyContactPhone: "0400000001",
      whiteCardNumber: `WC-${i}`,
      whiteCardExpiry: "2099-01-01",
      declWhsmp: true,
      declEmergency: true,
      declFitForWork: true,
      declEmergencyAction: true,
      declHazards: true,
      declPpe: true,
      declCompetent: true,
      declSiteRules: true,
      consent: true,
      signaturePath: "hitl/placeholder.png",
      signedInAt,
      plannedDepartureAt: plannedDeparture,
    });
  }

  console.log(`[seed-anomaly-hitl] scenario=${scenario} jobNumber=${jobNumber} jobId=${jobId} date=${dateIso} unknowns=${count}`);
}

main().catch((err) => {
  console.error("[seed-anomaly-hitl] failed:", err);
  process.exit(1);
});
