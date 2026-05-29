"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { record } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth-helpers";
import {
  approve as approveMeeting,
  distributeMinutes,
  draftMinutes as draftMinutesLib,
  findById as findMeetingById,
  generatePack,
  issueSignoffTokens,
  manualMinutes,
  manualPack,
  markCancelled,
  markCompleted,
  notifySchedule,
  notifySignoffs,
  schedule as scheduleMeeting,
  setDefaultDistributionList,
  setMeetingDistributionList,
} from "@/lib/meetings";
import { send as notifySend } from "@/lib/notify";
import { env } from "@/lib/env";
import { getRequestMeta } from "@/lib/request-meta";
import type { MeetingAttendee } from "@/db/schema";

const ScheduleSchema = z.object({
  title: z.string().min(3).max(200),
  scheduledAt: z.string().min(1),
  location: z.string().max(200).optional().nullable(),
  attendees: z.string().max(4000).optional().nullable(),
});

function parseAttendees(text: string | null | undefined): MeetingAttendee[] {
  if (!text) return [];
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      // "Name <email>" parsing
      const m = /^(.+?)\s*<([^>]+)>$/.exec(line);
      if (m) return { userId: null, name: m[1]!.trim(), email: m[2]!.trim() };
      return { userId: null, name: line, email: null };
    });
}

export async function scheduleMeetingAction(formData: FormData) {
  const admin = await requireAdmin();
  const meta = await getRequestMeta();

  const parsed = ScheduleSchema.safeParse({
    title: formData.get("title"),
    scheduledAt: formData.get("scheduledAt"),
    location: formData.get("location"),
    attendees: formData.get("attendees"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const dt = new Date(parsed.data.scheduledAt);
  if (isNaN(dt.getTime())) return { error: "Invalid scheduledAt." };

  const created = await scheduleMeeting({
    title: parsed.data.title,
    scheduledAt: dt,
    location: parsed.data.location ?? null,
    attendees: parseAttendees(parsed.data.attendees),
    createdBy: admin.id,
  });

  await record({
    actor: { id: admin.id, email: admin.email },
    action: "meeting.schedule",
    entity: { type: "meeting", id: created.id },
    after: {
      title: created.title,
      scheduledAt: created.scheduledAt.toISOString(),
      attendees: created.attendees.length,
    },
    request: meta,
  });

  // Run SMTP notification after response — don't block the redirect.
  const actorSnap = { id: admin.id, email: admin.email };
  const meetingId = created.id;
  after(async () => {
    try {
      const notify = await notifySchedule(meetingId, actorSnap.email);
      await record({
        actor: actorSnap,
        action: notify.ok && !("skipped" in notify && notify.skipped)
          ? "meeting.schedule.notify"
          : notify.ok
            ? "meeting.schedule.notify_skipped"
            : "meeting.schedule.notify_failure",
        entity: { type: "meeting", id: meetingId },
        after:
          notify.ok && !("skipped" in notify && notify.skipped)
            ? { recipients: notify.recipients.length }
            : notify.ok
              ? { reason: notify.reason }
              : { code: notify.code, error: notify.error },
        request: meta,
      });
    } catch (err) {
      await record({
        actor: actorSnap,
        action: "meeting.schedule.notify_failure",
        entity: { type: "meeting", id: meetingId },
        after: { error: err instanceof Error ? err.message : "unknown" },
        request: meta,
      });
    }
  });

  revalidatePath("/admin/meetings");
  redirect(`/admin/meetings/${created.id}`);
}

const IdSchema = z.object({ id: z.string().min(1) });

export async function generatePackAction(formData: FormData) {
  const admin = await requireAdmin();
  const meta = await getRequestMeta();
  const parsed = IdSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { error: "Invalid input" };

  const result = await generatePack(parsed.data.id);
  await record({
    actor: { id: admin.id, email: admin.email },
    action: result.ok ? "meeting.pack.ai" : "meeting.pack.ai_failure",
    entity: { type: "meeting", id: parsed.data.id },
    after: result.ok
      ? {
          summaryLength: result.value.summary.length,
          agendaCount: result.value.agenda.length,
          trendsLength: result.value.trends.length,
          incidents: result.value.incidents.length,
          actions: result.value.actions.length,
        }
      : { code: result.code, error: result.error },
    request: meta,
  });

  if (!result.ok) return { error: result.error };
  revalidatePath(`/admin/meetings/${parsed.data.id}`);
  return { ok: true };
}

const ManualPackSchema = z.object({
  id: z.string().min(1),
  summary: z.string().max(8000),
  agenda: z.string().max(4000),
  trends: z.string().max(8000),
});

export async function saveManualPackAction(formData: FormData) {
  const admin = await requireAdmin();
  const meta = await getRequestMeta();
  const parsed = ManualPackSchema.safeParse({
    id: formData.get("id"),
    summary: formData.get("summary"),
    agenda: formData.get("agenda"),
    trends: formData.get("trends"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const agendaLines = parsed.data.agenda.split(/\r?\n/);
  const result = await manualPack(parsed.data.id, {
    summary: parsed.data.summary,
    agenda: agendaLines,
    trends: parsed.data.trends,
  });
  if (!result) return { error: "Meeting not found." };

  await record({
    actor: { id: admin.id, email: admin.email },
    action: "meeting.pack.manual",
    entity: { type: "meeting", id: parsed.data.id },
    after: {
      summaryLength: result.summary.length,
      agendaCount: result.agenda.length,
    },
    request: meta,
  });

  revalidatePath(`/admin/meetings/${parsed.data.id}`);
  return { ok: true };
}

const DraftMinutesSchema = z.object({
  id: z.string().min(1),
  rawNotes: z.string().max(8000),
});

export async function draftMinutesAction(formData: FormData) {
  const admin = await requireAdmin();
  const meta = await getRequestMeta();
  const parsed = DraftMinutesSchema.safeParse({
    id: formData.get("id"),
    rawNotes: formData.get("rawNotes"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const result = await draftMinutesLib(parsed.data.id, parsed.data.rawNotes);
  await record({
    actor: { id: admin.id, email: admin.email },
    action: result.ok ? "meeting.minutes.ai" : "meeting.minutes.ai_failure",
    entity: { type: "meeting", id: parsed.data.id },
    after: result.ok
      ? {
          attendees: result.value.attendees.length,
          decisions: result.value.decisions.length,
          followUps: result.value.followUps.length,
          notesLength: result.value.notes.length,
        }
      : { code: result.code, error: result.error },
    request: meta,
  });

  if (!result.ok) return { error: result.error };
  revalidatePath(`/admin/meetings/${parsed.data.id}`);
  return { ok: true };
}

const ManualMinutesSchema = z.object({
  id: z.string().min(1),
  attendees: z.string().max(4000),
  apologies: z.string().max(4000),
  decisions: z.string().max(8000),
  followUps: z.string().max(8000),
  notes: z.string().max(16000),
});

export async function saveManualMinutesAction(formData: FormData) {
  const admin = await requireAdmin();
  const meta = await getRequestMeta();
  const parsed = ManualMinutesSchema.safeParse({
    id: formData.get("id"),
    attendees: formData.get("attendees"),
    apologies: formData.get("apologies"),
    decisions: formData.get("decisions"),
    followUps: formData.get("followUps"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const split = (s: string) => s.split(/\r?\n/);
  const result = await manualMinutes(parsed.data.id, {
    attendees: split(parsed.data.attendees),
    apologies: split(parsed.data.apologies),
    decisions: split(parsed.data.decisions),
    followUps: split(parsed.data.followUps),
    notes: parsed.data.notes,
  });
  if (!result.ok) return { error: result.error };

  await record({
    actor: { id: admin.id, email: admin.email },
    action: "meeting.minutes.manual",
    entity: { type: "meeting", id: parsed.data.id },
    after: {
      attendees: result.value.attendees.length,
      decisions: result.value.decisions.length,
    },
    request: meta,
  });

  revalidatePath(`/admin/meetings/${parsed.data.id}`);
  return { ok: true };
}

export async function completeMeetingAction(formData: FormData) {
  const admin = await requireAdmin();
  const meta = await getRequestMeta();
  const parsed = IdSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { error: "Invalid input" };

  const updated = await markCompleted(parsed.data.id);
  if (!updated) return { error: "Meeting not found." };

  await record({
    actor: { id: admin.id, email: admin.email },
    action: "meeting.complete",
    entity: { type: "meeting", id: parsed.data.id },
    after: { status: updated.status },
    request: meta,
  });

  revalidatePath(`/admin/meetings/${parsed.data.id}`);
  revalidatePath("/admin/meetings");
  return { ok: true };
}

export async function issueSignoffsAction(formData: FormData) {
  const admin = await requireAdmin();
  const meta = await getRequestMeta();
  const parsed = IdSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { error: "Invalid input" };

  const result = await issueSignoffTokens(parsed.data.id);
  if (!result.ok) {
    await record({
      actor: { id: admin.id, email: admin.email },
      action: "meeting.signoff.issue_failure",
      entity: { type: "meeting", id: parsed.data.id },
      after: { code: result.code, error: result.error },
      request: meta,
    });
    return { error: result.error };
  }

  void notifySend; // reserved for future in-app user notifications

  const notify = await notifySignoffs(result.meeting, result.issued, env.APP_URL);

  await record({
    actor: { id: admin.id, email: admin.email },
    action: "meeting.signoff.issue",
    entity: { type: "meeting", id: parsed.data.id },
    after: { attendees: result.issued.length },
    request: meta,
  });

  await record({
    actor: { id: admin.id, email: admin.email },
    action:
      notify.ok && !("skipped" in notify && notify.skipped)
        ? "meeting.signoff.notify"
        : notify.ok
          ? "meeting.signoff.notify_skipped"
          : "meeting.signoff.notify_failure",
    entity: { type: "meeting", id: parsed.data.id },
    after:
      notify.ok && !("skipped" in notify && notify.skipped)
        ? { sent: notify.sent }
        : notify.ok
          ? { reason: notify.reason }
          : { error: notify.error },
    request: meta,
  });

  revalidatePath(`/admin/meetings/${parsed.data.id}`);
  return {
    ok: true,
    links: result.issued.map((i) => ({
      name: i.name,
      email: i.email,
      url: `${env.APP_URL}/meetings/sign/${result.meeting.id}?token=${i.token}`,
    })),
  };
}

export async function approveMeetingAction(formData: FormData) {
  const admin = await requireAdmin();
  const meta = await getRequestMeta();
  const parsed = IdSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { error: "Invalid input" };

  // ensure meeting exists for revalidation messaging
  const m = await findMeetingById(parsed.data.id);
  if (!m) return { error: "Meeting not found." };

  const result = await approveMeeting(parsed.data.id, admin.id);
  if (!result.ok) {
    await record({
      actor: { id: admin.id, email: admin.email },
      action: "meeting.approve.rejected",
      entity: { type: "meeting", id: parsed.data.id },
      after: { code: result.code, error: result.error },
      request: meta,
    });
    return { error: result.error };
  }

  await record({
    actor: { id: admin.id, email: admin.email },
    action: "meeting.approve",
    entity: { type: "meeting", id: parsed.data.id },
    after: { status: result.meeting.status, approvedAt: result.meeting.approvedAt?.toISOString() },
    request: meta,
  });

  // Distribute approved minutes — failure must NOT roll back approval.
  try {
    const dist = await distributeMinutes(parsed.data.id);
    if (dist.ok && !("skipped" in dist && dist.skipped)) {
      await record({
        actor: { id: admin.id, email: admin.email },
        action: "meeting.distribute",
        entity: { type: "meeting", id: parsed.data.id },
        after: {
          recipients: dist.recipients.length,
          messageId: dist.messageId,
          pdfBytes: dist.pdfBytes,
        },
        request: meta,
      });
    } else if (dist.ok) {
      await record({
        actor: { id: admin.id, email: admin.email },
        action: "meeting.distribute.skipped",
        entity: { type: "meeting", id: parsed.data.id },
        after: { reason: dist.reason },
        request: meta,
      });
    } else {
      await record({
        actor: { id: admin.id, email: admin.email },
        action: "meeting.distribute.failure",
        entity: { type: "meeting", id: parsed.data.id },
        after: { code: dist.code, error: dist.error },
        request: meta,
      });
    }
  } catch (err) {
    await record({
      actor: { id: admin.id, email: admin.email },
      action: "meeting.distribute.failure",
      entity: { type: "meeting", id: parsed.data.id },
      after: { error: err instanceof Error ? err.message : "unknown" },
      request: meta,
    });
  }

  revalidatePath(`/admin/meetings/${parsed.data.id}`);
  revalidatePath("/admin/meetings");
  return { ok: true };
}

const DistributionSchema = z.object({
  id: z.string().min(1),
  emails: z.string().max(8000),
});

export async function saveMeetingDistributionAction(formData: FormData) {
  const admin = await requireAdmin();
  const meta = await getRequestMeta();
  const parsed = DistributionSchema.safeParse({
    id: formData.get("id"),
    emails: formData.get("emails"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const list = parsed.data.emails.split(/\r?\n/);
  const updated = await setMeetingDistributionList(parsed.data.id, list);
  if (!updated) return { error: "Meeting not found." };

  await record({
    actor: { id: admin.id, email: admin.email },
    action: "meeting.distribution.update",
    entity: { type: "meeting", id: parsed.data.id },
    after: { count: updated.distributionList.length },
    request: meta,
  });

  revalidatePath(`/admin/meetings/${parsed.data.id}`);
  return { ok: true, count: updated.distributionList.length };
}

const DefaultDistributionSchema = z.object({ emails: z.string().max(8000) });

export async function saveDefaultDistributionAction(formData: FormData) {
  const admin = await requireAdmin();
  const meta = await getRequestMeta();
  const parsed = DefaultDistributionSchema.safeParse({ emails: formData.get("emails") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const list = parsed.data.emails.split(/\r?\n/);
  await setDefaultDistributionList(list, { id: admin.id });

  await record({
    actor: { id: admin.id, email: admin.email },
    action: "meeting.distribution.default_update",
    entity: { type: "settings", id: "meetings.default_distribution_list" },
    after: { count: list.filter((s) => s.trim()).length },
    request: meta,
  });

  revalidatePath("/admin/settings");
  return { ok: true };
}

export async function cancelMeetingAction(formData: FormData) {
  const admin = await requireAdmin();
  const meta = await getRequestMeta();
  const parsed = IdSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { error: "Invalid input" };

  const updated = await markCancelled(parsed.data.id);
  if (!updated) return { error: "Meeting not found." };

  await record({
    actor: { id: admin.id, email: admin.email },
    action: "meeting.cancel",
    entity: { type: "meeting", id: parsed.data.id },
    after: { status: updated.status },
    request: meta,
  });

  revalidatePath(`/admin/meetings/${parsed.data.id}`);
  revalidatePath("/admin/meetings");
  return { ok: true };
}
