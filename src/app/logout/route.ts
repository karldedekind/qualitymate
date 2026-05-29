import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { record } from "@/lib/audit";
import { getRequestMeta } from "@/lib/request-meta";

export async function POST() {
  const incoming = await headers();
  const session = await auth.api.getSession({ headers: incoming });
  const meta = await getRequestMeta();

  const response = await auth.api.signOut({ headers: incoming, asResponse: true });

  await record({
    actor: session ? { id: session.user.id, email: session.user.email } : null,
    action: "logout",
    entity: { type: "user", id: session?.user.id ?? null },
    request: meta,
  });

  const setCookie = response.headers.get("set-cookie");
  const redirect = NextResponse.redirect(new URL("/login", process.env.APP_URL ?? "http://localhost:3000"), 303);
  if (setCookie) redirect.headers.set("set-cookie", setCookie);
  return redirect;
}
