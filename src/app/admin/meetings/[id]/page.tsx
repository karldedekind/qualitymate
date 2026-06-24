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
  CancelControl,
  DistributionEditor,
  MinutesEditor,
  NextStepBanner,
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

type MeetingStatus = "scheduled" | "completed" | "cancelled" | "approved";
type SectionState = "done" | "active" | "upcoming";

const STEPS = [
  { key: "prepare", label: "Prepare" },
  { key: "minutes", label: "Minutes" },
  { key: "signoff", label: "Sign-off" },
  { key: "approved", label: "Approved" },
] as const;

/** Index of the active step (0–3); 4 once approved (all steps done). */
function activeStepIndex(status: MeetingStatus, hasMinutes: boolean): number {
  if (status === "approved") return 4;
  if (status === "scheduled") return 0;
  if (status === "completed" && !hasMinutes) return 1;
  return 2; // completed + minutes → sign-off
}

function Stepper({ activeIndex, cancelled }: { activeIndex: number; cancelled: boolean }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {STEPS.map((s, i) => {
        const state: SectionState | "cancelled" = cancelled
          ? "cancelled"
          : i < activeIndex
            ? "done"
            : i === activeIndex
              ? "active"
              : "upcoming";
        const badge =
          state === "done"
            ? "bg-green-600 text-white"
            : state === "active"
              ? "bg-blue-600 text-white"
              : "bg-slate-200 text-slate-500";
        const label =
          state === "active"
            ? "text-slate-900 font-medium"
            : state === "done"
              ? "text-slate-600"
              : "text-slate-400";
        return (
          <li key={s.key} className="flex items-center gap-2">
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ${badge}`}
            >
              {state === "done" ? "✓" : i + 1}
            </span>
            <span className={`text-sm ${label}`}>{s.label}</span>
            {i < STEPS.length - 1 && <span className="text-slate-300 px-1">→</span>}
          </li>
        );
      })}
    </ol>
  );
}

function StageSection({
  title,
  state,
  summary,
  lockedHint,
  children,
}: {
  title: string;
  state: SectionState;
  summary?: string;
  lockedHint?: string;
  children: React.ReactNode;
}) {
  if (state === "upcoming") {
    return (
      <section className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500 flex items-center gap-2">
        <span aria-hidden>🔒</span>
        <span>
          <span className="font-medium text-slate-600">{title}</span> —{" "}
          {lockedHint ?? "available at a later step"}.
        </span>
      </section>
    );
  }
  if (state === "done") {
    return (
      <details className="group">
        <summary className="cursor-pointer select-none flex items-center gap-2 text-sm font-medium text-slate-700 px-1 py-1">
          <span className="text-green-600">✓</span>
          {title}
          {summary && <span className="font-normal text-slate-500">— {summary}</span>}
          <span className="ml-auto text-xs text-slate-400 group-open:hidden">view</span>
          <span className="ml-auto text-xs text-slate-400 hidden group-open:inline">hide</span>
        </summary>
        <div className="mt-2">{children}</div>
      </details>
    );
  }
  return <>{children}</>;
}

function sectionState(
  section: "prepare" | "minutes" | "distribution" | "signoff",
  status: MeetingStatus,
  hasMinutes: boolean,
): SectionState {
  if (status === "cancelled" || status === "approved") return "done";
  switch (section) {
    case "prepare":
      return status === "scheduled" ? "active" : "done";
    case "minutes":
      if (status === "scheduled") return "upcoming";
      return hasMinutes ? "done" : "active";
    case "distribution":
      return status === "scheduled" ? "upcoming" : "active";
    case "signoff":
      if (status === "scheduled" || !hasMinutes) return "upcoming";
      return "active";
  }
}

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

  const status = meeting.status as MeetingStatus;
  const hasPack = meeting.pack != null;
  const hasMinutes = meeting.minutes != null;
  const cancelled = status === "cancelled";

  const signedKeys = new Set(meeting.signoffs.map((s) => s.attendeeKey));
  const allSigned =
    meeting.attendees.length > 0 &&
    meeting.attendees.every((a) => {
      const key = a.email ? a.email.toLowerCase() : `name:${a.name.toLowerCase()}`;
      return signedKeys.has(key);
    });

  const signedCount = meeting.attendees.filter((a) => {
    const key = a.email ? a.email.toLowerCase() : `name:${a.name.toLowerCase()}`;
    return signedKeys.has(key);
  }).length;

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

      <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <Stepper activeIndex={activeStepIndex(status, hasMinutes)} cancelled={cancelled} />
      </div>

      <NextStepBanner
        id={meeting.id}
        status={status}
        hasPack={hasPack}
        hasMinutes={hasMinutes}
        allSigned={allSigned}
        isDirector={isDirector}
        distributed={meeting.distributedAt != null}
      />

      <StageSection
        title="Pre-pack"
        state={sectionState("prepare", status, hasMinutes)}
        summary={hasPack ? "prepared" : "not prepared"}
      >
        <PackEditor
          id={meeting.id}
          aiAvailable={aiAvailable}
          pack={meeting.pack}
          snapshot={snapshot}
        />
      </StageSection>

      <StageSection
        title="Minutes"
        state={sectionState("minutes", status, hasMinutes)}
        summary={hasMinutes ? "recorded" : undefined}
        lockedHint="available once the meeting is marked as held"
      >
        <MinutesEditor
          id={meeting.id}
          aiAvailable={aiAvailable}
          attendees={meeting.attendees.map((a) => a.name)}
          minutes={meeting.minutes}
          hasPack={hasPack}
          locked={status !== "completed"}
        />
      </StageSection>

      <StageSection
        title="Distribution list"
        state={sectionState("distribution", status, hasMinutes)}
        summary={`${meeting.distributionList.length} extra recipient(s)`}
        lockedHint="available once the meeting is marked as held"
      >
        <DistributionEditor
          id={meeting.id}
          emails={meeting.distributionList}
          defaultList={defaultList}
          locked={status !== "completed"}
        />
      </StageSection>

      <StageSection
        title="Sign-off & approval"
        state={sectionState("signoff", status, hasMinutes)}
        summary={
          meeting.attendees.length > 0
            ? `${signedCount}/${meeting.attendees.length} signed`
            : undefined
        }
        lockedHint="available once minutes are recorded"
      >
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
          hasMinutes={hasMinutes}
          isDirector={isDirector}
        />
      </StageSection>

      {meeting.distributedAt && (
        <p className="text-xs text-slate-500">
          Minutes distributed at {meeting.distributedAt.toISOString()}.
        </p>
      )}

      <CancelControl id={meeting.id} status={status} />
    </div>
  );
}
