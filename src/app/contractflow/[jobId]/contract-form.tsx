"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { updateJobContractAction, uploadJobContractFileAction } from "../actions";

type Initial = {
  principalName: string;
  principalTradingAs: string;
  principalRepName: string;
  principalRepPhone: string;
  principalRepEmail: string;
  contractDateForPc: string;
  contractSumDollars: string;
  dayBasis: string;
};

export type ContractSourceFile = {
  id: string;
  kind: "loa" | "po" | "sr_rep" | "conditions";
  path: string;
  originalFilename: string;
};

const FIELDS: { name: keyof Initial; label: string; type?: string }[] = [
  { name: "principalName", label: "Owner / Principal" },
  { name: "principalTradingAs", label: "Project managers" },
  { name: "principalRepName", label: "Principal's representative" },
  { name: "principalRepPhone", label: "Rep phone" },
  { name: "principalRepEmail", label: "Rep email", type: "email" },
  { name: "contractDateForPc", label: "Contract Date for Practical Completion", type: "date" },
];

/** "$123,456.78" for display; empty stays empty, unparsable input shown as typed. */
function formatSum(raw: string): string {
  if (raw.trim() === "") return "";
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  return n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });
}

const SOURCE_DOCS: { kind: ContractSourceFile["kind"]; label: string; hint: string }[] = [
  { kind: "loa", label: "Letter of Acceptance (LOA)", hint: "PDF or photo." },
  { kind: "po", label: "Purchase Order (PO)", hint: "PDF or photo." },
  { kind: "sr_rep", label: "Representative document", hint: "Principal's / Superintendent's rep appointment. PDF or photo." },
  { kind: "conditions", label: "Conditions of Contract", hint: "General/special conditions. PDF or photo." },
];

export function ContractForm({
  jobId,
  initial,
  files,
}: {
  jobId: string;
  initial: Initial;
  files: ContractSourceFile[];
}) {
  const router = useRouter();
  const [values, setValues] = useState<Initial>(initial);
  const [sumFocused, setSumFocused] = useState(false);
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function set(name: keyof Initial, value: string) {
    setValues((v) => ({ ...v, [name]: value }));
  }

  // Plain onSubmit (not a form action): React 19 auto-resets the form DOM after
  // a form action completes, which visually clears the controlled select.
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    setNotice(null);
    const result = await updateJobContractAction(jobId, formData);
    setPending(false);
    if (result?.error) setError(result.error);
    else setNotice("Saved.");
  }

  async function onUpload(kind: ContractSourceFile["kind"], list: FileList | null) {
    if (!list || list.length === 0) return;
    setUploading(kind);
    setError(null);
    setNotice(null);
    for (const file of Array.from(list)) {
      const fd = new FormData();
      fd.set("kind", kind);
      fd.set("file", file);
      const result = await uploadJobContractFileAction(jobId, fd);
      if (result?.error) {
        setError(result.error);
        break;
      }
    }
    setUploading(null);
    router.refresh();
  }

  return (
    <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {SOURCE_DOCS.map((d) => {
          const uploaded = files.filter((f) => f.kind === d.kind);
          return (
            <div key={d.kind} className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
              <span className="font-medium text-slate-700">{d.label}</span>
              <span className="block text-xs text-slate-500">{d.hint}</span>
              {uploaded.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {uploaded.map((f) => (
                    <li key={f.id}>
                      <a
                        href={`/contractflow/file/${f.path}`}
                        target="_blank"
                        className="block truncate text-xs text-blue-700 underline"
                      >
                        {f.originalFilename}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
              <label className="mt-2 inline-block cursor-pointer rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs hover:bg-slate-100">
                {uploading === d.kind ? "Uploading…" : uploaded.length > 0 ? "Add another" : "Upload"}
                <input
                  type="file"
                  accept="application/pdf,image/png,image/jpeg"
                  multiple
                  className="hidden"
                  disabled={uploading != null}
                  onChange={(e) => {
                    void onUpload(d.kind, e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
          );
        })}
      </div>

      <form onSubmit={onSubmit} className="border-t border-slate-100 pt-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {FIELDS.map((f) => (
            <label key={f.name} className="block text-sm">
              <span className="text-slate-600">{f.label}</span>
              <input
                name={f.name}
                type={f.type ?? "text"}
                value={values[f.name]}
                onChange={(e) => set(f.name, e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
          ))}
          <label className="block text-sm">
            <span className="text-slate-600">Original contract sum (AUD, ex. GST)</span>
            <input
              type="text"
              inputMode="decimal"
              value={sumFocused ? values.contractSumDollars : formatSum(values.contractSumDollars)}
              onFocus={() => setSumFocused(true)}
              onBlur={() => setSumFocused(false)}
              onChange={(e) => set("contractSumDollars", e.target.value.replace(/[^0-9.]/g, ""))}
              placeholder="$0.00"
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            />
            <input type="hidden" name="contractSumDollars" value={values.contractSumDollars} />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">Contract days basis</span>
            <select
              name="dayBasis"
              value={values.dayBasis}
              onChange={(e) => set("dayBasis", e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            >
              <option value="">—</option>
              <option value="working">Working days</option>
              <option value="ordinary">Ordinary (calendar) days</option>
            </select>
          </label>
        </div>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        {notice && <p className="mt-3 text-sm text-green-700">{notice}</p>}
        <button
          type="submit"
          disabled={pending}
          className="mt-4 rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save contract details"}
        </button>
      </form>
    </div>
  );
}
