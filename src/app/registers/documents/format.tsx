import type { ReviewStatus } from "@/lib/document-register";

export function formatIsoDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

export const REVIEW_STATUS_LABEL: Record<ReviewStatus, string> = {
  ok: "Current",
  due_soon: "Due Soon",
  overdue: "Overdue",
};

export function ReviewBadge({ status }: { status: ReviewStatus | null }) {
  if (status === "due_soon") {
    return <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900">Due Soon</span>;
  }
  if (status === "overdue") {
    return <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-800">Overdue</span>;
  }
  return null;
}

export const VERSION_STATUS_CLASS = {
  draft: "bg-slate-100 text-slate-700",
  issued: "bg-lime-100 text-lime-900",
  superseded: "bg-slate-200 text-slate-500",
} as const;

export const VERSION_STATUS_LABEL = {
  draft: "Draft",
  issued: "Current",
  superseded: "Superseded",
} as const;
