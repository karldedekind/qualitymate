import { requireAdmin } from "@/lib/auth-helpers";
import { defaultBackupsDir, listBackups } from "@/lib/backup";
import { isConfigured as s3Configured } from "@/lib/s3";
import { BackupActionsPanel } from "./actions-panel";

export const dynamic = "force-dynamic";

function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default async function BackupsPage() {
  await requireAdmin();
  const dir = defaultBackupsDir();
  const backups = await listBackups(dir);
  const s3On = await s3Configured();

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold">Backups</h1>
        <p className="text-slate-600 text-sm mt-1">
          Tarballs in <span className="font-mono">{dir}</span>. Retention 7 daily ·
          4 weekly · 12 monthly. Offsite (S3) is{" "}
          {s3On ? <span className="text-green-700">configured</span> : "not configured"}.
        </p>
      </div>

      <BackupActionsPanel />

      <section className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
        <h2 className="text-base font-medium mb-3">Recent backups</h2>
        {backups.length === 0 && (
          <p className="text-sm text-slate-500">
            None yet — run a backup or wait for the nightly cron.
          </p>
        )}
        <ul className="divide-y divide-slate-100">
          {backups.map((b) => (
            <li key={b.fullPath} className="py-2 flex items-center justify-between gap-3">
              <span className="font-mono text-sm truncate">{b.name}</span>
              <span className="text-xs text-slate-500 shrink-0">
                {fmtSize(b.size)} · {b.takenAt.toISOString().slice(0, 16).replace("T", " ")}
              </span>
              <a
                href={`/admin/backups/download?name=${encodeURIComponent(b.name)}`}
                className="text-sm text-blue-700 hover:underline shrink-0"
              >
                download
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
