import { NextRequest, NextResponse } from "next/server";

const PROTECTED_PREFIXES = ["/dashboard", "/admin"];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const needsAuth = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!needsAuth) return NextResponse.next();

  // Over HTTPS, Better-Auth prefixes cookies with `__Secure-`; over http (dev)
  // it doesn't. Check both so the auth gate works in production and locally.
  const sessionCookie =
    req.cookies.get("__Secure-qm.session_token") ??
    req.cookies.get("qm.session_token") ??
    req.cookies.get("__Secure-qm.session_data") ??
    req.cookies.get("qm.session_data");
  if (!sessionCookie) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*"],
};
