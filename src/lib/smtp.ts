import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import nodemailer, { type Transporter } from "nodemailer";
import { get } from "@/lib/settings";

const E2E_OUTBOX_DIR = process.env.E2E_OUTBOX_DIR || "./e2e/outbox";

export type SmtpConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  fromEmail: string;
  secure: boolean;
};

let testTransport: Transporter | null = null;

export function _setTransportForTests(t: Transporter | null): void {
  testTransport = t;
}

export async function readSmtpConfig(): Promise<SmtpConfig | null> {
  const [host, port, user, password, fromEmail, secure] = await Promise.all([
    get("smtp.host"),
    get("smtp.port"),
    get("smtp.user"),
    get("smtp.password"),
    get("smtp.from_email"),
    get("smtp.secure"),
  ]);
  if (!host || !port || !fromEmail) return null;
  return {
    host,
    port: Number(port),
    user: user ?? "",
    password: password ?? "",
    fromEmail,
    secure: secure === "true",
  };
}

export async function isConfigured(): Promise<boolean> {
  if (process.env.E2E === "1") return true;
  return (await readSmtpConfig()) !== null;
}

async function getTransport(): Promise<{ transport: Transporter; from: string } | null> {
  if (testTransport) {
    return {
      transport: testTransport,
      from: (await get("smtp.from_email")) ?? "noreply@qualitymate.local",
    };
  }
  const cfg = await readSmtpConfig();
  if (!cfg) return null;
  const auth = cfg.user ? { user: cfg.user, pass: cfg.password } : undefined;
  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth,
  });
  return { transport, from: cfg.fromEmail };
}

export type MailAttachment = {
  filename: string;
  content: Buffer | string;
  contentType?: string;
};

export type SendMailInput = {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  attachments?: MailAttachment[];
  /** Optional ICS calendar payload sent as a `text/calendar; method=PUBLISH` attachment. */
  ics?: string;
};

export type SendResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string };

export async function sendMail(input: SendMailInput): Promise<SendResult> {
  if (process.env.E2E === "1") {
    await mkdir(E2E_OUTBOX_DIR, { recursive: true });
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const file = join(E2E_OUTBOX_DIR, `${stamp}.json`);
    const recordable = {
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
      hasIcs: Boolean(input.ics),
      attachmentNames: (input.attachments ?? []).map((a) => a.filename),
    };
    await writeFile(file, JSON.stringify(recordable, null, 2));
    return { ok: true, messageId: `e2e-${stamp}@local` };
  }
  const t = await getTransport();
  if (!t) return { ok: false, error: "SMTP not configured" };
  try {
    const attachments = [...(input.attachments ?? [])];
    if (input.ics) {
      attachments.push({
        filename: "invite.ics",
        content: input.ics,
        contentType: 'text/calendar; method=PUBLISH; charset=UTF-8',
      });
    }
    const info = await t.transport.sendMail({
      from: t.from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
      attachments: attachments.length > 0 ? attachments : undefined,
    });
    return { ok: true, messageId: String(info.messageId ?? "") };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "send failed" };
  }
}

export async function testSend(to: string): Promise<SendResult> {
  return sendMail({
    to,
    subject: "QualityMate SMTP test",
    text: "If you can read this, your SMTP configuration works.",
    html: "<p>If you can read this, your SMTP configuration works.</p>",
  });
}
