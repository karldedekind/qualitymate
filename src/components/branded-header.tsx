import Link from "next/link";
import { getBranding } from "@/lib/branding";
import { getSessionUser } from "@/lib/auth-helpers";
import { NotificationsBell } from "@/components/notifications-bell";

export async function BrandedHeader({ showSignOut = false }: { showSignOut?: boolean }) {
  const [brand, sessionUser] = await Promise.all([getBranding(), getSessionUser()]);
  return (
    <header
      className="border-b border-slate-200 bg-white"
      style={{ borderTopColor: brand.primaryColor, borderTopWidth: 4 }}
    >
      <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
        <Link href="/dashboard" className="flex items-center gap-3">
          {brand.logoPath ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/uploads/${brand.logoPath}`} alt={brand.companyName} className="h-8 w-auto" />
          ) : (
            <div
              className="h-8 w-8 rounded-md flex items-center justify-center text-white font-semibold"
              style={{ backgroundColor: brand.primaryColor }}
            >
              {brand.companyShortName.charAt(0)}
            </div>
          )}
          <span className="font-semibold text-slate-900">{brand.companyName}</span>
        </Link>
        <div className="flex items-center gap-2">
          {sessionUser && <NotificationsBell userId={sessionUser.id} />}
          {sessionUser?.role === "admin" && (
            <Link href="/admin/settings" className="text-sm text-slate-600 hover:text-slate-900 px-2 py-1 rounded hover:bg-slate-100">
              Settings
            </Link>
          )}
          {showSignOut && (
            <form action="/logout" method="post">
              <button type="submit" className="text-sm text-slate-600 hover:text-slate-900 px-2 py-1 rounded hover:bg-slate-100">
                Sign out
              </button>
            </form>
          )}
        </div>
      </div>
    </header>
  );
}
