import Link from "next/link";
import { can, requireCapability } from "@/lib/auth-helpers";
import {
  type RegisterFilters,
  type RegisterRow,
  type ReviewStatus,
  listFilterOptions,
  listRegister,
  versionLabel,
} from "@/lib/document-register";
import { REVIEW_STATUS_LABEL, ReviewBadge, formatIsoDate } from "./format";

export const dynamic = "force-dynamic";

type SearchParams = {
  category?: string;
  type?: string;
  trigger?: string;
  review?: string;
  q?: string;
};

const REVIEW_STATUSES: ReviewStatus[] = ["ok", "due_soon", "overdue"];

export default async function DocumentRegisterPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireCapability("documents.view");
  const sp = await searchParams;
  const filters: RegisterFilters = {
    categoryId: sp.category || undefined,
    typeId: sp.type || undefined,
    triggerId: sp.trigger || undefined,
    reviewStatus: REVIEW_STATUSES.find((s) => s === sp.review),
    q: sp.q || undefined,
  };
  const includeDrafts = can(user, "documents.manage");
  const [rows, options] = await Promise.all([
    listRegister({ includeDrafts, filters }),
    listFilterOptions(),
  ]);
  const filtered = Object.values(filters).some(Boolean);

  return (
    <div className="space-y-4">
      <div>
        <Link href="/registers" className="text-sm text-blue-700 underline">
          ← Company Registers
        </Link>
        <h1 className="mt-1 text-xl font-semibold">Document Register</h1>
        <p className="text-sm text-slate-600">
          Controlled Documents under revision control (IMS Manual §4.2.1).
        </p>
      </div>

      <form
        method="get"
        className="grid gap-2 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-2 lg:grid-cols-6"
      >
        <input
          type="search"
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Search title, Document ID or Legacy ID"
          aria-label="Search title, Document ID or Legacy ID"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm sm:col-span-2"
        />
        <FilterSelect name="category" label="All categories" value={sp.category} options={options.categories} />
        <FilterSelect name="type" label="All types" value={sp.type} options={options.types} />
        <FilterSelect name="trigger" label="Any use" value={sp.trigger} options={options.triggers} />
        <select
          name="review"
          defaultValue={sp.review ?? ""}
          aria-label="Review status"
          className="rounded-md border border-slate-300 bg-white px-2 py-2 text-sm"
        >
          <option value="">Any review status</option>
          {REVIEW_STATUSES.map((s) => (
            <option key={s} value={s}>
              {REVIEW_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-6">
          <button
            type="submit"
            className="rounded-md bg-lime-800 px-4 py-2 text-sm font-medium text-white hover:bg-lime-900"
          >
            Apply
          </button>
          {filtered && (
            <Link href="/registers/documents" className="text-sm text-slate-600 underline">
              Clear
            </Link>
          )}
          <span className="ml-auto text-sm text-slate-500">
            {rows.length} document{rows.length === 1 ? "" : "s"}
          </span>
        </div>
      </form>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white px-4 py-6 text-sm text-slate-600">
          {filtered ? "No documents match these filters." : "No documents in the register yet."}
        </p>
      ) : (
        <>
          <RegisterTable rows={rows} />
          <RegisterCards rows={rows} />
        </>
      )}
    </div>
  );
}

function FilterSelect({
  name,
  label,
  value,
  options,
}: {
  name: string;
  label: string;
  value: string | undefined;
  options: { id: string; code: string; label: string }[];
}) {
  return (
    <select
      name={name}
      defaultValue={value ?? ""}
      aria-label={label}
      className="rounded-md border border-slate-300 bg-white px-2 py-2 text-sm"
    >
      <option value="">{label}</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function VersionCell({ row }: { row: RegisterRow }) {
  if (row.version == null) return <>—</>;
  return (
    <>
      {versionLabel(row.version)}
      {row.versionStatus === "draft" && (
        <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">Draft</span>
      )}
    </>
  );
}

function RegisterTable({ rows }: { rows: RegisterRow[] }) {
  return (
    <div className="hidden overflow-x-auto rounded-lg border border-slate-200 bg-white md:block">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-slate-600">
          <tr>
            <th className="px-3 py-2">Document ID</th>
            <th className="px-3 py-2">Title</th>
            <th className="px-3 py-2">Category</th>
            <th className="px-3 py-2">Type</th>
            <th className="px-3 py-2">Version</th>
            <th className="px-3 py-2">Issued</th>
            <th className="px-3 py-2">Next Review</th>
            <th className="px-3 py-2">When to use</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-slate-100 align-top">
              <td className="px-3 py-2 font-mono whitespace-nowrap">
                <Link href={`/registers/documents/${r.id}`} className="text-blue-700 underline">
                  {r.documentId}
                </Link>
              </td>
              <td className="px-3 py-2">{r.title}</td>
              <td className="px-3 py-2" title={r.categoryLabel}>{r.categoryCode}</td>
              <td className="px-3 py-2" title={r.typeLabel}>{r.typeCode}</td>
              <td className="px-3 py-2 whitespace-nowrap">
                <VersionCell row={r} />
              </td>
              <td className="px-3 py-2 whitespace-nowrap">{formatIsoDate(r.dateIssued)}</td>
              <td className="px-3 py-2 whitespace-nowrap">
                {formatIsoDate(r.nextReviewDate)}{" "}
                <ReviewBadge status={r.reviewStatus} />
              </td>
              <td className="px-3 py-2 text-slate-600">
                {r.triggers.map((t) => t.label).join(", ") || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RegisterCards({ rows }: { rows: RegisterRow[] }) {
  return (
    <ul className="space-y-2 md:hidden">
      {rows.map((r) => (
        <li key={r.id}>
          <Link
            href={`/registers/documents/${r.id}`}
            className="block rounded-lg border border-slate-200 bg-white px-4 py-3 hover:bg-slate-50"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="font-mono text-sm text-blue-700">{r.documentId}</span>
              <span className="shrink-0 text-sm text-slate-600">
                <VersionCell row={r} />
              </span>
            </div>
            <div className="mt-0.5 font-medium">{r.title}</div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
              <span>
                {r.categoryLabel} · {r.typeLabel}
              </span>
              {r.nextReviewDate && <span>Review {formatIsoDate(r.nextReviewDate)}</span>}
              <ReviewBadge status={r.reviewStatus} />
            </div>
            {r.triggers.length > 0 && (
              <div className="mt-1 text-xs text-slate-500">
                When to use: {r.triggers.map((t) => t.label).join(", ")}
              </div>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
