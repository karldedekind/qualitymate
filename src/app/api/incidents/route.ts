import { NextResponse } from "next/server";
import { z } from "zod";
import { record } from "@/lib/audit";
import { getSessionUser } from "@/lib/auth-helpers";
import { attachPhotos, file as fileIncident } from "@/lib/incidents";
import { findJobById } from "@/lib/jobs";
import { getRequestMeta } from "@/lib/request-meta";

const Schema = z.object({
  jobId: z.string().optional().nullable(),
  title: z.string().min(3).max(200),
  description: z.string().min(3).max(5000),
});

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (user.deactivated || user.mustChangePassword) {
    return NextResponse.json({ error: "Account not ready" }, { status: 403 });
  }

  const form = await req.formData();
  const rawJob = form.get("jobId");
  const parsed = Schema.safeParse({
    jobId: typeof rawJob === "string" && rawJob.length > 0 ? rawJob : null,
    title: form.get("title"),
    description: form.get("description"),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  if (parsed.data.jobId) {
    const job = await findJobById(parsed.data.jobId);
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 400 });
  }

  const meta = await getRequestMeta();
  const created = await fileIncident({
    jobId: parsed.data.jobId ?? null,
    filedBy: user.id,
    title: parsed.data.title,
    description: parsed.data.description,
  });

  const photos = form.getAll("photos").filter((p): p is File => p instanceof File && p.size > 0);
  let photoCount = 0;
  let photoError: string | null = null;
  if (photos.length > 0) {
    try {
      const saved = await attachPhotos(created.id, photos);
      photoCount = saved.length;
    } catch (err) {
      photoError = err instanceof Error ? err.message : "Photo upload failed";
    }
  }

  await record({
    actor: { id: user.id, email: user.email },
    action: "incident.file",
    entity: { type: "incident", id: created.id },
    after: {
      title: created.title,
      jobId: created.jobId,
      status: created.status,
      photoCount,
      photoError,
      source: "api",
    },
    request: meta,
  });

  return NextResponse.json({ id: created.id, photoCount, photoError });
}
