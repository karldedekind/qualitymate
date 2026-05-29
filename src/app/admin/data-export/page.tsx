import { requireAdmin } from "@/lib/auth-helpers";
import { DataExportDownloadButton } from "./download-button";

export const dynamic = "force-dynamic";

export default async function DataExportPage() {
  await requireAdmin();
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold">Full data export</h1>
        <p className="text-slate-600 text-sm mt-1">
          Streaming ZIP containing every database table as CSV, redacted
          settings, uploaded photos, and approved meeting PDFs. Rate-limited to
          one export per admin every 5 minutes.
        </p>
      </div>

      <section className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm space-y-3">
        <h2 className="text-base font-medium">Contents</h2>
        <ul className="text-sm list-disc pl-6 space-y-1 text-slate-700">
          <li><span className="font-mono">README.txt</span> — schema notes &amp; round-trip guidance</li>
          <li><span className="font-mono">manifest.json</span> — row counts, file counts, generation timestamp</li>
          <li><span className="font-mono">csv/&lt;table&gt;.csv</span> — every table verbatim (CRLF, RFC 4180)</li>
          <li><span className="font-mono">settings.json</span> — settings with secret values redacted</li>
          <li><span className="font-mono">uploads/</span> — site signatures, branding logos, incident photos</li>
          <li><span className="font-mono">meeting-pdfs/</span> — rendered minutes for every approved meeting</li>
        </ul>
      </section>

      <DataExportDownloadButton />
    </div>
  );
}
