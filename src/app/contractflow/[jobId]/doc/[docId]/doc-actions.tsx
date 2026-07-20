"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  deleteDraftAction,
  issueAction,
  recordResponseAction,
  startRevisionAction,
  uploadAttachmentAction,
  withdrawAction,
} from "../../../actions";

type Props = {
  documentId: string;
  jobId: string;
  kind: "rfi" | "nod" | "eot";
  status: "draft" | "issued" | "answered" | "approved" | "rejected" | "withdrawn" | "acknowledged";
  initialShowResponse?: boolean;
};

export function DocActions({ documentId, jobId, kind, status, initialShowResponse }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showResponse, setShowResponse] = useState(
    (initialShowResponse ?? false) && status === "issued",
  );

  async function run(fn: () => Promise<{ error?: string } | { ok: true } | void>) {
    setPending(true);
    setError(null);
    setNotice(null);
    const result = await fn();
    setPending(false);
    if (result && "error" in result && result.error) {
      setError(result.error);
      return false;
    }
    router.refresh();
    return true;
  }

  async function onIssue() {
    if (!confirm("Issue this document? Content is locked and the number allocated permanently.")) {
      return;
    }
    setPending(true);
    setError(null);
    setNotice(null);
    const result = await issueAction(documentId);
    setPending(false);
    if ("error" in result && result.error) {
      setError(result.error);
      return;
    }
    if ("emailSent" in result) {
      setNotice(
        result.emailSent
          ? "Issued and emailed to the Principal's representative."
          : `Issued. Email not sent: ${result.emailError} Download the PDF below and send it manually.`,
      );
    }
    router.refresh();
  }

  async function onRespond(formData: FormData) {
    const ok = await run(() => recordResponseAction(documentId, formData));
    if (ok) setShowResponse(false);
  }

  async function uploadFiles(list: FileList | null, role: "photo" | "attachment") {
    const files = Array.from(list ?? []);
    if (files.length === 0) return;
    setPending(true);
    setError(null);
    setNotice(null);
    for (const f of files) {
      const fd = new FormData();
      fd.set("file", f);
      fd.set("role", role);
      const result = await uploadAttachmentAction(documentId, fd);
      if (result && "error" in result && result.error) {
        setError(`${f.name}: ${result.error}`);
        break;
      }
    }
    setPending(false);
    router.refresh();
  }

  const btn =
    "rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50";
  const primaryBtn =
    "rounded-md bg-blue-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50";

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        {status === "draft" && (
          <>
            <Link href={`/contractflow/${jobId}/doc/${documentId}/edit`} className={btn}>
              Edit draft
            </Link>
            <button onClick={onIssue} disabled={pending} className={primaryBtn}>
              Issue{kind === "rfi" ? " RFI" : kind === "nod" ? " NOD" : " EOT"}
            </button>
            {kind === "rfi" && (
              <label className={`${btn} cursor-pointer`}>
                Add photos
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    void uploadFiles(e.target.files, "photo");
                    e.target.value = "";
                  }}
                />
              </label>
            )}
            <label className={`${btn} cursor-pointer`}>
              {kind === "rfi" ? "Add documents" : "Add attachment"}
              <input
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  void uploadFiles(e.target.files, "attachment");
                  e.target.value = "";
                }}
              />
            </label>
            <button
              onClick={() => {
                if (confirm("Delete this draft?")) {
                  void run(() => deleteDraftAction(documentId));
                }
              }}
              disabled={pending}
              className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              Delete draft
            </button>
          </>
        )}

        {status === "issued" && (
          <>
            <button onClick={() => setShowResponse((s) => !s)} className={primaryBtn}>
              {kind === "nod" ? "Record acknowledgement" : "Record response"}
            </button>
            <button
              onClick={() => {
                if (confirm("Start a revision? The current version is archived when you reissue.")) {
                  void run(() => startRevisionAction(documentId));
                }
              }}
              disabled={pending}
              className={btn}
            >
              Revise
            </button>
            <button
              onClick={() => {
                if (confirm("Withdraw this document?")) {
                  void run(() => withdrawAction(documentId));
                }
              }}
              disabled={pending}
              className={btn}
            >
              Withdraw
            </button>
          </>
        )}

        {(status === "answered" ||
          status === "approved" ||
          status === "rejected" ||
          status === "acknowledged") && (
          <button
            onClick={() => {
              if (confirm("Start a revision? The current version is archived when you reissue.")) {
                void run(() => startRevisionAction(documentId));
              }
            }}
            disabled={pending}
            className={btn}
          >
            Revise
          </button>
        )}
      </div>

      {showResponse && (
        <form action={onRespond} className="space-y-3 border-t border-slate-100 pt-3 text-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-slate-600">Outcome</span>
              <select
                name="status"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
              >
                {kind === "rfi" ? (
                  <option value="answered">Answered</option>
                ) : kind === "nod" ? (
                  <option value="acknowledged">Acknowledged</option>
                ) : (
                  <>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                  </>
                )}
              </select>
            </label>
            <label className="block rounded-md border border-slate-200 bg-slate-50 p-3">
              <span className="font-medium text-slate-700">
                Principal's response file (optional)
              </span>
              <input name="file" type="file" className="mt-2 w-full" />
            </label>
            <label className="block sm:col-span-2">
              <span className="text-slate-600">Note (optional)</span>
              <input name="note" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
            </label>
          </div>
          <button type="submit" disabled={pending} className={primaryBtn}>
            {pending ? "Saving…" : "Save response"}
          </button>
        </form>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {notice && <p className="text-sm text-green-700">{notice}</p>}
    </div>
  );
}
