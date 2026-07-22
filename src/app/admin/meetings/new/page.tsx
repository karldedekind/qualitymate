import Link from "next/link";
import { ScheduleMeetingForm } from "./schedule-form";
import { requireCapability } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

export default async function NewMeetingPage() {
  await requireCapability("meetings.manage");
  return (
    <div className="space-y-4 max-w-2xl">
      <Link href="/admin/meetings" className="text-sm text-blue-700 hover:underline">
        ← Meetings
      </Link>
      <h1 className="text-2xl font-semibold">Schedule meeting</h1>
      <section className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
        <ScheduleMeetingForm />
      </section>
    </div>
  );
}
