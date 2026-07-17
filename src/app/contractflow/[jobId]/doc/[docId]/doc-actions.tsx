"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  deleteDraftAction,
  issueAction,
  startRevisionAction,
  withdrawAction,
} from "../../../actions";

type Props = {
  documentId: string;
  jobId: string;
  kind: "rfi" | "nod" | "eot";
  status: "draft" | "issued" | "answered" | "approved" | "rejected" | "withdrawn" | "acknowledged";
};

export function DocActions({ documentId, jobId, kind, status }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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

      {error && <p className="text-sm text-red-600">{error}</p>}
      {notice && <p className="text-sm text-green-700">{notice}</p>}
    </div>
  );
}
