"use client";

import { useState, useTransition } from "react";
import {
  setRoleAction,
  deactivateUserAction,
  reactivateUserAction,
  adminResetPasswordAction,
} from "./actions";

type UserShape = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "site_staff";
  createdAt: Date;
  deactivatedAt: Date | null;
};

export function UserRow({ user, deactivated = false }: { user: UserShape; deactivated?: boolean }) {
  const [, startTransition] = useTransition();
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function changeRole(role: "admin" | "site_staff") {
    setError(null);
    const fd = new FormData();
    fd.set("userId", user.id);
    fd.set("role", role);
    const result = await setRoleAction(fd);
    if (result?.error) setError(result.error);
  }

  async function deactivate() {
    if (!confirm(`Deactivate ${user.email}? They will be signed out and unable to log in.`)) return;
    const fd = new FormData();
    fd.set("userId", user.id);
    startTransition(async () => {
      const result = await deactivateUserAction(fd);
      if (result?.error) setError(result.error);
    });
  }

  async function reactivate() {
    const fd = new FormData();
    fd.set("userId", user.id);
    startTransition(async () => {
      const result = await reactivateUserAction(fd);
      if (result?.error) setError(result.error);
    });
  }

  async function reset() {
    if (!confirm(`Reset password for ${user.email}? Existing sessions will be invalidated.`)) return;
    const fd = new FormData();
    fd.set("userId", user.id);
    const result = await adminResetPasswordAction(fd);
    if (result?.error) setError(result.error);
    else if (result?.tempPassword) setTempPassword(result.tempPassword);
  }

  if (deactivated) {
    return (
      <tr className="border-t border-slate-100">
        <td className="px-3 py-2">{user.email}</td>
        <td className="px-3 py-2">{user.name}</td>
        <td className="px-3 py-2 font-mono text-xs">
          {user.deactivatedAt?.toISOString().slice(0, 10) ?? "—"}
        </td>
        <td className="px-3 py-2 text-right">
          <button onClick={reactivate} className="text-blue-700 underline text-sm">
            Reactivate
          </button>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-t border-slate-100">
      <td className="px-3 py-2">{user.email}</td>
      <td className="px-3 py-2">{user.name}</td>
      <td className="px-3 py-2">
        <select
          value={user.role}
          onChange={(e) => changeRole(e.target.value as "admin" | "site_staff")}
          className="rounded border border-slate-300 px-2 py-1 text-sm"
        >
          <option value="site_staff">site_staff</option>
          <option value="admin">admin</option>
        </select>
      </td>
      <td className="px-3 py-2 font-mono text-xs">
        {user.createdAt.toISOString().slice(0, 10)}
      </td>
      <td className="px-3 py-2 text-right">
        <div className="flex flex-col items-end gap-1">
          <div className="flex gap-3">
            <button onClick={reset} className="text-blue-700 underline text-sm">
              Reset password
            </button>
            <button onClick={deactivate} className="text-red-700 underline text-sm">
              Deactivate
            </button>
          </div>
          {tempPassword && (
            <div className="text-xs bg-yellow-50 border border-yellow-300 rounded px-2 py-1">
              Temp password:{" "}
              <code className="font-mono">{tempPassword}</code>
            </div>
          )}
          {error && <div className="text-xs text-red-600">{error}</div>}
        </div>
      </td>
    </tr>
  );
}
