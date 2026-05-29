import Link from "next/link";
import { listAll, type Meeting } from "@/lib/meetings";

export const dynamic = "force-dynamic";

function fmt(d: Date) {
  return d.toISOString().slice(0, 16).replace("T", " ");
}

type Step = { label: string; done: boolean };

function buildSteps(m: Meeting): Step[] {
  const allSigned =
    m.attendees.length > 0 &&
    m.signoffs.length >= m.attendees.length &&
    m.attendees.every((att) => {
      const key = att.email
        ? att.email.toLowerCase()
        : `name:${att.name.toLowerCase()}`;
      return m.signoffs.some((s) => s.attendeeKey === key);
    });

  return [
    { label: "Scheduled", done: true },
    { label: "Pre-pack", done: m.pack != null },
    { label: "Completed", done: m.status === "completed" || m.status === "approved" },
    { label: "Minutes", done: m.minutes != null },
    { label: "Signoffs", done: allSigned },
    { label: "Approved", done: m.status === "approved" },
  ];
}

function Stepper({ steps }: { steps: Step[] }) {
  const currentIdx = steps.findIndex((s) => !s.done);

  return (
    <ol className="flex items-center gap-0 mt-3 flex-wrap">
      {steps.map((step, i) => {
        const isCurrent = i === currentIdx;
        const isDone = step.done;

        return (
          <li key={step.label} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border-2 ${
                  isDone
                    ? "bg-green-600 border-green-600 text-white"
                    : isCurrent
                      ? "bg-blue-700 border-blue-700 text-white"
                      : "bg-white border-slate-300 text-slate-400"
                }`}
              >
                {isDone ? "✓" : i + 1}
              </div>
              <span
                className={`text-[10px] mt-0.5 whitespace-nowrap ${
                  isDone
                    ? "text-green-700"
                    : isCurrent
                      ? "text-blue-700 font-medium"
                      : "text-slate-400"
                }`}
              >
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={`h-0.5 w-6 mx-0.5 mb-3 ${
                  steps[i + 1]?.done || i + 1 === currentIdx
                    ? "bg-green-400"
                    : "bg-slate-200"
                }`}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

export default async function AdminMeetingsPage() {
  const rows = await listAll();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Meetings</h1>
        <Link
          href="/admin/meetings/new"
          className="rounded-md bg-blue-700 text-white px-3 py-1.5 text-sm font-medium"
        >
          Schedule meeting
        </Link>
      </div>

      {rows.length === 0 && <p className="text-sm text-slate-600">No meetings scheduled.</p>}

      <ul className="space-y-3">
        {rows.map((m) => {
          const cancelled = m.status === "cancelled";
          const steps = buildSteps(m);

          return (
            <li
              key={m.id}
              className={`bg-white border rounded-lg p-4 shadow-sm ${
                cancelled ? "border-slate-100 opacity-60" : "border-slate-200"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/admin/meetings/${m.id}`}
                      className="font-medium hover:underline"
                    >
                      {m.title}
                    </Link>
                    {cancelled && (
                      <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                        Cancelled
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap gap-x-3">
                    <span className="font-mono">{fmt(m.scheduledAt)}</span>
                    {m.location && <span>at {m.location}</span>}
                    <span>{m.attendees.length} attendee{m.attendees.length !== 1 ? "s" : ""}</span>
                  </div>

                  {!cancelled && <Stepper steps={steps} />}
                </div>

                <Link
                  href={`/admin/meetings/${m.id}`}
                  className="text-xs text-blue-700 hover:underline shrink-0"
                >
                  Open →
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
