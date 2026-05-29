"use client";

import Link from "next/link";
import { useTransition } from "react";
import type { Job } from "@/lib/jobs";
import { activateJobAction, deactivateJobAction } from "./actions";

export function JobRow({ job, inactive }: { job: Job; inactive?: boolean }) {
  const [pending, startTransition] = useTransition();

  function toggle() {
    const fd = new FormData();
    fd.append("id", job.id);
    startTransition(async () => {
      if (inactive) await activateJobAction(fd);
      else await deactivateJobAction(fd);
    });
  }

  return (
    <tr className="border-t border-slate-100">
      <td className="px-3 py-2 font-mono">{job.number}</td>
      <td className="px-3 py-2">{job.name}</td>
      <td className="px-3 py-2 text-slate-600">{job.address ?? "—"}</td>
      <td className="px-3 py-2 text-right space-x-3">
        <a
          href={`/admin/jobs/${job.id}/poster.pdf`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-700 hover:underline"
        >
          Poster
        </a>
        <Link href={`/admin/jobs/${job.id}/edit`} className="text-blue-700 hover:underline">
          Edit
        </Link>
        <button
          type="button"
          onClick={toggle}
          disabled={pending}
          className="text-slate-700 hover:underline disabled:opacity-50"
        >
          {inactive ? "Activate" : "Deactivate"}
        </button>
      </td>
    </tr>
  );
}
