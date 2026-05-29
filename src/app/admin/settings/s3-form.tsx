"use client";

import { useState } from "react";
import { saveS3SettingsAction, testS3PushAction } from "../backups/actions";

export type S3Initial = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  prefix: string;
  forcePathStyle: boolean;
  hasSecret: boolean;
};

export function S3Form({ initial }: { initial: S3Initial }) {
  const [pending, setPending] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function onSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    setOk(null);
    const result = await saveS3SettingsAction(formData);
    setPending(false);
    if (result?.error) setError(result.error);
    else setOk("Saved.");
  }

  async function onTest() {
    setTesting(true);
    setError(null);
    setOk(null);
    const result = await testS3PushAction();
    setTesting(false);
    if (result?.error) setError(result.error);
    else if (result?.ok) setOk(`Test push ok (${result.key}).`);
  }

  return (
    <form action={onSubmit} className="space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <Field name="endpoint" label="Endpoint" defaultValue={initial.endpoint} placeholder="https://s3.amazonaws.com" />
        <Field name="region" label="Region" defaultValue={initial.region} placeholder="us-east-1" />
        <Field name="bucket" label="Bucket" defaultValue={initial.bucket} />
        <Field name="prefix" label="Key prefix" defaultValue={initial.prefix} placeholder="qualitymate/" />
        <Field name="accessKeyId" label="Access key ID" defaultValue={initial.accessKeyId} />
        <SecretField
          name="secretAccessKey"
          label="Secret access key"
          hasExisting={initial.hasSecret}
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="forcePathStyle"
          value="true"
          defaultChecked={initial.forcePathStyle}
        />
        Force path-style addressing (required for MinIO and most non-AWS endpoints)
      </label>
      <input type="hidden" name="forcePathStyle" value="false" />

      {error && <p className="text-sm text-red-600">{error}</p>}
      {ok && <p className="text-sm text-green-700">{ok}</p>}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-blue-700 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={onTest}
          disabled={testing}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {testing ? "Testing…" : "Test push"}
        </button>
      </div>
    </form>
  );
}

function Field({
  name,
  label,
  defaultValue,
  placeholder,
}: {
  name: string;
  label: string;
  defaultValue: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm text-slate-700 mb-1 block">{label}</span>
      <input
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono"
      />
    </label>
  );
}

function SecretField({
  name,
  label,
  hasExisting,
}: {
  name: string;
  label: string;
  hasExisting: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm text-slate-700 mb-1 block">
        {label}{" "}
        {hasExisting && (
          <span className="text-xs text-slate-500">(stored — leave blank to keep)</span>
        )}
      </span>
      <input
        name={name}
        type="password"
        autoComplete="off"
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono"
      />
    </label>
  );
}
