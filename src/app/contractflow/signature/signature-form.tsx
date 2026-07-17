"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import SignaturePad from "signature_pad";
import { saveSignatureAction } from "../actions";

export function SignatureForm({ hasExisting }: { hasExisting: boolean }) {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePad | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    canvas.getContext("2d")?.scale(ratio, ratio);
    padRef.current = new SignaturePad(canvas, { backgroundColor: "rgb(255,255,255)" });
    return () => padRef.current?.off();
  }, []);

  async function onSave() {
    const pad = padRef.current;
    if (!pad || pad.isEmpty()) {
      setError("Draw a signature first.");
      return;
    }
    setPending(true);
    setError(null);
    setSaved(false);
    const fd = new FormData();
    fd.set("signature", pad.toDataURL("image/png"));
    const result = await saveSignatureAction(fd);
    setPending(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    setSaved(true);
    padRef.current?.clear();
    router.refresh();
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <canvas
        ref={canvasRef}
        className="h-40 w-full rounded border border-dashed border-slate-300"
      />
      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={onSave}
          disabled={pending}
          className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? "Saving…" : hasExisting ? "Replace signature" : "Save signature"}
        </button>
        <button
          onClick={() => padRef.current?.clear()}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
        >
          Clear
        </button>
        {saved && <span className="text-sm text-green-700">Saved.</span>}
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
