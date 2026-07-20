"use client";

import { useState } from "react";
import type { ContractDocContent } from "@/db/schema";
import { createDraftAction, suggestRewriteAction, updateDraftAction } from "../actions";

type Kind = "rfi" | "nod" | "eot";

export type LinkOption = { id: string; label: string };

type Props = {
  jobId: string;
  kind: Kind;
  /** The job's contract day basis; working days when unset. */
  dayBasis?: "ordinary" | "working" | null;
  rfiOptions: LinkOption[];
  nodOptions: LinkOption[];
  variationOptions: LinkOption[];
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
        variationId: string | null;
      };
    }
);

const KIND_TITLE: Record<Kind, string> = {
  rfi: "Request for Information",
  nod: "Notice of Delay",
  eot: "Extension of Time",
};

/**
 * Long-text field with an AI "professional rewrite" helper. Controlled so a
 * suggested rewrite can replace the draft text in place; still posts as the
 * plain named form field.
 */
function AiTextArea({
  name,
  label,
  docKind,
  initial,
  rows = 6,
  hint,
}: {
  name: string;
  label: string;
  docKind: string;
  initial?: string;
  rows?: number;
  hint?: string;
}) {
  const [value, setValue] = useState(initial ?? "");
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSuggest() {
    setPending(true);
    setError(null);
    setSuggestion(null);
    const result = await suggestRewriteAction({ docKind, fieldLabel: label, text: value });
    setPending(false);
    if ("rewrite" in result && typeof result.rewrite === "string") {
      setSuggestion(result.rewrite);
    } else {
      setError(("error" in result && result.error) || "Rewrite failed.");
    }
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm">
        <span className="text-slate-600">{label}</span>
        {hint && <span className="block text-xs text-slate-400">{hint}</span>}
        <textarea
          name={name}
          rows={rows}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm"
        />
      </label>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onSuggest}
          disabled={pending || value.trim() === ""}
          className="rounded-md border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-800 hover:bg-indigo-100 disabled:opacity-50"
        >
          {pending ? "Thinking…" : "✦ Suggest professional rewrite"}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
      {suggestion && (
        <div className="space-y-2 rounded-md border border-indigo-200 bg-indigo-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
            Suggested rewrite
          </p>
          <p className="whitespace-pre-wrap text-sm text-slate-800">{suggestion}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setValue(suggestion);
                setSuggestion(null);
              }}
              className="rounded-md bg-indigo-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-800"
            >
              Use rewrite
            </button>
            <button
              type="button"
              onClick={() => setSuggestion(null)}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
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
          <AiTextArea
            name="question"
            label="Question"
            docKind={KIND_TITLE.rfi}
            initial={initial?.content.question}
            rows={10}
          />
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
          <AiTextArea
            name="cause"
            label="The cause of delay"
            docKind={KIND_TITLE.nod}
            initial={initial?.content.cause}
            rows={8}
          />
          <AiTextArea
            name="datesOccurred"
            label="Date(s) on which it occurred"
            docKind={KIND_TITLE.nod}
            initial={initial?.content.datesOccurred}
            rows={4}
          />
          <AiTextArea
            name="daysDelayed"
            label="Number of days delayed"
            docKind={KIND_TITLE.nod}
            initial={initial?.content.daysDelayed}
            rows={3}
          />
          <LinkSelect
            name="rfiId"
            label="RFI reference"
            options={props.rfiOptions}
            defaultValue={initial?.rfiId}
          />
          <LinkSelect
            name="variationId"
            label="Linked variation"
            options={props.variationOptions}
            defaultValue={initial?.variationId}
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
          <AiTextArea
            name="clausePreamble"
            label="Contractual basis of claim"
            docKind={KIND_TITLE.eot}
            hint="Typed fresh for each claim, e.g. the Clause 17 preamble."
            initial={initial?.content.clausePreamble}
            rows={8}
          />
          <AiTextArea
            name="reasons"
            label="Reason(s) for delay and the date(s) on which it occurred"
            docKind={KIND_TITLE.eot}
            initial={initial?.content.reasons}
            rows={8}
          />
          <AiTextArea
            name="request"
            label="Request"
            docKind={KIND_TITLE.eot}
            initial={initial?.content.request}
            rows={5}
          />
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
          <LinkSelect
            name="variationId"
            label="Linked variation"
            options={props.variationOptions}
            defaultValue={initial?.variationId}
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
