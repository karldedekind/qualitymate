import Link from "next/link";
import { notFound } from "next/navigation";
import { isConfigured as isAiConfigured } from "@/lib/ai";
import { requireAdmin } from "@/lib/auth-helpers";
import {
  findById,
  getDefaultDistributionList,
  getDirectorUserId,
  getQuarterSnapshot,
  type QuarterSnapshot,
} from "@/lib/meetings";
import {
  CompleteCancelButtons,
  DistributionEditor,
  MinutesEditor,
  PackEditor,
  SignoffPanel,
} from "./editors";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  scheduled: "Scheduled",
  completed: "Completed",
  cancelled: "Cancelled",
  approved: "Approved",
};

type Props = { params: Promise<{ id: string }> };

export default async function MeetingDetailPage({ params }: Props) {
  const admin = await requireAdmin();
  const { id } = await params;
  const meeting = await findById(id);
  if (!meeting) notFound();

  const [aiAvailable, directorId, defaultList, snapshot] = await Promise.all([
    isAiConfigured(),
    getDirectorUserId(),
    getDefaultDistributionList(),
    getQuarterSnapshot(),
  ]);
  const isDirector = directorId != null && directorId === admin.id;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/meetings" className="text-sm text-blue-700 hover:underline">
          ← Meetings
        </Link>
        <h1 className="text-2xl font-semibold mt-2">{meeting.title}</h1>
        <div className="text-sm text-slate-600">
          {meeting.scheduledAt.toISOString()} ·{" "}
          {STATUS_LABEL[meeting.status] ?? meeting.status}
          {meeting.location ? ` · ${meeting.location}` : ""}
        </div>
        {meeting.attendees.length > 0 && (
          <div className="text-sm text-slate-600 mt-1">
            Attendees:{" "}
            {meeting.attendees
              .map((a) => (a.email ? `${a.name} <${a.email}>` : a.name))
              .join(", ")}
          </div>
        )}
      </div>

      <PackEditor
        id={meeting.id}
        aiAvailable={aiAvailable}
        pack={meeting.pack}
        snapshot={snapshot}
      />

      <MinutesEditor
        id={meeting.id}
        aiAvailable={aiAvailable}
        attendees={meeting.attendees.map((a) => a.name)}
        minutes={meeting.minutes}
        hasPack={meeting.pack != null}
        locked={meeting.status !== "completed"}
      />

      <DistributionEditor
        id={meeting.id}
        emails={meeting.distributionList}
        defaultList={defaultList}
        locked={meeting.status !== "completed"}
      />

      <SignoffPanel
        id={meeting.id}
        attendees={meeting.attendees.map((a) => ({ name: a.name, email: a.email ?? null }))}
        signoffs={meeting.signoffs.map((s) => ({
          attendeeKey: s.attendeeKey,
          name: s.name,
          signedAt: s.signedAt,
          ip: s.ip,
        }))}
        status={meeting.status}
        hasMinutes={meeting.minutes != null}
        isDirector={isDirector}
      />

      {meeting.distributedAt && (
        <p className="text-xs text-slate-500">
          Minutes distributed at {meeting.distributedAt.toISOString()}.
        </p>
      )}

      <CompleteCancelButtons id={meeting.id} status={meeting.status} />
    </div>
  );
}
