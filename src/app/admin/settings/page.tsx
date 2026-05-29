import { eq } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema";
import { getBranding } from "@/lib/branding";
import { get, KNOWN_KEYS } from "@/lib/settings";
import { requireAdmin } from "@/lib/auth-helpers";
import { DECLARATION_KEYS, getDeclarations } from "@/lib/checkin";
import { isConfigured as isAiConfigured } from "@/lib/ai";
import { getDefaultDistributionList } from "@/lib/meetings";
import { isMfaRequiredForAdmins } from "@/lib/mfa";
import { AiKeyForm } from "./ai-key-form";
import { BrandingForm } from "./branding-form";
import { DeclarationsForm } from "./declarations-form";
import { DistributionForm } from "./distribution-form";
import { ManagementRepForm } from "./management-rep-form";
import { MfaRequireForm } from "./mfa-form";
import { S3Form } from "./s3-form";
import { SmtpForm } from "./smtp-form";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const admin = await requireAdmin();
  const branding = await getBranding();
  const currentRepId = await get(KNOWN_KEYS.ISO_MANAGEMENT_REP);
  const admins = await db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .where(eq(user.role, "admin"));

  const decls = await getDeclarations();
  const declarations = DECLARATION_KEYS.map((k) => ({ key: k, text: decls[k] }));

  const aiConfigured = await isAiConfigured();
  const defaultDistribution = await getDefaultDistributionList();
  const mfaRequired = await isMfaRequiredForAdmins();

  const [s3Endpoint, s3Region, s3Bucket, s3AccessKey, s3SecretKey, s3PathStyle, s3Prefix] =
    await Promise.all([
      get("s3.endpoint"),
      get("s3.region"),
      get("s3.bucket"),
      get("s3.access_key_id"),
      get("s3.secret_access_key"),
      get("s3.force_path_style"),
      get("s3.prefix"),
    ]);

  const [host, port, smtpUser, password, fromEmail, secure] = await Promise.all([
    get("smtp.host"),
    get("smtp.port"),
    get("smtp.user"),
    get("smtp.password"),
    get("smtp.from_email"),
    get("smtp.secure"),
  ]);

  return (
    <div className="space-y-10">
      <section>
        <h1 className="text-2xl font-semibold mb-1">Settings</h1>
        <p className="text-slate-600 text-sm">Branding, ISO 9001, and email delivery.</p>
      </section>

      <section className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
        <h2 className="text-lg font-medium mb-4">Branding</h2>
        <BrandingForm initial={branding} />
      </section>

      <section className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
        <h2 className="text-lg font-medium mb-1">Management representative</h2>
        <p className="text-slate-600 text-sm mb-4">
          Named admin recorded for ISO 9001 clause 5.3 evidence. Appears on quarterly PDFs.
        </p>
        <ManagementRepForm admins={admins} currentId={currentRepId} />
      </section>

      <section className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
        <h2 className="text-lg font-medium mb-1">Site check-in declarations</h2>
        <p className="text-slate-600 text-sm mb-4">
          Eight required declarations shown on the public <code>/checkin</code> form.
        </p>
        <DeclarationsForm initial={declarations} />
      </section>

      <section className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
        <h2 className="text-lg font-medium mb-1">AI assistance (BYOK)</h2>
        <p className="text-slate-600 text-sm mb-4">
          Optional. When configured, admins see a &ldquo;Suggest&rdquo; button on incident review.
          Suggestions never auto-apply — admins choose to accept each field.
        </p>
        <AiKeyForm hasKey={aiConfigured} />
      </section>

      <section className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
        <h2 className="text-lg font-medium mb-1">Meeting distribution list</h2>
        <p className="text-slate-600 text-sm mb-4">
          Default recipients for approved minutes. Per-meeting overrides add to this list.
        </p>
        <DistributionForm initial={defaultDistribution} />
      </section>

      <section className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
        <h2 className="text-lg font-medium mb-1">SMTP (email delivery)</h2>
        <p className="text-slate-600 text-sm mb-4">
          When unconfigured, notifications are still recorded in-app — only the email channel
          is silent.
        </p>
        <SmtpForm
          initial={{
            host: host ?? "",
            port: port ?? "587",
            user: smtpUser ?? "",
            fromEmail: fromEmail ?? "",
            secure: secure === "true",
            hasPassword: !!password,
          }}
          testTo={admin.email}
        />
      </section>

      <section className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
        <h2 className="text-lg font-medium mb-1">Two-factor authentication policy</h2>
        <p className="text-slate-600 text-sm mb-4">
          Force every admin account to enrol in TOTP. Each admin manages their own enrolment
          under <span className="font-mono">/account/security</span>.
        </p>
        <MfaRequireForm initial={mfaRequired} />
      </section>

      <section className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
        <h2 className="text-lg font-medium mb-1">Offsite backup (S3-compatible)</h2>
        <p className="text-slate-600 text-sm mb-4">
          When configured, the nightly backup pushes a copy to this bucket. Works with
          AWS S3, Cloudflare R2, MinIO, and other S3-API providers.
        </p>
        <S3Form
          initial={{
            endpoint: s3Endpoint ?? "",
            region: s3Region ?? "us-east-1",
            bucket: s3Bucket ?? "",
            accessKeyId: s3AccessKey ?? "",
            prefix: s3Prefix ?? "qualitymate/",
            forcePathStyle: s3PathStyle !== "false",
            hasSecret: !!s3SecretKey,
          }}
        />
      </section>
    </div>
  );
}
