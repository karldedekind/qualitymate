"use client";

import { useState } from "react";
import type { MeetingMinutes, MeetingPack } from "@/db/schema";
import type { QuarterSnapshot } from "@/lib/meetings";
import {
  approveMeetingAction,
  cancelMeetingAction,
  completeMeetingAction,
  draftMinutesAction,
  generatePackAction,
  issueSignoffsAction,
  saveManualMinutesAction,
  saveManualPackAction,
  saveMeetingDistributionAction,
} from "../actions";

export function PackEditor({
  id,
  aiAvailable,
  pack,
  snapshot,
}: {
  id: string;
  aiAvailable: boolean;
  pack: MeetingPack | null;
  snapshot: QuarterSnapshot;
}) {
  const [summary, setSummary] = useState(pack?.summary ?? "");
  const [agenda, setAgenda] = useState((pack?.agenda ?? []).join("\n"));
  const [trends, setTrends] = useState(pack?.trends ?? "");
  const [pending, setPending] = useState(false);
  const [aiPending, setAiPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function onAi() {
    setAiPending(true);
    setError(null);
    setOk(false);
    const fd = new FormData();
    fd.append("id", id);
    const result = await generatePackAction(fd);
    setAiPending(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    // Reload page to pull persisted pack
    if (typeof window !== "undefined") window.location.reload();
  }

  async function onSave(formData: FormData) {
    setPending(true);
    setError(null);
    setOk(false);
    formData.append("id", id);
    const result = await saveManualPackAction(formData);
    setPending(false);
    if (result?.error) setError(result.error);
    else setOk(true);
  }

  return (
    <section className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm space-y-3">
      <header className="flex items-center justify-between">
        <h2 className="text-base font-medium">Pre-pack</h2>
        <div className="flex items-center gap-2">
          {pack && (
            <span className="text-xs text-slate-500">
              {pack.generatedBy} · {pack.generatedAt.slice(0, 16).replace("T", " ")}
            </span>
          )}
          {aiAvailable && (
            <button
              type="button"
              onClick={onAi}
              disabled={aiPending}
              className="rounded-md bg-purple-700 text-white px-3 py-1.5 text-xs font-medium disabled:opacity-50"
            >
              {aiPending ? "Drafting…" : "Generate with AI"}
            </button>
          )}
        </div>
      </header>

      <details className="rounded-md border border-slate-200 bg-slate-50 text-sm">
        <summary className="cursor-pointer px-3 py-2 font-medium text-slate-700 select-none">
          Quarter context — {snapshot.incidents.length} incidents · {snapshot.actions.length} actions
          <span className="ml-1 text-xs font-normal text-slate-500">
            (since {snapshot.since.toISOString().slice(0, 10)}) · click to expand
          </span>
        </summary>
        <div className="px-3 pb-3 pt-1 text-xs text-slate-600">
          <p className="mb-2 text-slate-500">
            Reference data for the 90-day window leading up to this meeting. Use it to inform your summary, agenda, and trends — it is not included in the saved pack.
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <div className="font-medium mb-1">Incidents ({snapshot.incidents.length})</div>
              <ul className="space-y-0.5">
                {snapshot.incidents.map((i) => (
                  <li key={i.id} className="truncate">[{i.status}] {i.title}</li>
                ))}
                {snapshot.incidents.length === 0 && <li className="text-slate-400">None</li>}
              </ul>
            </div>
            <div>
              <div className="font-medium mb-1">Corrective actions ({snapshot.actions.length})</div>
              <ul className="space-y-0.5">
                {snapshot.actions.map((a) => (
                  <li key={a.id} className="truncate">[{a.status}] {a.title}</li>
                ))}
                {snapshot.actions.length === 0 && <li className="text-slate-400">None</li>}
              </ul>
            </div>
          </div>
        </div>
      </details>

      <form action={onSave} className="space-y-3">
        <label className="block">
          <span className="text-sm text-slate-700 mb-1 block">Summary</span>
          <textarea
            name="summary"
            rows={4}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            maxLength={8000}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-sm text-slate-700 mb-1 block">Agenda (one item per line)</span>
          <textarea
            name="agenda"
            rows={5}
            value={agenda}
            onChange={(e) => setAgenda(e.target.value)}
            maxLength={4000}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-sm text-slate-700 mb-1 block">Trends</span>
          <textarea
            name="trends"
            rows={4}
            value={trends}
            onChange={(e) => setTrends(e.target.value)}
            maxLength={8000}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {ok && <p className="text-sm text-green-700">Saved.</p>}

        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-blue-700 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save pack"}
        </button>
      </form>
    </section>
  );
}

export function MinutesEditor({
  id,
  aiAvailable,
  attendees,
  minutes,
  hasPack,
  locked = false,
}: {
  id: string;
  aiAvailable: boolean;
  attendees: string[];
  minutes: MeetingMinutes | null;
  hasPack: boolean;
  locked?: boolean;
}) {
  const [rawNotes, setRawNotes] = useState("");
  const [att, setAtt] = useState((minutes?.attendees ?? attendees).join("\n"));
  const [apologies, setApologies] = useState((minutes?.apologies ?? []).join("\n"));
  const [decisions, setDecisions] = useState((minutes?.decisions ?? []).join("\n"));
  const [followUps, setFollowUps] = useState((minutes?.followUps ?? []).join("\n"));
  const [notes, setNotes] = useState(minutes?.notes ?? "");
  const [pending, setPending] = useState(false);
  const [aiPending, setAiPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function onAi() {
    setAiPending(true);
    setError(null);
    setOk(false);
    const fd = new FormData();
    fd.append("id", id);
    fd.append("rawNotes", rawNotes);
    const result = await draftMinutesAction(fd);
    setAiPending(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    if (typeof window !== "undefined") window.location.reload();
  }

  async function onSave(formData: FormData) {
    setPending(true);
    setError(null);
    setOk(false);
    formData.append("id", id);
    const result = await saveManualMinutesAction(formData);
    setPending(false);
    if (result?.error) setError(result.error);
    else setOk(true);
  }

  return (
    <section className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm space-y-3">
      <header className="flex items-center justify-between">
        <h2 className="text-base font-medium">Minutes {locked ? "(locked)" : ""}</h2>
        <div className="flex items-center gap-2">
          {minutes && (
            <span className="text-xs text-slate-500">
              {minutes.generatedBy} · {minutes.generatedAt.slice(0, 16).replace("T", " ")}
            </span>
          )}
        </div>
      </header>

      {locked && (
        <p className="text-sm text-slate-600">
          Approved meeting — minutes are read-only.
        </p>
      )}

      {!locked && aiAvailable && (
        <div className="rounded-md border border-purple-200 bg-purple-50 p-3 space-y-2">
          <label className="block text-sm">
            <span className="text-purple-800 font-medium mb-1 block">Raw facilitator notes</span>
            <textarea
              rows={4}
              value={rawNotes}
              onChange={(e) => setRawNotes(e.target.value)}
              maxLength={8000}
              placeholder="Paste rough notes from the meeting; AI structures them."
              className="w-full rounded-md border border-purple-300 px-3 py-2 text-sm"
            />
          </label>
          <button
            type="button"
            onClick={onAi}
            disabled={aiPending}
            className="rounded-md bg-purple-700 text-white px-3 py-1.5 text-xs font-medium disabled:opacity-50"
          >
            {aiPending ? "Drafting…" : "Draft minutes with AI"}
          </button>
          {!hasPack && (
            <p className="text-xs text-purple-700">
              Tip: generating a pack first gives the model more context.
            </p>
          )}
        </div>
      )}

      <form action={onSave} className="space-y-3">
        <fieldset disabled={locked} className={locked ? "opacity-60" : ""}>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm text-slate-700 mb-1 block">Attendees (one per line)</span>
            <textarea
              name="attendees"
              rows={4}
              value={att}
              onChange={(e) => setAtt(e.target.value)}
              maxLength={4000}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-sm text-slate-700 mb-1 block">Apologies (one per line)</span>
            <textarea
              name="apologies"
              rows={4}
              value={apologies}
              onChange={(e) => setApologies(e.target.value)}
              maxLength={4000}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
        </div>
        <label className="block">
          <span className="text-sm text-slate-700 mb-1 block">Decisions (one per line)</span>
          <textarea
            name="decisions"
            rows={4}
            value={decisions}
            onChange={(e) => setDecisions(e.target.value)}
            maxLength={8000}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-sm text-slate-700 mb-1 block">Follow-ups (one per line)</span>
          <textarea
            name="followUps"
            rows={4}
            value={followUps}
            onChange={(e) => setFollowUps(e.target.value)}
            maxLength={8000}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-sm text-slate-700 mb-1 block">Notes</span>
          <textarea
            name="notes"
            rows={6}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={16000}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {ok && <p className="text-sm text-green-700">Saved.</p>}

        <button
          type="submit"
          disabled={pending || locked}
          className="rounded-md bg-blue-700 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save minutes"}
        </button>
        </fieldset>
      </form>
    </section>
  );
}

export function SignoffPanel({
  id,
  attendees,
  signoffs,
  status,
  hasMinutes,
  isDirector,
  initialLinks = null,
}: {
  id: string;
  attendees: { name: string; email: string | null }[];
  signoffs: { attendeeKey: string; name: string; signedAt: string; ip: string | null }[];
  status: "scheduled" | "completed" | "cancelled" | "approved";
  hasMinutes: boolean;
  isDirector: boolean;
  initialLinks?: { name: string; email: string | null; url: string }[] | null;
}) {
  const [links, setLinks] = useState<typeof initialLinks>(initialLinks);
  const [pending, setPending] = useState<"issue" | "approve" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onIssue() {
    setPending("issue");
    setError(null);
    const fd = new FormData();
    fd.append("id", id);
    const result = await issueSignoffsAction(fd);
    setPending(null);
    if (result?.error) setError(result.error);
    else if (result?.links) setLinks(result.links);
  }

  async function onApprove() {
    setPending("approve");
    setError(null);
    const fd = new FormData();
    fd.append("id", id);
    const result = await approveMeetingAction(fd);
    setPending(null);
    if (result?.error) setError(result.error);
    else if (typeof window !== "undefined") window.location.reload();
  }

  const signedKeys = new Set(signoffs.map((s) => s.attendeeKey));
  const allSigned =
    attendees.length > 0 &&
    attendees.every((a) => {
      const key = a.email ? a.email.toLowerCase() : `name:${a.name.toLowerCase()}`;
      return signedKeys.has(key);
    });

  return (
    <section className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm space-y-3">
      <h2 className="text-base font-medium">Signoffs &amp; approval</h2>

      {!hasMinutes && (
        <p className="text-sm text-red-600">Draft minutes before issuing signoff links.</p>
      )}

      {hasMinutes && status !== "approved" && (
        <button
          type="button"
          onClick={onIssue}
          disabled={pending !== null}
          className="rounded-md bg-blue-700 text-white px-3 py-1.5 text-sm font-medium disabled:opacity-50"
        >
          {pending === "issue" ? "Issuing…" : "Issue signoff links"}
        </button>
      )}

      {links !== null && links.length === 0 && (
        <p className="text-sm text-slate-600">All attendees have already signed — no new links needed.</p>
      )}
      {links && links.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm space-y-1">
          <p className="font-medium text-amber-800">
            Tokens shown once. Copy now — they will not be displayed again.
          </p>
          <ul className="space-y-1">
            {links.map((l, i) => (
              <li key={i} className="font-mono text-xs break-all">
                {l.name}
                {l.email ? ` <${l.email}>` : ""}: {l.url}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h3 className="text-sm font-medium mb-1">Attendee signoffs</h3>
        {attendees.length === 0 && (
          <p className="text-xs text-slate-500">No attendees on this meeting.</p>
        )}
        <ul className="text-sm space-y-0.5">
          {attendees.map((a, i) => {
            const key = a.email ? a.email.toLowerCase() : `name:${a.name.toLowerCase()}`;
            const signed = signoffs.find((s) => s.attendeeKey === key);
            return (
              <li key={i} className="flex items-center justify-between gap-3">
                <span>{a.name}{a.email ? ` <${a.email}>` : ""}</span>
                {signed ? (
                  <span className="text-xs text-green-700 font-mono">
                    ✓ {signed.signedAt.slice(0, 16).replace("T", " ")}
                    {signed.ip ? ` from ${signed.ip}` : ""}
                  </span>
                ) : (
                  <span className="text-xs text-slate-500">awaiting</span>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {status === "approved" && (
        <p className="text-sm text-green-700">
          Approved — minutes are locked from further edits.
        </p>
      )}

      {status !== "approved" && hasMinutes && (
        <div className="pt-2 border-t border-slate-200">
          <h3 className="text-sm font-medium mb-1">Director approval</h3>
          {!isDirector && (
            <p className="text-xs text-slate-600">
              Only the management representative can approve. Set the named admin in Settings.
            </p>
          )}
          {isDirector && !allSigned && (
            <p className="text-xs text-amber-700">
              Awaiting all attendee signoffs before approval is allowed.
            </p>
          )}
          {isDirector && allSigned && (
            <button
              type="button"
              onClick={onApprove}
              disabled={pending !== null}
              className="mt-1 rounded-md bg-green-700 text-white px-3 py-1.5 text-sm font-medium disabled:opacity-50"
            >
              {pending === "approve" ? "Approving…" : "Approve & lock"}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

export function DistributionEditor({
  id,
  emails,
  defaultList,
  locked,
}: {
  id: string;
  emails: string[];
  defaultList: string[];
  locked: boolean;
}) {
  const [value, setValue] = useState(emails.join("\n"));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState<number | null>(null);

  async function onSave(formData: FormData) {
    setPending(true);
    setError(null);
    setSavedCount(null);
    formData.append("id", id);
    formData.set("emails", value);
    const result = await saveMeetingDistributionAction(formData);
    setPending(false);
    if (result?.error) setError(result.error);
    else if (typeof result?.count === "number") setSavedCount(result.count);
  }

  return (
    <section className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm space-y-3">
      <header>
        <h2 className="text-base font-medium">Distribution list</h2>
        <p className="text-xs text-slate-600">
          When approved, minutes are emailed to: meeting attendees (with email addresses) +
          the extra recipients below + the default list from Settings.
        </p>
      </header>

      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 space-y-1">
        <p className="font-medium text-slate-700">Always included (from Settings)</p>
        {defaultList.length > 0 ? (
          <ul className="space-y-0.5">
            {defaultList.map((e, i) => <li key={i} className="font-mono">{e}</li>)}
          </ul>
        ) : (
          <p className="text-slate-400 italic">No default recipients configured in Settings.</p>
        )}
      </div>

      <form action={onSave} className="space-y-2">
        <label className="block">
          <span className="text-sm text-slate-700 mb-1 block">
            Extra recipients for this meeting
          </span>
          <textarea
            rows={4}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={8000}
            disabled={locked}
            placeholder={"one per line — plain email or Name <email>"}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {savedCount !== null && (
          <p className="text-sm text-green-700">Saved {savedCount} address(es).</p>
        )}
        {!locked && (
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-blue-700 text-white px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save"}
          </button>
        )}
        {locked && (
          <p className="text-xs text-slate-500">Approved — distribution list locked.</p>
        )}
      </form>
    </section>
  );
}

export function CompleteCancelButtons({
  id,
  status,
}: {
  id: string;
  status: "scheduled" | "completed" | "cancelled" | "approved";
}) {
  const [pending, setPending] = useState<"complete" | "cancel" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onAct(action: "complete" | "cancel") {
    if (action === "cancel" && !confirm("Cancel this meeting?")) return;
    setPending(action);
    setError(null);
    const fd = new FormData();
    fd.append("id", id);
    const result =
      action === "complete"
        ? await completeMeetingAction(fd)
        : await cancelMeetingAction(fd);
    setPending(null);
    if (result?.error) setError(result.error);
  }

  if (status !== "scheduled") {
    return (
      <p className="text-sm text-slate-600">
        Meeting is {status}.
      </p>
    );
  }

  return (
    <section className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm flex flex-wrap gap-3 items-center">
      <button
        type="button"
        onClick={() => onAct("complete")}
        disabled={pending !== null}
        className="rounded-md bg-green-700 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
      >
        {pending === "complete" ? "Saving…" : "Mark completed"}
      </button>
      <button
        type="button"
        onClick={() => onAct("cancel")}
        disabled={pending !== null}
        className="rounded-md bg-slate-200 text-slate-800 px-4 py-2 text-sm font-medium disabled:opacity-50"
      >
        {pending === "cancel" ? "Saving…" : "Cancel"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </section>
  );
}
