import Link from "next/link";
import { notFound } from "next/navigation";
import { can, requireCapability } from "@/lib/auth-helpers";
import {
  type HistoryEntry,
  findDocument,
  listVersionHistory,
  reviewStatus,
  todayIso,
  versionLabel,
} from "@/lib/document-register";
import {
  ReviewBadge,
  VERSION_STATUS_CLASS,
  VERSION_STATUS_LABEL,
  formatIsoDate,
} from "../format";

export const dynamic = "force-dynamic";

const OUTCOME_LABEL = { no_change: "No change", changes_needed: "Changes needed" } as const;

export default async function ControlledDocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireCapability("documents.view");
  const { id } = await params;
  const includeDrafts = can(user, "documents.manage");
  const doc = await findDocument(id, { includeDrafts });
  if (!doc) notFound();
  const history = can(user, "documents.history")
    ? await listVersionHistory(id, { includeDrafts })
    : null;
  const current = doc.current;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/registers/documents" className="text-sm text-blue-700 underline">
          ← Document Register
        </Link>
        <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-lime-800">
          {doc.type.label} · {doc.category.label}
        </p>
        <h1 className="text-xl font-semibold">{doc.title}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
          <span className="font-mono">{doc.documentId}</span>
          {current && <span className="text-slate-500">{versionLabel(current.version)}</span>}
          {current && <ReviewBadge status={reviewStatus(current.nextReviewDate, todayIso())} />}
        </div>
      </div>

      {doc.draft && (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          {versionLabel(doc.draft.version)} is in draft and not yet issued.
          {!current && " Only admins can see this document until it is issued."}
        </div>
      )}

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <Field label="Document ID">
            <span className="font-mono">{doc.documentId}</span>
          </Field>
          <Field label="Version">{current ? versionLabel(current.version) : "Not issued"}</Field>
          <Field label="Date issued">{formatIsoDate(current?.dateIssued ?? null)}</Field>
          <Field label="Next review">{formatIsoDate(current?.nextReviewDate ?? null)}</Field>
          <Field label="Approved by">{current?.approvedByName ?? "—"}</Field>
          <Field label="Category">
            {doc.category.label} ({doc.category.code})
          </Field>
          <Field label="Type">
            {doc.type.label} ({doc.type.code})
          </Field>
          <Field label="When to use">
            {doc.triggers.map((t) => t.label).join(", ") || "—"}
          </Field>
          <Field label="Legacy IDs" wide>
            {doc.legacyIds.length === 0 ? (
              "—"
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {doc.legacyIds.map((l) => (
                  <li
                    key={l.legacyId}
                    className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs"
                    title={l.source ?? undefined}
                  >
                    {l.legacyId}
                  </li>
                ))}
              </ul>
            )}
          </Field>
          {doc.notes && (
            <Field label="Notes" wide>
              <span className="whitespace-pre-wrap">{doc.notes}</span>
            </Field>
          )}
        </dl>
      </section>

      {history && <VersionHistory entries={history} />}
    </div>
  );
}

function Field({
  label,
  wide,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

function VersionHistory({ entries }: { entries: HistoryEntry[] }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Version history
      </h2>
      {entries.length === 0 ? (
        <p className="text-sm text-slate-600">No Versions yet.</p>
      ) : (
        <ol className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
          {entries.map((v) => (
            <li key={v.id} className="px-4 py-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{versionLabel(v.version)}</span>
                <span className={`rounded px-2 py-0.5 text-xs ${VERSION_STATUS_CLASS[v.status]}`}>
                  {VERSION_STATUS_LABEL[v.status]}
                </span>
              </div>
              {v.status !== "draft" && (
                <p className="mt-1 text-slate-600">
                  Issued {formatIsoDate(v.dateIssued)}
                  {v.approvedByName && <> · Approved by {v.approvedByName}</>}
                  {v.archiveDate && <> · Archived {formatIsoDate(v.archiveDate)}</>}
                </p>
              )}
              {v.reviews.length > 0 && (
                <ul className="mt-2 space-y-1 border-l-2 border-lime-200 pl-3">
                  {v.reviews.map((r) => (
                    <li key={r.id} className="text-slate-600">
                      Reviewed {formatIsoDate(r.reviewedOn)} by {r.reviewerName}:{" "}
                      <span className="font-medium text-slate-800">{OUTCOME_LABEL[r.outcome]}</span>
                      {r.notes && <span className="block text-xs text-slate-500">{r.notes}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
