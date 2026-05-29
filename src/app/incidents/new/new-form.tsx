"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  buildIncidentFormData,
  enqueue,
  flush,
  list,
  type QueuedIncident,
} from "@/lib/offline-queue";
import { DictationButton } from "@/components/dictation-button";

type JobOption = { id: string; number: string; name: string };

type FlightStatus =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "submitted"; offline: boolean; id: string }
  | { kind: "failed"; message: string };

async function postIncident(item: QueuedIncident): Promise<Response> {
  return fetch("/api/incidents", {
    method: "POST",
    body: buildIncidentFormData(item),
    credentials: "same-origin",
  });
}

export function NewIncidentForm({ jobs }: { jobs: JobOption[] }) {
  const router = useRouter();
  const [status, setStatus] = useState<FlightStatus>({ kind: "idle" });
  const [queue, setQueue] = useState<QueuedIncident[]>([]);
  const [photos, setPhotos] = useState<File[]>([]);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const flushingRef = useRef(false);

  function addFiles(input: HTMLInputElement | null) {
    if (!input || !input.files) return;
    const next = Array.from(input.files);
    setPhotos((prev) => [...prev, ...next]);
    input.value = "";
  }

  function removePhoto(index: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  async function refreshQueue() {
    try {
      const items = await list();
      setQueue(items);
    } catch {}
  }

  async function tryFlush() {
    if (flushingRef.current) return;
    flushingRef.current = true;
    try {
      await flush(postIncident);
    } finally {
      flushingRef.current = false;
      await refreshQueue();
    }
  }

  useEffect(() => {
    refreshQueue();
    const onOnline = () => tryFlush();
    window.addEventListener("online", onOnline);
    if (navigator.onLine) tryFlush();

    // DevTools throttling doesn't fire online event — poll as fallback.
    const interval = setInterval(() => {
      if (navigator.onLine) tryFlush();
    }, 15_000);

    return () => {
      window.removeEventListener("online", onOnline);
      clearInterval(interval);
    };
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const jobId = (fd.get("jobId") as string) || null;
    const title = ((fd.get("title") as string) || "").trim();
    const description = ((fd.get("description") as string) || "").trim();
    if (title.length < 3 || description.length < 3) {
      setStatus({ kind: "failed", message: "Title and description are required." });
      return;
    }
    const photoPayload = photos.map((f) => ({ name: f.name, type: f.type, blob: f }));

    setStatus({ kind: "submitting" });

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      const item = await enqueue({ jobId, title, description, photos: photoPayload });
      await refreshQueue();
      setStatus({ kind: "submitted", offline: true, id: item.id });
      form.reset();
      setPhotos([]);
      return;
    }

    try {
      const fdSend = new FormData();
      if (jobId) fdSend.append("jobId", jobId);
      fdSend.append("title", title);
      fdSend.append("description", description);
      for (const p of photoPayload) fdSend.append("photos", new File([p.blob], p.name, { type: p.type }));
      const res = await fetch("/api/incidents", {
        method: "POST",
        body: fdSend,
        credentials: "same-origin",
      });
      if (res.ok) {
        const json = (await res.json()) as { id: string; photoCount?: number; photoError?: string | null };
        if (json.photoError) {
          setStatus({ kind: "failed", message: `Incident saved but photos failed: ${json.photoError}` });
          return;
        }
        setStatus({ kind: "submitted", offline: false, id: json.id });
        form.reset();
        setPhotos([]);
        router.push("/incidents/mine");
        return;
      }
      const text = await res.text().catch(() => "");
      throw new Error(text || `HTTP ${res.status}`);
    } catch (err) {
      // Online attempt failed (e.g. flaky network). Queue it.
      const item = await enqueue({ jobId, title, description, photos: photoPayload });
      await refreshQueue();
      setStatus({ kind: "submitted", offline: true, id: item.id });
      form.reset();
      setPhotos([]);
      // Best-effort retry shortly after; will no-op if still down.
      setTimeout(() => {
        tryFlush();
      }, 2000);
      void err;
    }
  }

  return (
    <div className="space-y-4">
      <form ref={formRef} onSubmit={onSubmit} className="space-y-4">
        <label className="block">
          <span className="text-sm text-slate-700 mb-1 block">Job (optional)</span>
          <select
            name="jobId"
            defaultValue=""
            className="w-full rounded-md border border-slate-300 px-3 py-2"
          >
            <option value="">— Not job-specific —</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.number} — {j.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm text-slate-700 mb-1 block">Title</span>
          <input
            name="title"
            required
            maxLength={200}
            placeholder="Short description"
            className="w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>

        <label className="block">
          <span className="text-sm text-slate-700 mb-1 block">Description</span>
          <textarea
            ref={descriptionRef}
            name="description"
            required
            rows={5}
            maxLength={5000}
            placeholder="What happened, what was affected, what action did you take?"
            className="w-full rounded-md border border-slate-300 px-3 py-2"
          />
          <DictationButton targetRef={descriptionRef} />
        </label>

        <div className="block">
          <span className="text-sm text-slate-700 mb-1 block">Photos</span>
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={() => addFiles(cameraRef.current)}
          />
          <input
            ref={galleryRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={() => addFiles(galleryRef.current)}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
            >
              Take photo
            </button>
            <button
              type="button"
              onClick={() => galleryRef.current?.click()}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
            >
              Add from gallery
            </button>
          </div>
          {photos.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm">
              {photos.map((p, i) => (
                <li
                  key={`${p.name}-${i}`}
                  className="flex items-center justify-between gap-2 rounded border border-slate-200 bg-slate-50 px-2 py-1"
                >
                  <span className="truncate">{p.name}</span>
                  <button
                    type="button"
                    onClick={() => removePhoto(i)}
                    className="text-xs text-red-700 hover:underline"
                    aria-label={`Remove ${p.name}`}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          <span className="text-xs text-slate-500 mt-1 block">
            Multiple OK. JPEG/PNG/WebP/HEIC. Resized to 1920px wide on upload.
          </span>
        </div>

        {status.kind === "failed" && (
          <p className="text-sm text-red-600">{status.message}</p>
        )}
        {status.kind === "submitted" && status.offline && (
          <p className="text-sm text-amber-700">
            Saved on this device. Will sync when you&apos;re back online.
          </p>
        )}
        {status.kind === "submitted" && !status.offline && (
          <p className="text-sm text-green-700">Submitted.</p>
        )}

        <button
          type="submit"
          disabled={status.kind === "submitting"}
          className="rounded-md bg-blue-700 text-white px-4 py-2 font-medium disabled:opacity-50"
        >
          {status.kind === "submitting" ? "Submitting…" : "Submit incident"}
        </button>
      </form>

      {queue.length > 0 && (
        <section className="rounded-md border border-slate-200 bg-slate-50 p-4">
          <header className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold">On-device queue</h2>
            <button
              type="button"
              onClick={tryFlush}
              className="text-xs text-blue-700 hover:underline"
            >
              Try sync now
            </button>
          </header>
          <ul className="space-y-1 text-sm">
            {queue.map((q) => (
              <li key={q.id} className="flex items-center justify-between gap-2">
                <span className="truncate">{q.title}</span>
                <StatusPill status={q.status} error={q.error} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function StatusPill({ status, error }: { status: QueuedIncident["status"]; error?: string }) {
  const styles: Record<QueuedIncident["status"], string> = {
    queued: "bg-amber-100 text-amber-800",
    submitting: "bg-blue-100 text-blue-800",
    submitted: "bg-green-100 text-green-800",
    failed: "bg-red-100 text-red-800",
  };
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded ${styles[status]}`}
      title={error ?? undefined}
    >
      {status}
    </span>
  );
}
