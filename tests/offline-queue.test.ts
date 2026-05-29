import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import {
  buildIncidentFormData,
  enqueue,
  flush,
  list,
  listPending,
  remove,
  setStatus,
  type QueuedIncident,
} from "@/lib/offline-queue";

let idb: IDBFactory;

beforeEach(() => {
  idb = new IDBFactory();
});

function blobOf(text: string) {
  return new Blob([text], { type: "text/plain" });
}

describe("OfflineQueue — enqueue + list survives restart", () => {
  it("persists queued items across new factory connections", async () => {
    const item = await enqueue(
      {
        jobId: null,
        title: "Test",
        description: "desc",
        photos: [{ name: "a.txt", type: "text/plain", blob: blobOf("hello") }],
      },
      idb,
    );
    expect(item.status).toBe("queued");

    // Same factory — items still there.
    const all = await list(idb);
    expect(all).toHaveLength(1);
    expect(all[0]!.id).toBe(item.id);
    expect(all[0]!.photos[0]!.name).toBe("a.txt");
  });
});

describe("OfflineQueue — flush success path", () => {
  it("submits each item then deletes it on 2xx", async () => {
    await enqueue({ jobId: null, title: "A", description: "x", photos: [] }, idb);
    await enqueue({ jobId: "job-1", title: "B", description: "y", photos: [] }, idb);

    const calls: QueuedIncident[] = [];
    const result = await flush(async (item) => {
      calls.push(item);
      return new Response(JSON.stringify({ id: "srv-" + item.id }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }, idb);

    expect(result).toEqual({ attempted: 2, submitted: 2, failed: 0 });
    expect(calls).toHaveLength(2);
    const remaining = await list(idb);
    expect(remaining).toHaveLength(0);
  });
});

describe("OfflineQueue — flush keeps failed items for retry", () => {
  it("marks items failed on non-2xx and retries them on the next flush", async () => {
    const item = await enqueue(
      { jobId: null, title: "Retry me", description: "x", photos: [] },
      idb,
    );

    let calls = 0;
    const flaky = async () => {
      calls += 1;
      if (calls === 1) return new Response("upstream down", { status: 503 });
      return new Response("{}", { status: 200 });
    };

    const r1 = await flush(flaky, idb);
    expect(r1).toEqual({ attempted: 1, submitted: 0, failed: 1 });
    const afterFail = await list(idb);
    expect(afterFail).toHaveLength(1);
    expect(afterFail[0]!.status).toBe("failed");
    expect(afterFail[0]!.attempts).toBe(1);
    expect(afterFail[0]!.error).toContain("503");

    const pending = await listPending(idb);
    expect(pending).toHaveLength(1);
    expect(pending[0]!.id).toBe(item.id);

    const r2 = await flush(flaky, idb);
    expect(r2).toEqual({ attempted: 1, submitted: 1, failed: 0 });
    expect(await list(idb)).toHaveLength(0);
  });

  it("marks items failed when submit throws (network error)", async () => {
    await enqueue({ jobId: null, title: "Err", description: "x", photos: [] }, idb);
    const r = await flush(async () => {
      throw new Error("Network down");
    }, idb);
    expect(r).toEqual({ attempted: 1, submitted: 0, failed: 1 });
    const all = await list(idb);
    expect(all[0]!.status).toBe("failed");
    expect(all[0]!.error).toBe("Network down");
  });
});

describe("OfflineQueue — setStatus + remove", () => {
  it("updates status fields and supports manual removal", async () => {
    const item = await enqueue(
      { jobId: null, title: "Manual", description: "x", photos: [] },
      idb,
    );
    const updated = await setStatus(item.id, "submitting", { attempts: 5 }, idb);
    expect(updated?.status).toBe("submitting");
    expect(updated?.attempts).toBe(5);
    await remove(item.id, idb);
    expect(await list(idb)).toHaveLength(0);
  });
});

describe("buildIncidentFormData", () => {
  it("includes title/description and photos; omits empty jobId", async () => {
    const item: QueuedIncident = {
      id: "x",
      jobId: null,
      title: "T",
      description: "D",
      photos: [{ name: "p.jpg", type: "image/jpeg", blob: blobOf("img") }],
      status: "queued",
      createdAt: 0,
      attempts: 0,
    };
    const fd = buildIncidentFormData(item);
    expect(fd.get("title")).toBe("T");
    expect(fd.get("description")).toBe("D");
    expect(fd.get("jobId")).toBeNull();
    const photo = fd.get("photos");
    expect(photo).toBeInstanceOf(File);
    expect((photo as File).name).toBe("p.jpg");
  });

  it("includes jobId when set", () => {
    const item: QueuedIncident = {
      id: "x",
      jobId: "job-9",
      title: "T",
      description: "D",
      photos: [],
      status: "queued",
      createdAt: 0,
      attempts: 0,
    };
    expect(buildIncidentFormData(item).get("jobId")).toBe("job-9");
  });
});
