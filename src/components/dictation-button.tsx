"use client";

import { useEffect, useRef, useState } from "react";
import {
  extractTranscripts,
  getSpeechRecognitionCtor,
  joinTranscript,
  type SpeechRecognitionLike,
} from "@/lib/dictation";

type Props = {
  targetRef: React.RefObject<HTMLTextAreaElement | null>;
  lang?: string;
};

export function DictationButton({ targetRef, lang = "en-AU" }: Props) {
  const [supported, setSupported] = useState(false);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const baseRef = useRef<string>("");
  const finalRef = useRef<string>("");

  useEffect(() => {
    setSupported(Boolean(getSpeechRecognitionCtor()));
  }, []);

  useEffect(() => {
    return () => {
      try {
        recRef.current?.abort();
      } catch {}
    };
  }, []);

  function fireInput(value: string) {
    const el = targetRef.current;
    if (!el) return;
    el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function start() {
    const Ctor = getSpeechRecognitionCtor();
    const target = targetRef.current;
    if (!Ctor || !target) return;
    setError(null);

    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;

    baseRef.current = target.value;
    finalRef.current = "";

    rec.onresult = (event) => {
      const { final, interim } = extractTranscripts(event);
      if (final) finalRef.current = joinTranscript(finalRef.current, final);
      const merged = joinTranscript(
        joinTranscript(baseRef.current, finalRef.current),
        interim,
      );
      fireInput(merged);
    };
    rec.onerror = (e) => {
      setError(e.error || "Dictation error");
    };
    rec.onend = () => {
      if (finalRef.current) {
        fireInput(joinTranscript(baseRef.current, finalRef.current));
      }
      setActive(false);
      recRef.current = null;
    };

    try {
      rec.start();
      recRef.current = rec;
      setActive(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start dictation");
    }
  }

  function stop() {
    try {
      recRef.current?.stop();
    } catch {}
  }

  if (!supported) return null;

  return (
    <div className="mt-1 flex items-center gap-2">
      <button
        type="button"
        onClick={active ? stop : start}
        aria-pressed={active}
        aria-label={active ? "Stop dictation" : "Start dictation"}
        className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium ${
          active
            ? "bg-red-600 text-white"
            : "bg-slate-100 text-slate-800 hover:bg-slate-200"
        }`}
      >
        <span aria-hidden>{active ? "■" : "🎤"}</span>
        <span>{active ? "Stop dictation" : "Dictate"}</span>
      </button>
      {active && (
        <span className="text-xs text-slate-600">Listening…</span>
      )}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
