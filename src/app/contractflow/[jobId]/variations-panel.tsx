"use client";

import { useRef, useState } from "react";
import type { Variation } from "@/lib/variations";
import {
  batchCreateVariationsAction,
  createVariationAction,
  extractVariationDetailsAction,
  setVariationStatusAction,
  uploadVariationFileAction,
} from "../actions";
import type { BatchVariationResult } from "../actions";
import { formatMoney, variationTitle } from "../format";

const V_STATUS_LABEL: Record<Variation["status"], string> = {
  proposed: "Proposed",
  submitted: "Submitted",
  approved: "Approved",
  rejected: "Rejected",
};

const V_STATUS_CLASS: Record<Variation["status"], string> = {
  proposed: "bg-slate-100 text-slate-700",
  submitted: "bg-blue-100 text-blue-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
};

type PlainVariation = Omit<Variation, "createdAt" | "updatedAt" | "decidedAt"> & {
  createdAt: Date;
  updatedAt: Date;
  decidedAt: Date | null;
};

type PlainVariationFile = {
  id: string;
  variationId: string;
  path: string;
  originalFilename: string;
};

function VariationRow({ v, files }: { v: PlainVariation; files: PlainVariationFile[] }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [approveValue, setApproveValue] = useState("");

  async function setStatus(status: string) {
    setPending(true);
    setError(null);
    const fd = new FormData();
    fd.set("status", status);
    if (approveValue) fd.set("approvedValueDollars", approveValue);
    const result = await setVariationStatusAction(v.id, fd);
    setPending(false);
    if (result?.error) setError(result.error);
  }

  async function upload(file: File) {
    setPending(true);
    setError(null);
    const fd = new FormData();
    fd.set("file", file);
    const result = await uploadVariationFileAction(v.id, fd);
    setPending(false);
    if (result?.error) setError(result.error);
  }

  return (
    <tr className="border-t border-slate-100 align-top">
      <td className="px-3 py-2 font-medium">{variationTitle(v)}</td>
      <td className="px-3 py-2">
        {v.description}
        {files.length > 0 && (
          <ul className="mt-1 space-y-0.5">
            {files.map((f) => (
              <li key={f.id}>
                <a
                  href={`/contractflow/file/${f.path}`}
                  target="_blank"
                  className="text-xs text-blue-700 underline"
                >
                  📎 {f.originalFilename}
                </a>
              </li>
            ))}
          </ul>
        )}
      </td>
      <td className="px-3 py-2 whitespace-nowrap">{formatMoney(v.claimedValueCents)}</td>
      <td className="px-3 py-2 whitespace-nowrap">
        {v.status === "approved" ? formatMoney(v.approvedValueCents) : "—"}
      </td>
      <td className="px-3 py-2">{v.timeImpactDays ?? "—"}</td>
      <td className="px-3 py-2">
        <span className={`rounded px-2 py-0.5 text-xs ${V_STATUS_CLASS[v.status]}`}>
          {V_STATUS_LABEL[v.status]}
        </span>
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          {v.status === "proposed" && (
            <>
              <button
                onClick={() => setStatus("submitted")}
                disabled={pending}
                className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-50"
              >
                Mark submitted
              </button>
              <button
                onClick={() => setStatus("deleted")}
                disabled={pending}
                className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                Delete
              </button>
            </>
          )}
          {v.status === "submitted" && (
            <>
              <input
                value={approveValue}
                onChange={(e) => setApproveValue(e.target.value)}
                placeholder="Approved $ (optional)"
                className="w-36 rounded border border-slate-300 px-2 py-1 text-xs"
              />
              <button
                onClick={() => setStatus("approved")}
                disabled={pending}
                className="rounded border border-green-400 px-2 py-1 text-xs text-green-800 hover:bg-green-50 disabled:opacity-50"
              >
                Approve
              </button>
              <button
                onClick={() => setStatus("rejected")}
                disabled={pending}
                className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                Reject
              </button>
            </>
          )}
          <label className="cursor-pointer rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">
            Attach file
            <input
              type="file"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(f);
                e.target.value = "";
              }}
            />
          </label>
        </div>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </td>
    </tr>
  );
}

function BatchUploadPanel({ jobId }: { jobId: string }) {
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<BatchVariationResult[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onUpload() {
    if (files.length === 0) return;
    setBusy(true);
    setError(null);
    setResults(null);
    const fd = new FormData();
    for (const f of files) fd.append("files", f);
    const result = await batchCreateVariationsAction(jobId, fd);
    setBusy(false);
    if ("error" in result) {
      setError(result.error ?? "Upload failed.");
      return;
    }
    setResults(result.results);
    setFiles([]);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <div className="grow">
          <span className="font-medium text-slate-700">Batch upload with AI</span>
          <span className="block text-xs text-slate-500">
            Select several variation documents (PDF or photo) — one variation is created per
            file with AI-read details, and the document is attached. Each starts as Proposed
            for review.
          </span>
          {files.length > 0 && (
            <span className="block text-xs text-slate-600">
              {files.length} file{files.length === 1 ? "" : "s"} selected:{" "}
              {files.map((f) => f.name).join(", ")}
            </span>
          )}
        </div>
        <label className="cursor-pointer rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs hover:bg-slate-100">
          {files.length > 0 ? "Change files" : "Choose files"}
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,.png,.jpg,.jpeg"
            className="hidden"
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          />
        </label>
        <button
          type="button"
          onClick={onUpload}
          disabled={busy || files.length === 0}
          className="rounded-md border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-800 hover:bg-indigo-100 disabled:opacity-50"
        >
          {busy
            ? `Reading ${files.length} document${files.length === 1 ? "" : "s"}…`
            : "✦ Upload & create with AI"}
        </button>
      </div>
      {error && <p className="text-red-600">{error}</p>}
      {results && (
        <ul className="space-y-1 text-xs">
          {results.map((r, i) => (
            <li key={i} className={r.ok ? "text-green-700" : "text-red-600"}>
              {r.ok
                ? `✓ ${r.filename} → Variation ${r.number}: ${r.description}`
                : `✗ ${r.filename}: ${r.error}`}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type NewVariation = {
  description: string;
  number: string;
  claimedValueDollars: string;
  timeImpactDays: string;
};

const EMPTY_VARIATION: NewVariation = {
  description: "",
  number: "",
  claimedValueDollars: "",
  timeImpactDays: "",
};

/** "5000" → "5,000.00"; leaves text that isn't a number untouched. */
function formatCurrencyInput(raw: string): string {
  if (raw.trim() === "") return raw;
  const n = Number.parseFloat(raw.replace(/[^0-9.-]/g, ""));
  if (Number.isNaN(n)) return raw;
  return n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function VariationsPanel({
  jobId,
  variations,
  files,
}: {
  jobId: string;
  variations: PlainVariation[];
  files: PlainVariationFile[];
}) {
  const [values, setValues] = useState<NewVariation>(EMPTY_VARIATION);
  const [fileName, setFileName] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function set(name: keyof NewVariation, value: string) {
    setValues((v) => ({ ...v, [name]: value }));
  }

  async function onCreate(formData: FormData) {
    setPending(true);
    setError(null);
    setNotice(null);
    // Strip currency formatting so the server sees a plain number.
    formData.set("claimedValueDollars", values.claimedValueDollars.replace(/[^0-9.-]/g, ""));
    const result = await createVariationAction(jobId, formData);
    setPending(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    setValues(EMPTY_VARIATION);
    setFileName(null);
    formRef.current?.reset();
  }

  async function onExtract() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setExtracting(true);
    setError(null);
    setNotice(null);
    const fd = new FormData();
    fd.set("file", file);
    const result = await extractVariationDetailsAction(fd);
    setExtracting(false);
    if ("error" in result && result.error) {
      setError(result.error);
      return;
    }
    if ("extract" in result && result.extract) {
      const e = result.extract;
      setValues((v) => ({
        description: e.description ?? v.description,
        number: e.number != null ? String(e.number) : v.number,
        claimedValueDollars:
          e.claimedValueDollars != null
            ? formatCurrencyInput(String(e.claimedValueDollars))
            : v.claimedValueDollars,
        timeImpactDays: e.timeImpactDays != null ? String(e.timeImpactDays) : v.timeImpactDays,
      }));
      setNotice("Details populated from the document — review and add.");
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Variations</h2>
      <form
        ref={formRef}
        action={onCreate}
        className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 text-sm"
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block sm:col-span-2 lg:col-span-4">
            <span className="text-slate-600">Description</span>
            <input
              name="description"
              required
              value={values.description}
              onChange={(e) => set("description", e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="block">
            <span className="text-slate-600">Variation no. (blank = next)</span>
            <input
              name="number"
              type="number"
              min={1}
              value={values.number}
              onChange={(e) => set("number", e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="block">
            <span className="text-slate-600">Claimed value (AUD, +/-, ex. GST)</span>
            <div className="relative mt-1">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-500">
                $
              </span>
              <input
                name="claimedValueDollars"
                type="text"
                inputMode="decimal"
                value={values.claimedValueDollars}
                onChange={(e) => set("claimedValueDollars", e.target.value)}
                onBlur={(e) => set("claimedValueDollars", formatCurrencyInput(e.target.value))}
                className="w-full rounded-md border border-slate-300 py-2 pl-7 pr-3"
              />
            </div>
          </label>
          <label className="block">
            <span className="text-slate-600">Time impact (days)</span>
            <input
              name="timeImpactDays"
              type="number"
              value={values.timeImpactDays}
              onChange={(e) => set("timeImpactDays", e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">
          <div className="grow">
            <span className="font-medium text-slate-700">Variation document (optional)</span>
            <span className="block text-xs text-slate-500">
              Quote, site instruction or variation direction — attached to the variation when
              added. PDF or photo for AI reading.
            </span>
            {fileName && <span className="block truncate text-xs text-slate-600">{fileName}</span>}
          </div>
          <label className="cursor-pointer rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs hover:bg-slate-100">
            {fileName ? "Change file" : "Choose file"}
            <input
              ref={fileRef}
              name="file"
              type="file"
              className="hidden"
              onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
            />
          </label>
          <button
            type="button"
            onClick={onExtract}
            disabled={extracting || !fileName}
            className="rounded-md border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-800 hover:bg-indigo-100 disabled:opacity-50"
          >
            {extracting ? "Reading…" : "✦ Populate with AI"}
          </button>
        </div>

        {error && <p className="text-red-600">{error}</p>}
        {notice && <p className="text-green-700">{notice}</p>}
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-blue-700 px-4 py-2 font-medium text-white disabled:opacity-50"
        >
          {pending ? "Adding…" : "Add variation"}
        </button>
      </form>

      <BatchUploadPanel jobId={jobId} />

      {variations.length === 0 ? (
        <p className="text-sm text-slate-500">No variations recorded.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-3 py-2">No.</th>
                <th className="px-3 py-2">Description</th>
                <th className="px-3 py-2">Claimed</th>
                <th className="px-3 py-2">Approved</th>
                <th className="px-3 py-2">Days</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {variations.map((v) => (
                <VariationRow
                  key={v.id}
                  v={v}
                  files={files.filter((f) => f.variationId === v.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
