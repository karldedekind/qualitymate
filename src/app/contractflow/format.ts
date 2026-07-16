import type { ContractDocument } from "@/lib/contract-documents";

export const STATUS_LABEL: Record<ContractDocument["status"], string> = {
  draft: "Draft",
  issued: "Issued",
  answered: "Answered",
  approved: "Approved",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  acknowledged: "Acknowledged",
};

export const STATUS_CLASS: Record<ContractDocument["status"], string> = {
  draft: "bg-slate-100 text-slate-700",
  issued: "bg-blue-100 text-blue-800",
  answered: "bg-green-100 text-green-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  withdrawn: "bg-slate-200 text-slate-500",
  acknowledged: "bg-green-100 text-green-800",
};

export function formatMoney(cents: number | null): string {
  if (cents == null) return "—";
  return (cents / 100).toLocaleString("en-AU", { style: "currency", currency: "AUD" });
}

export function formatIsoDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}
