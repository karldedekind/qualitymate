import { notFound, redirect } from "next/navigation";
import { requireCapability } from "@/lib/auth-helpers";
import { findById } from "@/lib/contract-documents";

/**
 * Job-less deep link for notifications: they store only the document id, so
 * resolve the job here and bounce to the canonical page.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ docId: string }> },
) {
  await requireCapability("contractflow.manage");
  const { docId } = await params;
  const doc = await findById(docId);
  if (!doc) notFound();
  redirect(`/contractflow/${doc.jobId}/doc/${doc.id}`);
}
