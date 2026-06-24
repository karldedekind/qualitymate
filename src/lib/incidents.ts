import { mkdir, writeFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { asc, desc, eq, getTableColumns } from "drizzle-orm";
import { db } from "@/db";
import {
  incidentPhotos,
  incidents,
  jobs,
  registerEntries,
} from "@/db/schema";
import { uploadsRoot } from "@/lib/uploads";

export type Incident = typeof incidents.$inferSelect;
export type IncidentPhoto = typeof incidentPhotos.$inferSelect;
export type RegisterEntry = typeof registerEntries.$inferSelect;

export type IncidentStatus = "pending_review" | "open" | "closed";

const ALLOWED_PHOTO_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".heic"]);
const MAX_PHOTO_BYTES = 25 * 1024 * 1024;
const MAX_WIDTH = 1920;

function newId(): string {
  return randomBytes(12).toString("base64url");
}

const LEGAL_TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
  pending_review: ["open"],
  open: ["closed"],
  closed: [],
};

export function canTransition(from: IncidentStatus, to: IncidentStatus): boolean {
  return LEGAL_TRANSITIONS[from]?.includes(to) ?? false;
}

export type FileIncidentInput = {
  jobId?: string | null;
  filedBy: string;
  title: string;
  description: string;
};

export async function file(input: FileIncidentInput): Promise<Incident> {
  const id = newId();
  const [row] = await db
    .insert(incidents)
    .values({
      id,
      jobId: input.jobId ?? null,
      filedBy: input.filedBy,
      title: input.title.trim(),
      description: input.description.trim(),
    })
    .returning();
  return row;
}

export async function findById(id: string): Promise<Incident | null> {
  const rows = await db.select().from(incidents).where(eq(incidents.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function listMine(userId: string, limit = 100): Promise<Incident[]> {
  return db
    .select()
    .from(incidents)
    .where(eq(incidents.filedBy, userId))
    .orderBy(desc(incidents.createdAt))
    .limit(limit);
}

export async function listByStatus(status: IncidentStatus, limit = 200): Promise<Incident[]> {
  return db
    .select()
    .from(incidents)
    .where(eq(incidents.status, status))
    .orderBy(desc(incidents.createdAt))
    .limit(limit);
}

export type IncidentRow = Incident & { jobNumber: string | null; jobName: string | null };

export async function listByStatusWithJob(status: IncidentStatus, limit = 200): Promise<IncidentRow[]> {
  const rows = await db
    .select({
      ...getTableColumns(incidents),
      jobNumber: jobs.number,
      jobName: jobs.name,
    })
    .from(incidents)
    .leftJoin(jobs, eq(incidents.jobId, jobs.id))
    .where(eq(incidents.status, status))
    .orderBy(desc(incidents.createdAt))
    .limit(limit);
  return rows;
}

export async function photosFor(incidentId: string): Promise<IncidentPhoto[]> {
  return db
    .select()
    .from(incidentPhotos)
    .where(eq(incidentPhotos.incidentId, incidentId))
    .orderBy(asc(incidentPhotos.createdAt));
}

export type TransitionResult =
  | { ok: true; incident: Incident }
  | { ok: false; code: "ILLEGAL_TRANSITION" | "NOT_FOUND"; message: string };

async function transition(
  id: string,
  to: IncidentStatus,
  patch: Partial<typeof incidents.$inferInsert> = {},
): Promise<TransitionResult> {
  const current = await findById(id);
  if (!current) return { ok: false, code: "NOT_FOUND", message: "Incident not found." };
  if (!canTransition(current.status as IncidentStatus, to)) {
    return {
      ok: false,
      code: "ILLEGAL_TRANSITION",
      message: `Cannot move incident from ${current.status} to ${to}.`,
    };
  }
  const [row] = await db
    .update(incidents)
    .set({ ...patch, status: to, updatedAt: new Date() })
    .where(eq(incidents.id, id))
    .returning();
  return { ok: true, incident: row };
}

export async function review(id: string): Promise<TransitionResult> {
  return transition(id, "open");
}

export type CloseResult =
  | { ok: true; incident: Incident; registerEntry: RegisterEntry }
  | { ok: false; code: "ILLEGAL_TRANSITION" | "NOT_FOUND" | "ALREADY_CLOSED"; message: string };

export async function close(
  id: string,
  input: { reason: string; actor: { id: string } },
): Promise<CloseResult> {
  const current = await findById(id);
  if (!current) return { ok: false, code: "NOT_FOUND", message: "Incident not found." };
  if (current.status === "closed") {
    return { ok: false, code: "ALREADY_CLOSED", message: "Incident is already closed." };
  }
  if (!canTransition(current.status as IncidentStatus, "closed")) {
    return {
      ok: false,
      code: "ILLEGAL_TRANSITION",
      message: `Cannot close an incident in status ${current.status}. Move to open first.`,
    };
  }
  const closedAt = new Date();
  const [row] = await db
    .update(incidents)
    .set({
      status: "closed",
      closeReason: input.reason.trim(),
      closedAt,
      closedBy: input.actor.id,
      updatedAt: closedAt,
    })
    .where(eq(incidents.id, id))
    .returning();

  const summary = row.title;
  const [entry] = await db
    .insert(registerEntries)
    .values({
      id: newId(),
      incidentId: id,
      summary,
      closedAt,
      closedBy: input.actor.id,
    })
    .returning();

  return { ok: true, incident: row, registerEntry: entry };
}

export type TriagePatch = {
  priority?: string | null;
  rootCause?: string | null;
  categoryId?: string | null;
};

export async function applyTriage(id: string, patch: TriagePatch): Promise<Incident | null> {
  const next: Partial<typeof incidents.$inferInsert> = { updatedAt: new Date() };
  if (patch.priority !== undefined) next.priority = patch.priority;
  if (patch.rootCause !== undefined) next.rootCause = patch.rootCause;
  if (patch.categoryId !== undefined) next.categoryId = patch.categoryId;

  const [row] = await db.update(incidents).set(next).where(eq(incidents.id, id)).returning();
  return row ?? null;
}

export type AssignJobResult =
  | { ok: true; incident: Incident }
  | { ok: false; code: "NOT_FOUND" | "JOB_ALREADY_SET" | "INVALID_JOB"; message: string };

/**
 * Set an incident's job after the fact — only allowed when no job was captured
 * at recording time. A job specified by site staff is authoritative and cannot
 * be changed here; this just fills the gap when it was left blank.
 */
export async function assignJob(id: string, jobId: string): Promise<AssignJobResult> {
  const current = await findById(id);
  if (!current) return { ok: false, code: "NOT_FOUND", message: "Incident not found." };
  if (current.jobId) {
    return {
      ok: false,
      code: "JOB_ALREADY_SET",
      message: "This incident already has a job, set when it was recorded. It cannot be changed.",
    };
  }

  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (!job || !job.active) {
    return { ok: false, code: "INVALID_JOB", message: "Selected job is not available." };
  }

  const [row] = await db
    .update(incidents)
    .set({ jobId, updatedAt: new Date() })
    .where(eq(incidents.id, id))
    .returning();
  return { ok: true, incident: row };
}

export async function findRegisterEntryByIncident(
  incidentId: string,
): Promise<RegisterEntry | null> {
  const rows = await db
    .select()
    .from(registerEntries)
    .where(eq(registerEntries.incidentId, incidentId))
    .limit(1);
  return rows[0] ?? null;
}

type ResizeResult = {
  buffer: Buffer;
  width: number | null;
  height: number | null;
  takenAt: Date | null;
  ext: string;
};

function parseExifDate(raw: string | undefined): Date | null {
  if (!raw) return null;
  const m = /^(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/.exec(raw);
  if (!m) return null;
  const d = new Date(
    Date.UTC(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      Number(m[4]),
      Number(m[5]),
      Number(m[6]),
    ),
  );
  return isNaN(d.getTime()) ? null : d;
}

function looksLikeHeic(buf: Buffer): boolean {
  // ISO base media file box: bytes 4-8 = "ftyp", bytes 8-12 ∈ heic/heix/hevc/mif1/msf1/heim/heis
  if (buf.length < 12) return false;
  if (buf.toString("ascii", 4, 8) !== "ftyp") return false;
  const brand = buf.toString("ascii", 8, 12);
  return ["heic", "heix", "hevc", "heim", "heis", "mif1", "msf1"].includes(brand);
}

async function decodeHeicToJpeg(input: Buffer): Promise<{ jpeg: Buffer; takenAt: Date | null }> {
  const exifrMod = (await import("exifr")) as unknown as {
    default: { parse: (b: Buffer, opts?: unknown) => Promise<Record<string, unknown> | null> };
    parse?: (b: Buffer, opts?: unknown) => Promise<Record<string, unknown> | null>;
  };
  const exifrParse = exifrMod.default?.parse ?? exifrMod.parse;
  let takenAt: Date | null = null;
  try {
    const exif = exifrParse ? await exifrParse(input, ["DateTimeOriginal", "CreateDate", "DateTime"]) : null;
    const raw = exif?.DateTimeOriginal ?? exif?.CreateDate ?? exif?.DateTime;
    if (raw instanceof Date) takenAt = raw;
    else if (typeof raw === "string") {
      const parsed = parseExifDate(raw) ?? new Date(raw);
      takenAt = isNaN(parsed.getTime()) ? null : parsed;
    }
  } catch {
    // fall through with takenAt=null
  }

  const heicMod = await import("heic-convert");
  const arr = await heicMod.default({ buffer: input, format: "JPEG", quality: 0.88 });
  return { jpeg: Buffer.from(new Uint8Array(arr)), takenAt };
}

async function resizeAndExtract(file: File): Promise<ResizeResult> {
  const sharpMod = (await import("sharp")).default;
  const original = Buffer.from(await file.arrayBuffer());
  let input: Buffer = original;
  let heicTakenAt: Date | null = null;
  let cameFromHeic = false;

  if (looksLikeHeic(original)) {
    const converted = await decodeHeicToJpeg(original);
    input = converted.jpeg;
    heicTakenAt = converted.takenAt;
    cameFromHeic = true;
  }

  const pipeline = sharpMod(input, { failOn: "none" }).rotate();
  const meta = await sharpMod(input, { failOn: "none" }).metadata();
  const takenAt =
    heicTakenAt ??
    parseExifDate(meta.exif ? readExifDate(meta.exif) : undefined) ??
    null;

  const format = meta.format ?? "";
  const isJpeg = format === "jpeg" || cameFromHeic;

  const resized = pipeline
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    .keepExif();

  const out = isJpeg
    ? await resized.jpeg({ quality: 88, mozjpeg: true }).toBuffer({ resolveWithObject: true })
    : await resized.toBuffer({ resolveWithObject: true });

  const ext = isJpeg ? ".jpg" : `.${out.info.format}`;
  return {
    buffer: out.data,
    width: out.info.width ?? null,
    height: out.info.height ?? null,
    takenAt,
    ext,
  };
}

function readExifDate(exifBuffer: Buffer): string | undefined {
  // sharp returns raw EXIF as a Buffer. Cheap scan for ASCII "YYYY:MM:DD HH:MM:SS".
  const text = exifBuffer.toString("latin1");
  const m = /(\d{4}:\d{2}:\d{2}\s\d{2}:\d{2}:\d{2})/.exec(text);
  return m?.[1];
}

export async function attachPhotos(
  incidentId: string,
  files: File[],
): Promise<IncidentPhoto[]> {
  const incident = await findById(incidentId);
  if (!incident) throw new Error("Incident not found");

  const dir = join(uploadsRoot(), "incidents", incidentId);
  await mkdir(dir, { recursive: true });

  const created: IncidentPhoto[] = [];
  for (const f of files) {
    const ext = extname(f.name).toLowerCase();
    if (!ALLOWED_PHOTO_EXT.has(ext)) {
      throw new Error(`Unsupported photo type: ${ext || "(none)"}`);
    }
    if (f.size > MAX_PHOTO_BYTES) {
      throw new Error(`Photo too large: ${(f.size / 1024 / 1024).toFixed(1)} MB. Max 25 MB.`);
    }
    const result = await resizeAndExtract(f);
    const filename = `${randomUUID()}${result.ext}`;
    const fullPath = join(dir, filename);
    await writeFile(fullPath, new Uint8Array(result.buffer));
    const relativePath = `incidents/${incidentId}/${filename}`;

    const [row] = await db
      .insert(incidentPhotos)
      .values({
        id: newId(),
        incidentId,
        path: relativePath,
        originalFilename: f.name,
        width: result.width,
        height: result.height,
        takenAt: result.takenAt,
      })
      .returning();
    created.push(row);
  }

  await db
    .update(incidents)
    .set({ updatedAt: new Date() })
    .where(eq(incidents.id, incidentId));

  return created;
}
