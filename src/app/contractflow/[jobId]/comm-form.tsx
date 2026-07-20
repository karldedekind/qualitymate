"use client";

import { useRef, useState } from "react";
import { extractCommunicationDetailsAction, logCommunicationAction } from "../actions";

type Fields = {
  subject: string;
  direction: string;
  occurredAt: string;
  documentId: string;
  note: string;
};

const EMPTY: Fields = { subject: "", direction: "inbound", occurredAt: "", documentId: "", note: "" };

export function CommForm({
  jobId,
  documents,
  fixedDocumentId,
}: {
  jobId: string;
  documents: { id: string; label: string }[];
  /** Lock the communication to this document: hides the picker, posts the id. */
  fixedDocumentId?: string;
}) {
  const [values, setValues] = useState<Fields>(EMPTY);
  const [fileName, setFileName] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const isEml = fileName?.toLowerCase().endsWith(".eml") ?? false;

  function set(name: keyof Fields, value: string) {
    setValues((v) => ({ ...v, [name]: value }));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    setNotice(null);
    const result = await logCommunicationAction(jobId, formData);
    setPending(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    setValues(EMPTY);
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
    const result = await extractCommunicationDetailsAction(jobId, fd);
    setExtracting(false);
    if ("error" in result && result.error) {
      setError(result.error);
      return;
    }
    if ("extract" in result && result.extract) {
      const e = result.extract;
      setValues((v) => ({
        subject: e.subject ?? v.subject,
        direction: e.direction ?? v.direction,
        occurredAt: e.occurredAt ?? v.occurredAt,
        documentId: e.documentId ?? v.documentId,
        note: e.note ?? v.note,
      }));
      setNotice("Details populated from the email — review and log.");
    }
  }

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      className="rounded-lg border border-slate-200 bg-white p-4 text-sm"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="text-slate-600">Subject</span>
          <input
            name="subject"
            required
            value={values.subject}
            onChange={(e) => set("subject", e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            placeholder="e.g. 82299 - RFI 002 - footpath & swale drain"
          />
        </label>
        <label className="block">
          <span className="text-slate-600">Direction</span>
          <select
            name="direction"
            value={values.direction}
            onChange={(e) => set("direction", e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          >
            <option value="inbound">Inbound (from Principal)</option>
            <option value="outbound">Outbound (to Principal)</option>
          </select>
        </label>
        <label className="block">
          <span className="text-slate-600">Date</span>
          <input
            name="occurredAt"
            type="date"
            required
            value={values.occurredAt}
            onChange={(e) => set("occurredAt", e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        {fixedDocumentId ? (
          <input type="hidden" name="documentId" value={fixedDocumentId} />
        ) : (
          <label className="block">
            <span className="text-slate-600">Linked document (optional)</span>
            <select
              name="documentId"
              value={values.documentId}
              onChange={(e) => set("documentId", e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
            >
              <option value="">—</option>
              {documents.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <span className="font-medium text-slate-700">Email / file (optional)</span>
          <span className="block text-xs text-slate-500">.eml, .pdf, image or Office file.</span>
          <input
            ref={fileRef}
            name="file"
            type="file"
            className="mt-2 w-full text-sm"
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
          />
          {isEml && (
            <button
              type="button"
              onClick={onExtract}
              disabled={extracting}
              className="mt-2 rounded-md border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-800 hover:bg-indigo-100 disabled:opacity-50"
            >
              {extracting ? "Reading email…" : "✦ Populate details with AI"}
            </button>
          )}
        </div>
        <label className="block sm:col-span-2">
          <span className="text-slate-600">Note (optional)</span>
          <input
            name="note"
            value={values.note}
            onChange={(e) => set("note", e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
      </div>
      {error && <p className="mt-3 text-red-600">{error}</p>}
      {notice && <p className="mt-3 text-green-700">{notice}</p>}
      <button
        type="submit"
        disabled={pending}
        className="mt-3 rounded-md bg-blue-700 px-4 py-2 font-medium text-white disabled:opacity-50"
      >
        {pending ? "Logging…" : "Log communication"}
      </button>
    </form>
  );
}
