import { headers } from "next/headers";

export async function getRequestMeta(): Promise<{ ip: string; userAgent: string }> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  const ip = (fwd ? fwd.split(",")[0]?.trim() : null) ?? h.get("x-real-ip") ?? "unknown";
  const userAgent = h.get("user-agent") ?? "unknown";
  return { ip, userAgent };
}
