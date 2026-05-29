"use server";

import { z } from "zod";
import { record } from "@/lib/audit";
import { submit, type SubmitErrorCode } from "@/lib/checkin";
import { findJobById } from "@/lib/jobs";
import { getRequestMeta } from "@/lib/request-meta";

const Schema = z.object({
  jobId: z.string().min(1, "Select a job"),
  fullName: z.string().min(1, "Full name is required").max(200),
  mobile: z.string().min(1, "Mobile is required").max(40),
  companyName: z.string().min(1, "Company is required").max(200),
  trade: z.string().min(1, "Trade is required").max(100),
  emergencyContactName: z.string().min(1, "Emergency contact name is required").max(200),
  emergencyContactPhone: z.string().min(1, "Emergency contact phone is required").max(40),
  whiteCardNumber: z.string().min(1, "White card number is required").max(100),
  whiteCardExpiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "White card expiry required"),
  plannedDeparture: z.string().min(1, "Planned departure is required"),
  signature: z.string().min(20, "Signature is required"),
});

export type SubmitActionResult =
  | { ok: true; id: string }
  | { ok: false; code: SubmitErrorCode | "JOB_INVALID" | "VALIDATION"; message: string };

export async function submitCheckInAction(formData: FormData): Promise<SubmitActionResult> {
  const meta = await getRequestMeta();

  const parsed = Schema.safeParse({
    jobId: formData.get("jobId"),
    fullName: formData.get("fullName"),
    mobile: formData.get("mobile"),
    companyName: formData.get("companyName"),
    trade: formData.get("trade"),
    emergencyContactName: formData.get("emergencyContactName"),
    emergencyContactPhone: formData.get("emergencyContactPhone"),
    whiteCardNumber: formData.get("whiteCardNumber"),
    whiteCardExpiry: formData.get("whiteCardExpiry"),
    plannedDeparture: formData.get("plannedDeparture"),
    signature: formData.get("signature"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      code: "VALIDATION",
      message: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  const job = await findJobById(parsed.data.jobId);
  if (!job || !job.active) {
    return { ok: false, code: "JOB_INVALID", message: "Selected job is not available." };
  }

  const plannedDepartureAt = new Date(parsed.data.plannedDeparture);
  if (isNaN(plannedDepartureAt.getTime())) {
    return { ok: false, code: "VALIDATION", message: "Planned departure is invalid." };
  }

  let result;
  try {
    result = await submit({
      jobId: parsed.data.jobId,
      fullName: parsed.data.fullName,
      mobile: parsed.data.mobile,
      companyName: parsed.data.companyName,
      trade: parsed.data.trade,
      emergencyContactName: parsed.data.emergencyContactName,
      emergencyContactPhone: parsed.data.emergencyContactPhone,
      whiteCardNumber: parsed.data.whiteCardNumber,
      whiteCardExpiry: parsed.data.whiteCardExpiry,
      declWhsmp: formData.get("decl_whsmp") === "on",
      declEmergency: formData.get("decl_emergency") === "on",
      declFitForWork: formData.get("decl_fit_for_work") === "on",
      declEmergencyAction: formData.get("decl_emergency_action") === "on",
      declHazards: formData.get("decl_hazards") === "on",
      declPpe: formData.get("decl_ppe") === "on",
      declCompetent: formData.get("decl_competent") === "on",
      declSiteRules: formData.get("decl_site_rules") === "on",
      consent: formData.get("consent") === "on",
      signatureDataUrl: parsed.data.signature,
      plannedDepartureAt,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  } catch (err) {
    return {
      ok: false,
      code: "VALIDATION",
      message: err instanceof Error ? err.message : "Could not save check-in.",
    };
  }

  if (!result.ok) {
    await record({
      actor: null,
      action: "site_attendance.rejected",
      entity: { type: "site_attendance" },
      after: { code: result.code, jobId: parsed.data.jobId, jobNumber: job.number },
      request: meta,
    });
    return { ok: false, code: result.code, message: result.message };
  }

  await record({
    actor: null,
    action: "site_attendance.create",
    entity: { type: "site_attendance", id: result.attendance.id },
    after: {
      jobId: result.attendance.jobId,
      jobNumber: job.number,
      fullName: result.attendance.fullName,
      companyName: result.attendance.companyName,
      trade: result.attendance.trade,
      whiteCardExpiry: result.attendance.whiteCardExpiry,
      plannedDepartureAt: result.attendance.plannedDepartureAt.toISOString(),
    },
    request: meta,
  });

  return { ok: true, id: result.attendance.id };
}
