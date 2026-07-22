import Link from "next/link";
import { requireCapability } from "@/lib/auth-helpers";
import { SignatureForm } from "./signature-form";

export const dynamic = "force-dynamic";

export default async function SignaturePage() {
  const admin = await requireCapability("contractflow.manage");
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Link href="/contractflow" className="text-sm text-blue-700 underline">
        ← ContractFlow
      </Link>
      <h1 className="text-xl font-semibold">My signature</h1>
      <p className="text-sm text-slate-600">
        Stamped onto the contractor signature block of every RFI, NOD, and EOT you issue.
      </p>
      <SignatureForm hasExisting={Boolean(admin.signaturePath)} />
      {admin.signaturePath && (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">Current signature</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/contractflow/file/${admin.signaturePath}?v=${Date.now()}`}
            alt="Current signature"
            className="max-h-24"
          />
        </div>
      )}
    </div>
  );
}
