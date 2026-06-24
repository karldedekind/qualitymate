"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import SignaturePad from "signature_pad";
import { submitCheckInAction } from "./actions";

type JobOption = { id: string; number: string; name: string };
type Declaration = { name: string; label: string };

export function CheckInForm({
  jobs,
  trades,
  declarations,
  selectedJobId = "",
}: {
  jobs: JobOption[];
  trades: string[];
  declarations: Declaration[];
  selectedJobId?: string;
}) {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const padRef = useRef<SignaturePad | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [declState, setDeclState] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(declarations.map((d) => [d.name, false])),
  );
  const [consent, setConsent] = useState(false);
  const [signatureDrawn, setSignatureDrawn] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    function resize() {
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      if (!canvas) return;
      canvas.width = canvas.offsetWidth * ratio;
      canvas.height = canvas.offsetHeight * ratio;
      canvas.getContext("2d")?.scale(ratio, ratio);
      padRef.current?.clear();
      setSignatureDrawn(false);
    }
    const pad = new SignaturePad(canvas, { backgroundColor: "rgb(255,255,255)" });
    pad.addEventListener("endStroke", () => setSignatureDrawn(!pad.isEmpty()));
    padRef.current = pad;
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  function clearSignature() {
    padRef.current?.clear();
    setSignatureDrawn(false);
  }

  const allDeclared = declarations.every((d) => declState[d.name]);
  const canSubmit = allDeclared && consent && signatureDrawn && !pending;

  async function onSubmit(formData: FormData) {
    setError(null);
    const pad = padRef.current;
    if (!pad || pad.isEmpty()) {
      setError("Please draw your signature.");
      return;
    }
    formData.set("signature", pad.toDataURL("image/png"));
    const planned = formData.get("plannedDeparture");
    if (typeof planned === "string" && planned.length > 0) {
      const d = new Date(planned);
      if (!isNaN(d.getTime())) formData.set("plannedDeparture", d.toISOString());
    }
    setPending(true);
    const result = await submitCheckInAction(formData);
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    router.push("/checkin/thanks");
  }

  return (
    <form action={onSubmit} className="space-y-6">
      <section className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-slate-700 mb-1 block">Job site</span>
          <select
            name="jobId"
            required
            defaultValue={selectedJobId}
            className="w-full rounded-md border border-slate-300 px-3 py-2"
          >
            <option value="" disabled>Select a job…</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.number} — {j.name}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm space-y-4">
        <h2 className="text-base font-medium">About you</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm text-slate-700 mb-1 block">Full name</span>
            <input name="fullName" required className="w-full rounded-md border border-slate-300 px-3 py-2" />
          </label>
          <label className="block">
            <span className="text-sm text-slate-700 mb-1 block">Mobile</span>
            <input name="mobile" type="tel" required className="w-full rounded-md border border-slate-300 px-3 py-2" />
          </label>
          <label className="block">
            <span className="text-sm text-slate-700 mb-1 block">Company</span>
            <input name="companyName" required className="w-full rounded-md border border-slate-300 px-3 py-2" />
          </label>
          <label className="block">
            <span className="text-sm text-slate-700 mb-1 block">Trade</span>
            <select name="trade" required defaultValue="" className="w-full rounded-md border border-slate-300 px-3 py-2">
              <option value="" disabled>Select trade…</option>
              {trades.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm space-y-4">
        <h2 className="text-base font-medium">Emergency contact</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm text-slate-700 mb-1 block">Name</span>
            <input name="emergencyContactName" required className="w-full rounded-md border border-slate-300 px-3 py-2" />
          </label>
          <label className="block">
            <span className="text-sm text-slate-700 mb-1 block">Phone</span>
            <input name="emergencyContactPhone" type="tel" required className="w-full rounded-md border border-slate-300 px-3 py-2" />
          </label>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm space-y-4">
        <h2 className="text-base font-medium">White card</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm text-slate-700 mb-1 block">Card number</span>
            <input name="whiteCardNumber" required className="w-full rounded-md border border-slate-300 px-3 py-2" />
          </label>
          <label className="block">
            <span className="text-sm text-slate-700 mb-1 block">Expiry</span>
            <input name="whiteCardExpiry" type="date" required className="w-full rounded-md border border-slate-300 px-3 py-2" />
          </label>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm space-y-4">
        <h2 className="text-base font-medium">Planned departure</h2>
        <label className="block">
          <span className="text-sm text-slate-700 mb-1 block">When do you plan to leave site today?</span>
          <input
            name="plannedDeparture"
            type="datetime-local"
            required
            className="w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
      </section>

      <section className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm space-y-3">
        <h2 className="text-base font-medium">Declarations</h2>
        <p className="text-xs text-slate-500">All declarations are required.</p>
        <ul className="space-y-2">
          {declarations.map((d) => (
            <li key={d.name}>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  name={d.name}
                  className="mt-0.5"
                  checked={!!declState[d.name]}
                  onChange={(e) =>
                    setDeclState((s) => ({ ...s, [d.name]: e.target.checked }))
                  }
                />
                <span>{d.label}</span>
              </label>
            </li>
          ))}
        </ul>
      </section>

      <section className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm space-y-3">
        <h2 className="text-base font-medium">Privacy &amp; consent</h2>
        <p className="text-xs text-slate-600">
          Your details are recorded for site safety, WHS compliance, and emergency response.
          Records are retained for 7 years per Australian WHS record-keeping requirements and
          accessible to the site operator and authorised auditors only.
        </p>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="consent"
            className="mt-0.5"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          <span>I consent to my information being recorded and used as described above.</span>
        </label>
      </section>

      <section className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium">Signature</h2>
          <button type="button" onClick={clearSignature} className="text-sm text-blue-700 hover:underline">
            Clear
          </button>
        </div>
        <div className="border border-slate-300 rounded-md bg-white">
          <canvas
            ref={canvasRef}
            className="w-full h-40 touch-none rounded-md"
            aria-label="Draw your signature"
          />
        </div>
        <p className="text-xs text-slate-500">Sign with your finger or stylus.</p>
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {!canSubmit && !pending && (
        <p className="text-xs text-slate-500">
          Tick all declarations, give consent, and draw your signature to enable sign-in.
        </p>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full rounded-md bg-blue-700 text-white px-4 py-3 font-medium disabled:opacity-50"
      >
        {pending ? "Submitting…" : "Sign in"}
      </button>
    </form>
  );
}
