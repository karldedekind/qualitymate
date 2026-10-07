import Link from "next/link";
import { requireCapability } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

const REGISTERS = [
  {
    href: "/registers/documents",
    label: "Document Register",
    description: "RIM's Controlled Documents: policies, manuals, procedures, SWMS, forms and templates.",
  },
];

export default async function CompanyRegistersPage() {
  await requireCapability("documents.view");
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Company Registers</h1>
      <ul className="grid gap-3 sm:grid-cols-2">
        {REGISTERS.map((r) => (
          <li key={r.href}>
            <Link
              href={r.href}
              className="group flex h-full items-center justify-between gap-4 rounded-lg border border-lime-200 bg-lime-50 px-5 py-4 hover:bg-lime-100 hover:border-lime-300 transition-colors"
            >
              <div>
                <div className="font-semibold text-lime-950">{r.label}</div>
                <p className="mt-0.5 text-sm text-lime-800">{r.description}</p>
              </div>
              <span className="shrink-0 text-lime-600 group-hover:text-lime-900 transition-colors">
                Open →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
