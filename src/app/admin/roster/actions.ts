"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { record } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth-helpers";
import { findJobById } from "@/lib/jobs";
import { getRequestMeta } from "@/lib/request-meta";
import { rotateSupervisorToken } from "@/lib/roster";

const RotateSchema = z.object({ jobId: z.string().min(1) });

export async function rotateSupervisorTokenAction(
  formData: FormData,
): Promise<{ ok: true; token: string; url: string } | { error: string }> {
  const admin = await requireAdmin();
  const meta = await getRequestMeta();
  const parsed = RotateSchema.safeParse({ jobId: formData.get("jobId") });
  if (!parsed.success) return { error: "Invalid input" };

  const job = await findJobById(parsed.data.jobId);
  if (!job) return { error: "Job not found" };

  const { token } = await rotateSupervisorToken(parsed.data.jobId, { id: admin.id });

  await record({
    actor: { id: admin.id, email: admin.email },
    action: "roster.token.rotate",
    entity: { type: "job", id: parsed.data.jobId },
    after: { jobNumber: job.number },
    request: meta,
  });

  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const url = `${base}/roster/${parsed.data.jobId}?token=${token}`;

  revalidatePath("/admin/roster");
  return { ok: true, token, url };
}
