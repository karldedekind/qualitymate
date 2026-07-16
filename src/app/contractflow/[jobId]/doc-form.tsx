"use client";

import { useState } from "react";
import type { ContractDocContent } from "@/db/schema";
import { createDraftAction, updateDraftAction } from "../actions";

type Kind = "rfi";

type Props = {
  jobId: string;
  kind: Kind;
} & (
  | { mode: "create" }
  | {
      mode: "edit";
      documentId: string;
      initial: {
        content: ContractDocContent;
        responseRequiredBy: string | null;
      };
    }
);

const KIND_TITLE: Record<Kind, string> = {
  rfi: "Request for Information",
};

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

      <label className="block text-sm">
        <span className="text-slate-600">Question</span>
        <textarea
          name="question"
          rows={10}
          defaultValue={initial?.content.question ?? ""}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm"
        />
      </label>
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
