"use client";

import { useState } from "react";
import { saveSmtpAction, testSmtpAction } from "./actions";

type Props = {
  initial: {
    host: string;
    port: string;
    user: string;
    fromEmail: string;
    secure: boolean;
    hasPassword: boolean;
  };
  testTo: string;
};

export function SmtpForm({ initial, testTo }: Props) {
  const [pending, setPending] = useState(false);
  const [testPending, setTestPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  async function onSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    setOk(false);
    const result = await saveSmtpAction(formData);
    setPending(false);
    if (result?.error) setError(result.error);
    else setOk(true);
  }

  async function onTest() {
    setTestPending(true);
    setTestResult(null);
    const result = await testSmtpAction();
    setTestPending(false);
    if (result?.error) setTestResult(`Failed: ${result.error}`);
    else setTestResult(`Sent test email to ${testTo}.`);
  }

  return (
    <div className="space-y-4">
      <form action={onSubmit} className="space-y-4" autoComplete="off">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Host" name="host" defaultValue={initial.host} required autoComplete="off" />
          <Field label="Port" name="port" type="number" defaultValue={initial.port} required autoComplete="off" />
          <Field label="Username" name="user" defaultValue={initial.user} autoComplete="off" />
          <Field
            label={`Password${initial.hasPassword ? " (leave blank to keep)" : ""}`}
            name="password"
            type="password"
            defaultValue=""
            autoComplete="new-password"
          />
          <Field label="From email" name="fromEmail" type="email" defaultValue={initial.fromEmail} required autoComplete="off" />
          <label className="block">
            <span className="text-sm text-slate-700 mb-1 block">Secure</span>
            <select
              name="secure"
              defaultValue={initial.secure ? "true" : "false"}
              className="w-full rounded-md border border-slate-300 px-3 py-2"
            >
              <option value="false">STARTTLS (port 587)</option>
              <option value="true">TLS (port 465)</option>
            </select>
          </label>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {ok && <p className="text-sm text-green-700">Saved.</p>}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-blue-700 text-white px-4 py-2 font-medium disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save SMTP"}
          </button>
          <button
            type="button"
            onClick={onTest}
            disabled={testPending}
            className="rounded-md bg-slate-700 text-white px-4 py-2 font-medium disabled:opacity-50"
          >
            {testPending ? "Sending…" : `Send test email to ${testTo}`}
          </button>
        </div>
      </form>
      {testResult && (
        <p
          className={`text-sm ${testResult.startsWith("Failed") ? "text-red-600" : "text-green-700"}`}
        >
          {testResult}
        </p>
      )}
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
  defaultValue,
  required,
  autoComplete,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  required?: boolean;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm text-slate-700 mb-1 block">{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
        autoComplete={autoComplete}
        className="w-full rounded-md border border-slate-300 px-3 py-2"
      />
    </label>
  );
}
