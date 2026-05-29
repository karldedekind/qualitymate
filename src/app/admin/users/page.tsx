import { listUsers } from "@/lib/users";
import { InviteForm } from "./invite-form";
import { UserRow } from "./user-row";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ invited?: string; reset?: string; tempPassword?: string }>;
};

export default async function AdminUsersPage({ searchParams }: Props) {
  const sp = await searchParams;
  const { active, deactivated } = await listUsers();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold mb-1">Users</h1>
        <p className="text-slate-600 text-sm">
          Invite, deactivate, change roles, and reset passwords. Two roles only: admin and site_staff.
        </p>
      </div>

      {sp.reset && sp.tempPassword && (
        <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4">
          <p className="text-sm text-yellow-900">
            <strong>Temporary password set for {sp.reset}:</strong>{" "}
            <code className="bg-white px-2 py-1 rounded border border-yellow-300 font-mono">
              {sp.tempPassword}
            </code>{" "}
            — share with the user securely. They will be forced to change it on first login.
          </p>
        </div>
      )}

      {sp.invited && (
        <div className="bg-blue-50 border border-blue-300 rounded-lg p-4">
          <p className="text-sm text-blue-900 mb-1">
            Invitation created. Send this link to <strong>{sp.invited}</strong>:
          </p>
          <code className="block bg-white px-3 py-2 rounded border border-blue-300 font-mono text-xs break-all">
            {sp.invited && decodeURIComponent(sp.invited.split("|")[1] ?? "")}
          </code>
        </div>
      )}

      <section className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
        <h2 className="text-lg font-medium mb-4">Invite user</h2>
        <InviteForm />
      </section>

      <section>
        <h2 className="text-lg font-medium mb-3">Active users ({active.length})</h2>
        <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Role</th>
                <th className="px-3 py-2 font-medium">Created</th>
                <th className="px-3 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {active.map((u) => <UserRow key={u.id} user={u} />)}
            </tbody>
          </table>
        </div>
      </section>

      {deactivated.length > 0 && (
        <section>
          <h2 className="text-lg font-medium mb-3">Deactivated ({deactivated.length})</h2>
          <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Email</th>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Deactivated</th>
                  <th className="px-3 py-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {deactivated.map((u) => <UserRow key={u.id} user={u} deactivated />)}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
