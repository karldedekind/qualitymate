"use client";

import { useState } from "react";
import type { ContractDocContent } from "@/db/schema";
import { createDraftAction, updateDraftAction } from "../actions";

type Kind = "rfi" | "nod" | "eot";

export type LinkOption = { id: string; label: string };

type Props = {
  jobId: string;
  kind: Kind;
  /** The job's contract day basis; working days when unset. */
  dayBasis?: "ordinary" | "working" | null;
  rfiOptions: LinkOption[];
  nodOptions: LinkOption[];
} & (
  | { mode: "create" }
  | {
      mode: "edit";
      documentId: string;
      initial: {
        content: ContractDocContent;
        responseRequiredBy: string | null;
        daysClaimed: number | null;
        adjustedPcDate: string | null;
        rfiId: string | null;
        nodId: string | null;
      };
    }
);

const KIND_TITLE: Record<Kind, string> = {
  rfi: "Request for Information",
  nod: "Notice of Delay",
  eot: "Extension of Time",
};

function TextField({
  name,
  label,
  initial,
  rows = 6,
  hint,
}: {
  name: string;
  label: string;
  initial?: string;
  rows?: number;
  hint?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="text-slate-600">{label}</span>
      {hint && <span className="block text-xs text-slate-400">{hint}</span>}
      <textarea
        name={name}
        rows={rows}
        defaultValue={initial ?? ""}
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm"
      />
    </label>
  );
}

function LinkSelect({
  name,
  label,
  options,
  defaultValue,
}: {
  name: string;
  label: string;
  options: LinkOption[];
  defaultValue?: string | null;
}) {
  return (
    <label className="block text-sm">
      <span className="text-slate-600">{label}</span>
      <select
        name={name}
        defaultValue={defaultValue ?? ""}
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
      >
        <option value="">—</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function DocForm(props: Props) {
  const { jobId, kind } = props;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initial = props.mode === "edit" ? props.initial : null;

  async function onSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    const result =
      props.mode === "create"
        ? await createDraftAction(jobId, kind, formData)
        : await updateDraftAction(props.documentId, formData);
    setPending(false);
    if (result?.error) setError(result.error);
  }

  return (
    <form action={onSubmit} className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-base font-semibold">
        {props.mode === "create" ? `New ${KIND_TITLE[kind]} (draft)` : `Edit ${KIND_TITLE[kind]} draft`}
      </h2>

      {kind === "rfi" && (
        <>
          <TextField name="question" label="Question" initial={initial?.content.question} rows={10} />
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-slate-600">Response required by</span>
              <input
                name="responseRequiredBy"
                type="date"
                defaultValue={initial?.responseRequiredBy ?? ""}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
          </div>
          {props.mode === "create" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
                <span className="font-medium text-slate-700">Photos</span>
                <span className="block text-xs text-slate-500">
                  Site photos supporting the question, printed on the issued RFI. PNG or JPG.
                </span>
                <input
                  name="photos"
                  type="file"
                  accept="image/png,image/jpeg"
                  multiple
                  className="mt-2 w-full text-sm"
                />
              </label>
              <label className="block rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
                <span className="font-medium text-slate-700">Documents</span>
                <span className="block text-xs text-slate-500">
                  Drawings, specs or correspondence, emailed with the issued RFI. PDF, Office,
                  email or image files.
                </span>
                <input name="documents" type="file" multiple className="mt-2 w-full text-sm" />
              </label>
            </div>
          )}
        </>
      )}

      {kind === "nod" && (
        <>
          <TextField name="cause" label="The cause of delay" initial={initial?.content.cause} rows={8} />
          <TextField
            name="datesOccurred"
            label="Date(s) on which it occurred"
            initial={initial?.content.datesOccurred}
            rows={4}
          />
          <TextField
            name="daysDelayed"
            label="Number of days delayed"
            initial={initial?.content.daysDelayed}
            rows={3}
          />
          <LinkSelect
            name="rfiId"
            label="RFI reference"
            options={props.rfiOptions}
            defaultValue={initial?.rfiId}
          />
          {props.mode === "create" && (
            <label className="block rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
              <span className="font-medium text-slate-700">Attachments</span>
              <span className="block text-xs text-slate-500">
                Supporting documents, emailed with the issued NOD. PDF, Office, email or image
                files.
              </span>
              <input name="documents" type="file" multiple className="mt-2 w-full text-sm" />
            </label>
          )}
        </>
      )}

      {kind === "eot" && (
        <>
          <TextField
            name="clausePreamble"
            label="Contractual basis of claim"
            hint="Typed fresh for each claim, e.g. the Clause 17 preamble."
            initial={initial?.content.clausePreamble}
            rows={8}
          />
          <TextField
            name="reasons"
            label="Reason(s) for delay and the date(s) on which it occurred"
            initial={initial?.content.reasons}
            rows={8}
          />
          <TextField name="request" label="Request" initial={initial?.content.request} rows={5} />
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block text-sm">
              <span className="text-slate-600">
                Days claimed ({props.dayBasis === "ordinary" ? "ordinary days" : "working days"})
              </span>
              <input
                name="daysClaimed"
                type="number"
                min={0}
                defaultValue={initial?.daysClaimed ?? ""}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="text-slate-600">Adjusted Date for PC (leave blank to compute)</span>
              <input
                name="adjustedPcDate"
                type="date"
                defaultValue={initial?.adjustedPcDate ?? ""}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              />
              <span className="text-xs text-slate-400">
                {props.dayBasis === "ordinary"
                  ? "Blank = computed from the job's current adjusted date using ordinary (calendar) days."
                  : "Blank = computed from the job's current adjusted date using QLD working days."}
              </span>
            </label>
          </div>
          <LinkSelect
            name="nodId"
            label="NOD reference"
            options={props.nodOptions}
            defaultValue={initial?.nodId}
          />
        </>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save draft"}
      </button>
    </form>
  );
}
