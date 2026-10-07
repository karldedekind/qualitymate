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
import { CODE_LOCKED_MESSAGE, hasVisibleCode, listItems } from "@/lib/document-lists";
import { AiKeyForm } from "./ai-key-form";
import { BrandingForm } from "./branding-form";
import { ContractorForm } from "./contractor-form";
import { DeclarationsForm } from "./declarations-form";
import { DistributionForm } from "./distribution-form";
import { DocumentListForm } from "./document-list-form";
import { ManagementRepForm } from "./management-rep-form";
import { MfaRequireForm } from "./mfa-form";
import { S3Form } from "./s3-form";
import { SmtpForm } from "./smtp-form";

export const dynamic = "force-dynamic";

function SettingsGroup({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400 border-b border-slate-200 pb-1">
        {heading}
      </h2>
      {children}
    </div>
  );
}

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
  const [docCategories, docTypes, docTriggers] = await Promise.all([
    listItems("doc_category"),
    listItems("doc_type"),
    listItems("doc_usage_trigger"),
  ]);

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

  const [contractorLegalName, contractorPhone, contractorEmail] = await Promise.all([
    get(KNOWN_KEYS.CONTRACTOR_LEGAL_NAME),
    get(KNOWN_KEYS.CONTRACTOR_PHONE),
    get(KNOWN_KEYS.CONTRACTOR_EMAIL),
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
    <div className="space-y-12">
      <section>
        <h1 className="text-2xl font-semibold mb-1">Settings</h1>
        <p className="text-slate-600 text-sm">
          Branding &amp; ISO 9001, Document Register lists, communications, security, AI, and backup.
        </p>
      </section>

      <SettingsGroup heading="Branding & ISO 9001">
        <section className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
          <h3 className="text-lg font-medium mb-4">Contractor details (ContractFlow)</h3>
          <ContractorForm
            initial={{
              legalName: contractorLegalName ?? "",
              phone: contractorPhone ?? "",
              email: contractorEmail ?? "",
            }}
          />
        </section>

        <section className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
          <h3 className="text-lg font-medium mb-4">Branding</h3>
          <BrandingForm initial={branding} />
        </section>

        <section className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
          <h3 className="text-lg font-medium mb-1">Management representative</h3>
          <p className="text-slate-600 text-sm mb-4">
            Named admin recorded for ISO 9001 clause 5.3 evidence. Appears on quarterly PDFs.
          </p>
          <ManagementRepForm admins={admins} currentId={currentRepId} />
        </section>

        <section className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
          <h3 className="text-lg font-medium mb-1">Site check-in declarations</h3>
          <p className="text-slate-600 text-sm mb-4">
            Eight required declarations shown on the public <code>/checkin</code> form.
          </p>
          <DeclarationsForm initial={declarations} />
        </section>
      </SettingsGroup>

      <SettingsGroup heading="Document Register">
        {(
          [
            {
              kind: "doc_category",
              title: "Document Categories",
              blurb: "The business area that owns a document. The code is the first part of the Document ID.",
              items: docCategories,
            },
            {
              kind: "doc_type",
              title: "Document Types",
              blurb: "The kind of document. The code and Number form the rest of the Document ID.",
              items: docTypes,
            },
            {
              kind: "doc_usage_trigger",
              title: "Usage Triggers",
              blurb: "Situations that call for a document, shown as \u201cWhen to use\u201d in the register.",
              items: docTriggers,
            },
          ] as const
        ).map((list) => (
          <section
            key={list.kind}
            className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm"
          >
            <h3 className="text-lg font-medium mb-1">{list.title}</h3>
            <p className="text-slate-600 text-sm mb-1">{list.blurb}</p>
            <p className="text-slate-500 text-xs mb-4">
              {hasVisibleCode(list.kind) && <>🔒 {CODE_LOCKED_MESSAGE} </>}
              Removing an item a document uses retires it instead of deleting it.
            </p>
            <DocumentListForm
              kind={list.kind}
              items={list.items}
              showCode={hasVisibleCode(list.kind)}
              lockedMessage={CODE_LOCKED_MESSAGE}
            />
          </section>
        ))}
      </SettingsGroup>

      <SettingsGroup heading="Email & notifications">
        <section className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
          <h3 className="text-lg font-medium mb-1">SMTP (email delivery)</h3>
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
          <h3 className="text-lg font-medium mb-1">Meeting distribution list</h3>
          <p className="text-slate-600 text-sm mb-4">
            Default recipients for approved minutes. Per-meeting overrides add to this list.
          </p>
          <DistributionForm initial={defaultDistribution} />
        </section>
      </SettingsGroup>

      <SettingsGroup heading="Security">
        <section className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
          <h3 className="text-lg font-medium mb-1">Two-factor authentication policy</h3>
          <p className="text-slate-600 text-sm mb-4">
            Force every admin account to enrol in TOTP. Each admin manages their own enrolment
            under <span className="font-mono">/account/security</span>.
          </p>
          <MfaRequireForm initial={mfaRequired} />
        </section>
      </SettingsGroup>

      <SettingsGroup heading="AI assistance">
        <section className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
          <h3 className="text-lg font-medium mb-1">AI assistance (BYOK)</h3>
          <p className="text-slate-600 text-sm mb-4">
            Optional. When configured, admins see a &ldquo;Suggest&rdquo; button on incident review,
            plus &ldquo;Populate with AI&rdquo; and rewrite helpers across ContractFlow.
            Suggestions never auto-apply — admins choose to accept each field.
          </p>
          <AiKeyForm hasKey={aiConfigured} />
        </section>
      </SettingsGroup>

      <SettingsGroup heading="Backup & storage">
        <section className="bg-white border border-slate-200 rounded-lg p-6 shadow-sm">
          <h3 className="text-lg font-medium mb-1">Offsite backup (S3-compatible)</h3>
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
      </SettingsGroup>
    </div>
  );
}
