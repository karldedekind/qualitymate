import { BrandedHeader } from "@/components/branded-header";
import { findSignoffTarget } from "@/lib/meetings";
import { SignForm } from "./sign-form";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string; signed?: string }>;
};

export default async function MeetingSignPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  const token = sp.token ?? "";

  const target = token ? await findSignoffTarget(id, token) : null;

  if (!target) {
    return (
      <div className="min-h-screen flex flex-col">
        <BrandedHeader />
        <main className="flex-1 mx-auto max-w-2xl w-full px-4 py-10">
          <h1 className="text-2xl font-semibold mb-2">Invalid link</h1>
          <p className="text-slate-700">
            This signoff link is invalid or expired. Ask the organiser to re-issue it.
          </p>
        </main>
      </div>
    );
  }

  const { meeting, attendee } = target;
  const minutes = meeting.minutes;
  const alreadySigned = meeting.signoffs.some(
    (s) => s.attendeeKey === target.attendeeKey,
  );
  const locked = meeting.status === "approved";

  return (
    <div className="min-h-screen flex flex-col">
      <BrandedHeader />
      <main className="flex-1 mx-auto max-w-3xl w-full px-4 py-6 space-y-4">
        <h1 className="text-2xl font-semibold">Sign off minutes — {meeting.title}</h1>
        <p className="text-sm text-slate-600">
          Hi <span className="font-medium">{attendee.name}</span>. Review the draft minutes
          below and confirm.
        </p>

        {!minutes && (
          <p className="text-sm text-amber-700">
            Minutes are not drafted yet. Please come back later.
          </p>
        )}

        {minutes && (
          <section className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm space-y-3 text-sm">
            <Block title="Attendees">
              <ul>{minutes.attendees.map((a, i) => <li key={i}>· {a}</li>)}</ul>
            </Block>
            {minutes.apologies.length > 0 && (
              <Block title="Apologies">
                <ul>{minutes.apologies.map((a, i) => <li key={i}>· {a}</li>)}</ul>
              </Block>
            )}
            <Block title="Decisions">
              <ul>{minutes.decisions.map((d, i) => <li key={i}>· {d}</li>)}</ul>
            </Block>
            {minutes.followUps.length > 0 && (
              <Block title="Follow-ups">
                <ul>{minutes.followUps.map((d, i) => <li key={i}>· {d}</li>)}</ul>
              </Block>
            )}
            <Block title="Notes">
              <p className="whitespace-pre-wrap">{minutes.notes}</p>
            </Block>
          </section>
        )}

        {locked && (
          <p className="text-sm text-slate-600">Meeting already approved — signoffs closed.</p>
        )}

        {!locked && minutes && (
          <SignForm meetingId={meeting.id} token={token} alreadySigned={alreadySigned} />
        )}
      </main>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="font-medium mb-1">{title}</h2>
      <div className="text-slate-800">{children}</div>
    </div>
  );
}
