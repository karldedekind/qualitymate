"use client";

import { useRef, useState } from "react";
import type { Branding } from "@/lib/branding";
import { saveBrandingAction } from "./actions";

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function BrandingForm({ initial }: { initial: Branding }) {
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, setPending] = useState(false);
  const [color, setColor] = useState(initial.primaryColor);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoName, setLogoName] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    setOk(false);
    if (!HEX_RE.test(color)) {
      setPending(false);
      setError("Primary colour must be a 6-digit hex like #ff6600.");
      return;
    }
    formData.set("primaryColor", color);
    const result = await saveBrandingAction(formData);
    setPending(false);
    if (result?.error) setError(result.error);
    else setOk(true);
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      setLogoPreview(null);
      setLogoName(null);
      return;
    }
    setLogoName(file.name);
    const reader = new FileReader();
    reader.onload = () => setLogoPreview(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(file);
  }

  return (
    <form action={onSubmit} className="space-y-4">
      <Field label="Company name" name="companyName" defaultValue={initial.companyName} required />
      <Field label="Short name" name="companyShortName" defaultValue={initial.companyShortName} required />

      <div>
        <span className="text-sm text-slate-700 mb-1 block">Primary colour</span>
        <div className="flex items-center gap-3">
          <input
            type="color"
            aria-label="Primary colour swatch"
            value={HEX_RE.test(color) ? color : "#000000"}
            onChange={(e) => setColor(e.target.value)}
            className="h-10 w-14 rounded-md border border-slate-300 cursor-pointer p-0"
          />
          <input
            type="text"
            inputMode="text"
            spellCheck={false}
            value={color}
            onChange={(e) => setColor(e.target.value.trim())}
            placeholder="#1e40af"
            className="w-32 font-mono rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
          <span
            className="inline-block h-10 flex-1 max-w-[12rem] rounded-md border border-slate-300"
            style={{ backgroundColor: HEX_RE.test(color) ? color : "transparent" }}
            aria-hidden
          />
        </div>
        <p className="mt-1 text-xs text-slate-500">Click swatch for picker, or type a hex value.</p>
      </div>

      <div>
        <span className="text-sm text-slate-700 mb-1 block">Logo</span>
        <input
          ref={fileRef}
          name="logo"
          type="file"
          accept="image/png,image/jpeg,image/svg+xml,image/webp"
          onChange={onFileChange}
          className="sr-only"
          id="branding-logo-input"
        />
        <label
          htmlFor="branding-logo-input"
          className="flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-6 cursor-pointer hover:border-slate-400 hover:bg-slate-100 transition"
        >
          {logoPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoPreview} alt="new logo preview" className="h-16 w-auto" />
          ) : initial.logoPath ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/uploads/${initial.logoPath}`} alt="current logo" className="h-16 w-auto" />
          ) : (
            <div className="text-3xl text-slate-400" aria-hidden>+</div>
          )}
          <span className="text-sm text-slate-700">
            {logoName ? `Selected: ${logoName}` : initial.logoPath ? "Click to replace logo" : "Click to upload logo"}
          </span>
          <span className="text-xs text-slate-500">PNG, JPG, SVG or WebP — max 5 MB</span>
        </label>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {ok && <p className="text-sm text-green-700">Saved.</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-blue-700 text-white px-4 py-2 font-medium disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save branding"}
      </button>
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  defaultValue,
  required,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm text-slate-700 mb-1 block">{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
        className="w-full rounded-md border border-slate-300 px-3 py-2"
      />
    </label>
  );
}
