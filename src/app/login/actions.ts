"use server";

import { headers, cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { user } from "@/db/schema";
import { record } from "@/lib/audit";
import { getRequestMeta } from "@/lib/request-meta";
import { checkLogin, recordLoginFailure, recordLoginSuccess } from "@/lib/rate-limit";

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function loginAction(formData: FormData) {
  const parsed = LoginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "Enter a valid email and password." };
  }
  const { email, password } = parsed.data;
  const meta = await getRequestMeta();

  const limit = checkLogin(meta.ip, email);
  if (!limit.ok) {
    await record({
      actor: null,
      action: "login.rate_limited",
      entity: { type: "login", id: email.toLowerCase() },
      request: meta,
    });
    const minutes = Math.ceil(limit.retryAfterMs / 60_000);
    return { error: `Too many attempts. Try again in ${minutes} minutes.` };
  }

  const existing = await db.select().from(user).where(eq(user.email, email)).limit(1);
  const candidate = existing[0];
  if (candidate?.deactivatedAt) {
    recordLoginFailure(meta.ip, email);
    await record({
      actor: null,
      action: "login.deactivated",
      entity: { type: "user", id: candidate.id },
      request: meta,
    });
    return { error: "Account is deactivated. Contact your admin." };
  }

  let response: Response;
  try {
    response = await auth.api.signInEmail({
      body: { email, password },
      headers: await headers(),
      asResponse: true,
    });
  } catch (err) {
    const limitAfter = recordLoginFailure(meta.ip, email);
    await record({
      actor: null,
      action: "login.failure",
      entity: { type: "login", id: email.toLowerCase() },
      after: { reason: err instanceof Error ? err.message : "unknown" },
      request: meta,
    });
    if (!limitAfter.ok) {
      await record({
        actor: null,
        action: "login.rate_limited",
        entity: { type: "login", id: email.toLowerCase() },
        request: meta,
      });
      const minutes = Math.ceil(limitAfter.retryAfterMs / 60_000);
      return { error: `Too many attempts. Try again in ${minutes} minutes.` };
    }
    return { error: "Invalid email or password." };
  }

  if (!response.ok) {
    const limitAfter = recordLoginFailure(meta.ip, email);
    let reason = `status ${response.status}`;
    try {
      const body = await response.clone().json();
      if (body && typeof body === "object" && "message" in body) {
        reason = String((body as { message: unknown }).message);
      }
    } catch {}
    await record({
      actor: null,
      action: "login.failure",
      entity: { type: "login", id: email.toLowerCase() },
      after: { reason },
      request: meta,
    });
    if (!limitAfter.ok) {
      await record({
        actor: null,
        action: "login.rate_limited",
        entity: { type: "login", id: email.toLowerCase() },
        request: meta,
      });
      const minutes = Math.ceil(limitAfter.retryAfterMs / 60_000);
      return { error: `Too many attempts. Try again in ${minutes} minutes.` };
    }
    return { error: "Invalid email or password." };
  }

  const setCookies = response.headers.getSetCookie();
  const cookieStore = await cookies();
  for (const cookieStr of setCookies) {
    const [pair, ...attrs] = cookieStr.split("; ");
    const eqIdx = pair.indexOf("=");
    const name = pair.slice(0, eqIdx);
    // Better-Auth pre-encodes the cookie value (e.g. `/` → `%2F`).
    // Next's cookies().set() always re-runs encodeURIComponent, which would
    // double-encode (`%2F` → `%252F`) and break HMAC verification on the next
    // request. Decode once so the round-trip matches the value Better-Auth signed.
    const value = decodeURIComponent(pair.slice(eqIdx + 1));
    const opts: Parameters<typeof cookieStore.set>[2] = {};
    for (const a of attrs) {
      const [k, v] = a.split("=");
      const kl = k.toLowerCase();
      if (kl === "path") opts.path = v;
      else if (kl === "max-age") opts.maxAge = parseInt(v, 10);
      else if (kl === "httponly") opts.httpOnly = true;
      else if (kl === "secure") opts.secure = true;
      else if (kl === "samesite") opts.sameSite = v.toLowerCase() as "lax" | "strict" | "none";
      else if (kl === "expires") opts.expires = new Date(v);
      else if (kl === "domain") opts.domain = v;
    }
    cookieStore.set(name, value, opts);
  }

  recordLoginSuccess(meta.ip, email);

  const found = await db.select().from(user).where(eq(user.email, email)).limit(1);
  const u = found[0];

  await record({
    actor: u ? { id: u.id, email: u.email } : null,
    action: "login.success",
    entity: { type: "user", id: u?.id ?? null },
    request: meta,
  });

  if (u?.mustChangePassword) {
    redirect("/change-password");
  }
  if (u?.totpEnabledAt) {
    redirect("/login/mfa");
  }
  if (u && u.role === "admin") {
    const { isMfaRequiredForAdmins } = await import("@/lib/mfa");
    if (await isMfaRequiredForAdmins()) {
      redirect("/account/security/setup");
    }
  }
  redirect("/dashboard");
}
