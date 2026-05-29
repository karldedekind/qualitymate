"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { record } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth-helpers";
import { getRequestMeta } from "@/lib/request-meta";
import {
  inviteUser,
  deactivateUser,
  reactivateUser,
  setRole,
  adminResetPassword,
  findUserById,
} from "@/lib/users";
import { sendMail, isConfigured as smtpConfigured } from "@/lib/smtp";
import { getBranding } from "@/lib/branding";

const InviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "site_staff"]),
});

export async function inviteUserAction(formData: FormData) {
  const admin = await requireAdmin();
  const meta = await getRequestMeta();
  const parsed = InviteSchema.safeParse({
    email: formData.get("email"),
    role: formData.get("role"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const result = await inviteUser({
    email: parsed.data.email,
    role: parsed.data.role,
    invitedBy: admin.id,
  });

  let emailSent = false;
  if (await smtpConfigured()) {
    const brand = await getBranding();
    const send = await sendMail({
      to: result.email,
      subject: `You're invited to ${brand.companyName}`,
      html: `<p>You have been invited to ${brand.companyName} as <strong>${result.role}</strong>.</p>
             <p><a href="${result.link}">Click here to set up your account</a>.</p>
             <p>This link expires ${result.expiresAt.toUTCString()}.</p>`,
      text: `You have been invited to ${brand.companyName} as ${result.role}. Set up your account: ${result.link} (expires ${result.expiresAt.toUTCString()}).`,
    });
    emailSent = send.ok;
  }

  await record({
    actor: { id: admin.id, email: admin.email },
    action: "user.invite",
    entity: { type: "invite", id: result.id },
    after: {
      email: result.email,
      role: result.role,
      expiresAt: result.expiresAt.toISOString(),
      emailSent,
    },
    request: meta,
  });

  revalidatePath("/admin/users");
  return { link: result.link, email: result.email, emailSent };
}

const SetRoleSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(["admin", "site_staff"]),
});

export async function setRoleAction(formData: FormData) {
  const admin = await requireAdmin();
  const meta = await getRequestMeta();
  const parsed = SetRoleSchema.safeParse({
    userId: formData.get("userId"),
    role: formData.get("role"),
  });
  if (!parsed.success) return { error: "Invalid input" };

  const target = await findUserById(parsed.data.userId);
  if (!target) return { error: "User not found" };

  await setRole(parsed.data.userId, parsed.data.role);
  await record({
    actor: { id: admin.id, email: admin.email },
    action: "user.role.update",
    entity: { type: "user", id: parsed.data.userId },
    before: { role: target.role },
    after: { role: parsed.data.role },
    request: meta,
  });
  revalidatePath("/admin/users");
  return { ok: true };
}

const UserIdSchema = z.object({ userId: z.string().min(1) });

export async function deactivateUserAction(formData: FormData) {
  const admin = await requireAdmin();
  const meta = await getRequestMeta();
  const parsed = UserIdSchema.safeParse({ userId: formData.get("userId") });
  if (!parsed.success) return { error: "Invalid input" };

  if (parsed.data.userId === admin.id) {
    return { error: "You cannot deactivate yourself." };
  }

  const target = await findUserById(parsed.data.userId);
  if (!target) return { error: "User not found" };

  await deactivateUser(parsed.data.userId);
  await record({
    actor: { id: admin.id, email: admin.email },
    action: "user.deactivate",
    entity: { type: "user", id: parsed.data.userId },
    before: { deactivatedAt: target.deactivatedAt?.toISOString() ?? null },
    after: { deactivatedAt: new Date().toISOString(), email: target.email },
    request: meta,
  });
  revalidatePath("/admin/users");
  return { ok: true };
}

export async function reactivateUserAction(formData: FormData) {
  const admin = await requireAdmin();
  const meta = await getRequestMeta();
  const parsed = UserIdSchema.safeParse({ userId: formData.get("userId") });
  if (!parsed.success) return { error: "Invalid input" };

  await reactivateUser(parsed.data.userId);
  await record({
    actor: { id: admin.id, email: admin.email },
    action: "user.reactivate",
    entity: { type: "user", id: parsed.data.userId },
    request: meta,
  });
  revalidatePath("/admin/users");
  return { ok: true };
}

export async function adminResetPasswordAction(formData: FormData) {
  const admin = await requireAdmin();
  const meta = await getRequestMeta();
  const parsed = UserIdSchema.safeParse({ userId: formData.get("userId") });
  if (!parsed.success) return { error: "Invalid input" };

  const target = await findUserById(parsed.data.userId);
  if (!target) return { error: "User not found" };

  const { tempPassword } = await adminResetPassword(parsed.data.userId);

  await record({
    actor: { id: admin.id, email: admin.email },
    action: "user.password.admin_reset",
    entity: { type: "user", id: parsed.data.userId },
    after: { email: target.email },
    request: meta,
  });
  revalidatePath("/admin/users");
  return { tempPassword };
}
