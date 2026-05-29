/**
 * Client-side offline queue for incident submissions.
 *
 * Storage: IndexedDB database `qualitymate`, object store `incidents`.
 * Photos are kept as Blobs inside each queued record so they survive
 * browser restarts.
 *
 * Lifecycle of a queued item:
 *   queued → submitting → submitted (then deleted)
 *                       ↘ failed (kept; retried on next flush)
 */

export type QueueStatus = "queued" | "submitting" | "submitted" | "failed";

export type QueuedIncident = {
  id: string;
  jobId: string | null;
  title: string;
  description: string;
  photos: Array<{ name: string; type: string; blob: Blob }>;
  status: QueueStatus;
  error?: string;
  createdAt: number;
  attempts: number;
};

const DB_NAME = "qualitymate";
const DB_VERSION = 1;
const STORE = "incidents";

export type IDBLike = IDBFactory;

function getFactory(idb?: IDBLike): IDBFactory {
  if (idb) return idb;
  if (typeof indexedDB !== "undefined") return indexedDB;
  throw new Error("IndexedDB unavailable");
}

export function openQueueDb(idb?: IDBLike): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = getFactory(idb).open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("status", "status");
        store.createIndex("createdAt", "createdAt");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `q-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function tx(db: IDBDatabase, mode: IDBTransactionMode): IDBObjectStore {
  return db.transaction(STORE, mode).objectStore(STORE);
}

function done<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export type EnqueueInput = {
  jobId: string | null;
  title: string;
  description: string;
  photos: Array<{ name: string; type: string; blob: Blob }>;
};

export async function enqueue(input: EnqueueInput, idb?: IDBLike): Promise<QueuedIncident> {
  const db = await openQueueDb(idb);
  try {
    const item: QueuedIncident = {
      id: newId(),
      jobId: input.jobId,
      title: input.title,
      description: input.description,
      photos: input.photos,
      status: "queued",
      createdAt: Date.now(),
      attempts: 0,
    };
    await done(tx(db, "readwrite").add(item));
    return item;
  } finally {
    db.close();
  }
}

export async function list(idb?: IDBLike): Promise<QueuedIncident[]> {
  const db = await openQueueDb(idb);
  try {
    const all = await done(tx(db, "readonly").getAll() as IDBRequest<QueuedIncident[]>);
    return all.sort((a, b) => a.createdAt - b.createdAt);
  } finally {
    db.close();
  }
}

export async function listPending(idb?: IDBLike): Promise<QueuedIncident[]> {
  const all = await list(idb);
  // "submitting" items are stale from a previous crashed session — treat as retriable.
  return all.filter((it) => it.status === "queued" || it.status === "failed" || it.status === "submitting");
}

export async function setStatus(
  id: string,
  status: QueueStatus,
  patch: Partial<Pick<QueuedIncident, "error" | "attempts">> = {},
  idb?: IDBLike,
): Promise<QueuedIncident | null> {
  const db = await openQueueDb(idb);
  try {
    const store = tx(db, "readwrite");
    const existing = await done(store.get(id) as IDBRequest<QueuedIncident | undefined>);
    if (!existing) return null;
    const next: QueuedIncident = { ...existing, ...patch, status };
    await done(store.put(next));
    return next;
  } finally {
    db.close();
  }
}

export async function remove(id: string, idb?: IDBLike): Promise<void> {
  const db = await openQueueDb(idb);
  try {
    await done(tx(db, "readwrite").delete(id));
  } finally {
    db.close();
  }
}

export async function clear(idb?: IDBLike): Promise<void> {
  const db = await openQueueDb(idb);
  try {
    await done(tx(db, "readwrite").clear());
  } finally {
    db.close();
  }
}

export type SubmitFn = (item: QueuedIncident) => Promise<Response>;

export type FlushResult = {
  attempted: number;
  submitted: number;
  failed: number;
};

/**
 * Drain pending items by calling `submit` for each. Items are marked
 * `submitting` while in flight, deleted on a 2xx, and marked `failed`
 * with an error message otherwise. A non-2xx HTTP response is treated
 * as failure but does NOT throw — the next flush will retry.
 */
export async function flush(submit: SubmitFn, idb?: IDBLike): Promise<FlushResult> {
  const pending = await listPending(idb);
  let submitted = 0;
  let failed = 0;
  for (const item of pending) {
    await setStatus(item.id, "submitting", { attempts: item.attempts + 1 }, idb);
    try {
      const res = await submit(item);
      if (res.ok) {
        await remove(item.id, idb);
        submitted += 1;
      } else {
        const text = await res.text().catch(() => "");
        await setStatus(
          item.id,
          "failed",
          { error: `HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}` },
          idb,
        );
        failed += 1;
      }
    } catch (err) {
      await setStatus(
        item.id,
        "failed",
        { error: err instanceof Error ? err.message : "Network error" },
        idb,
      );
      failed += 1;
    }
  }
  return { attempted: pending.length, submitted, failed };
}

export function buildIncidentFormData(item: QueuedIncident): FormData {
  const fd = new FormData();
  if (item.jobId) fd.append("jobId", item.jobId);
  fd.append("title", item.title);
  fd.append("description", item.description);
  for (const photo of item.photos) {
    fd.append("photos", new File([photo.blob], photo.name, { type: photo.type }));
  }
  return fd;
}
