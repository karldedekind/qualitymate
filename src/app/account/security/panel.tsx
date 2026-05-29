"use client";

import { useState } from "react";
import {
  confirmMfaEnrollmentAction,
  disableMfaAction,
  regenerateRecoveryAction,
  startMfaEnrollmentAction,
} from "./actions";
import type { Enrollment } from "@/lib/mfa";

export function SecurityPanel({ enabled }: { enabled: boolean }) {
  const [pending, setPending] = useState<"start" | "confirm" | "disable" | "regen" | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [newRecovery, setNewRecovery] = useState<string[] | null>(null);

  async function onStart() {
    setPending("start");
    setError(null);
    setSuccess(null);
    setNewRecovery(null);
    const r = await startMfaEnrollmentAction();
    setPending(null);
    if ("error" in r) {
      setError(r.error);
      return;
    }
    setEnrollment(r.enrollment);
    // Build a QR data URL client-side via the qrcode package.
    const QRCode = (await import("qrcode")).default;
    const url = await QRCode.toDataURL(r.enrollment.uri, { margin: 1, width: 200 });
    setQrDataUrl(url);
  }

  async function onConfirm(formData: FormData) {
    setPending("confirm");
    setError(null);
    formData.set("code", codeInput);
    const r = await confirmMfaEnrollmentAction(formData);
    setPending(null);
    if (r?.error) {
      setError(r.error);
      return;
    }
    setSuccess("Two-factor authentication is now enabled.");
    setEnrollment(null);
    setQrDataUrl(null);
    if (typeof window !== "undefined") setTimeout(() => window.location.reload(), 800);
  }

  async function onDisable() {
    if (!confirm("Disable two-factor authentication?")) return;
    setPending("disable");
    setError(null);
    const r = await disableMfaAction();
    setPending(null);
    if (r?.ok && typeof window !== "undefined") window.location.reload();
  }

  async function onRegen() {
    if (!confirm("Regenerate recovery codes? Existing codes will stop working.")) return;
    setPending("regen");
    setError(null);
    const r = await regenerateRecoveryAction();
    setPending(null);
    if (r?.ok) setNewRecovery(r.codes);
  }

  if (enabled) {
    return (
      <section className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm space-y-3">
        <h2 className="text-base font-medium">Two-factor authentication</h2>
        <p className="text-sm text-green-700">Enabled.</p>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onRegen}
            disabled={pending !== null}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            {pending === "regen" ? "Generating…" : "Regenerate recovery codes"}
          </button>
          <button
            type="button"
            onClick={onDisable}
            disabled={pending !== null}
            className="rounded-md border border-red-300 text-red-700 px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            {pending === "disable" ? "Disabling…" : "Disable"}
          </button>
        </div>
        {newRecovery && <RecoveryList codes={newRecovery} />}
      </section>
    );
  }

  if (!enrollment) {
    return (
      <section className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm space-y-3">
        <h2 className="text-base font-medium">Two-factor authentication</h2>
        <p className="text-sm text-slate-600">Currently disabled.</p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {success && <p className="text-sm text-green-700">{success}</p>}
        <button
          type="button"
          onClick={onStart}
          disabled={pending !== null}
          className="rounded-md bg-blue-700 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {pending === "start" ? "Generating…" : "Set up two-factor"}
        </button>
      </section>
    );
  }

  return (
    <section className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm space-y-4">
      <h2 className="text-base font-medium">Set up two-factor authentication</h2>
      <ol className="text-sm text-slate-700 list-decimal pl-5 space-y-2">
        <li>Scan the QR code with your authenticator app (Google Authenticator, 1Password, etc.).</li>
        <li>Save the recovery codes below somewhere safe — they replace the app if you lose it.</li>
        <li>Enter the 6-digit code your app shows to confirm setup.</li>
      </ol>

      <div className="grid sm:grid-cols-2 gap-4 items-start">
        <div>
          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrDataUrl} alt="TOTP QR code" className="border border-slate-200 rounded" />
          ) : (
            <div className="text-sm text-slate-500">Generating QR code…</div>
          )}
          <p className="mt-2 text-xs text-slate-500">
            Or enter the secret manually:{" "}
            <span className="font-mono">{enrollment.secret}</span>
          </p>
        </div>
        <RecoveryList codes={enrollment.recoveryCodes} />
      </div>

      <form action={onConfirm} className="space-y-3">
        <label className="block">
          <span className="text-sm text-slate-700 mb-1 block">6-digit code from your app</span>
          <input
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value)}
            className="w-32 rounded-md border border-slate-300 px-3 py-2 font-mono"
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={pending !== null}
          className="rounded-md bg-blue-700 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {pending === "confirm" ? "Confirming…" : "Enable"}
        </button>
      </form>
    </section>
  );
}

function RecoveryList({ codes }: { codes: string[] }) {
  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
      <p className="font-medium text-amber-800 mb-1">Recovery codes (shown once)</p>
      <ul className="grid grid-cols-2 gap-x-3 font-mono text-xs">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
    </div>
  );
}
