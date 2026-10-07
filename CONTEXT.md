# QualityMate

## Language

### Company registers

**Company Register**:
A company-wide list of a particular kind of thing that RIM keeps, separate from any one Job.
_Avoid_: library, database

**Document Register**:
The Company Register of Controlled Documents.
_Avoid_: document library, document list

**Controlled Document**:
A document RIM writes and owns, such as a policy, procedure, manual, template or blank form, and keeps under revision control.
_Avoid_: company document, record

**Record**:
A third-party or completed document kept as evidence, such as an insurance certificate, licence or signed contract. Not a Controlled Document and never re-formatted.
_Avoid_: controlled document

**Naming Convention**:
The rule that builds every Document ID and file name from a Controlled Document's Category, Type, Number and Version. Currently `[Category]_[Type][Number]_[Version]-[Name]` (IMS Manual §4.2.1); it may be redesigned once, in the Baseline Plan.
_Avoid_: numbering scheme, file naming

**Document ID**:
The permanent identifier of a Controlled Document, built by the Naming Convention (currently e.g. `QSE_MAN001`). It does not change between Versions. The Number is unique per Document Type across all Document Categories, so "Policy 002" means one document company-wide.
_Avoid_: doc code, file name, reference

**Document Category**:
The business area that owns a Controlled Document: QSE (Quality, Safety, Environmental), PRO (Projects), MAR (Marketing), HR (Human Resources), AM (Administration), SAL (Sales). Defined in the IMS Manual (QSE_MAN001) §4.2.1; admins maintain the list. A Category's code is locked once any document uses it.
_Avoid_: department, prefix

**Document Type**:
The kind of Controlled Document: TEMP, MAN, FORM, CTR, REG, PLA, GEN, CHK, COP, SWMS, SOP (with sub-types SOPS, SOPE, SOPQ, SOPA, SOPM). Defined in the IMS Manual §4.2.1; admins maintain the list. A Type's code is locked once any document uses it; changing it means retiring it and re-issuing the documents as new Versions.
_Avoid_: doc code

**Version**:
One issued revision of a Controlled Document, written `V1`, `V2`, … Each Version has a Date Issued, a Next Review Date and an approver.
_Avoid_: revision, rev

**Superseded Version**:
A Version replaced by a newer one. Archived with its Archive Date, never deleted (kept for at least 7 years).
_Avoid_: old version, deleted

**House Style**:
The single formatting standard every Controlled Document is rendered in. It is the QualityMate document look, shared with Contract Documents, in RIM green.
_Avoid_: template, theme

**Template**:
A Controlled Document with blanks to be filled in per Job, such as a SWMS, form, checklist or TEMP document. The blank Template is in the Document Register; a filled-in copy is a Record.
_Avoid_: form (when meaning the filled copy)

**Merge Field**:
A named blank in a Template, such as Job Site, Project Name or Client Name, that is filled from the Job's details.
_Avoid_: placeholder, tag, variable

**Import**:
Bringing an existing Controlled Document into the Document Register from its Source File: the AI restructures it into the House Style word for word, then a person approves it.
_Avoid_: clone, conversion, rewrite

**Source File**:
The original uploaded file (PDF/Word) an Import was made from. Kept alongside the imported Version as evidence.
_Avoid_: original, upload

**Fidelity Check**:
The word-level comparison between a Source File's text and its Import, flagging any word added, dropped or changed. Every Import must pass it before approval.
_Avoid_: diff, validation

**Suggested Correction**:
A fix the AI proposes during Import (typo, spelling, entity name). Never applied to the Import itself; only ever logged for a later Version.
_Avoid_: auto-fix, edit

**Baseline Plan**:
The one-off plan, made before the Baseline Date, that covers every company document. It sorts each one as Controlled Document, Record or External Document. It proposes the Naming Convention, the Category and Type lists, and a new Document ID for every Controlled Document. The AI drafts it, and an admin edits and approves it. Approval fixes the Document IDs and produces the text for the IMS Manual update.
_Avoid_: migration, mapping, renumbering

**External Document**:
A document published by someone else that RIM relies on, such as an Act, an Award, a Fair Work statement or a client induction guide (IMS Manual §4.2.2). Never re-styled or renumbered as RIM's.
_Avoid_: controlled document, record

**Baseline Date**:
The single date on which every imported Controlled Document was re-issued as V1 in the Document Register. The start of the register's audit trail.
_Avoid_: go-live date, migration date

**Legacy ID**:
The Document ID and Version a Controlled Document had before the Baseline Date (e.g. `HR_POL008_V3` or `POL_005_V1`). Kept so older Records that cite it can still be traced.
_Avoid_: old number, previous ref

**Change Request**:
A proposal from anyone to change a Controlled Document; step 1 of the IMS Manual §4.2.1 change process. It is accepted or refused before any new Version is drafted.
_Avoid_: suggestion, feedback, Suggested Correction (that one comes from the AI during Import)

**Approver**:
The person who approves and issues a Version; recorded on the Version as "Approved By".
_Avoid_: reviewer, signer

**Review**:
The periodic check of the current Version, done at least every 12 months (IMS Manual §4.2.1). It records a date, a reviewer and an outcome: "No change" moves the Next Review Date forward 12 months and keeps the same Version; "Changes needed" starts a draft of the next Version.
_Avoid_: revision, audit

**Next Review Date**:
The date the current Version's next Review is due: 12 months after it was issued or last reviewed. A document is Due Soon within 30 days of it, and Overdue after it.
_Avoid_: expiry date

**Usage Trigger**:
A situation that calls for a Controlled Document, such as Onboarding, Project start, Site activity or As required. A document can have several. Admins maintain the list; a trigger in use is retired, not deleted.
_Avoid_: "when to use" (that is the column label), tag

**Acknowledgement**:
A Record that a named person has read and understood a specific Version of a Controlled Document. Required again for a new Version, not for a "No change" Review. (Phase 2; until then, signature blocks in documents are signed on paper.)
_Avoid_: sign-off, transmittal

### Contract documents

**Contract Document**:
A formal notice raised against a Job: RFI, NOD or EOT.
_Avoid_: register document

## Relationships

- The **Document Register** holds **Controlled Documents** only
- **Records** belong in a separate **Company Register**, not the **Document Register**
- A **Contract Document** belongs to one **Job**; a **Controlled Document** belongs to no Job
- A **Controlled Document** has one **Document ID** and one or more **Versions**; exactly one Version is current, the rest are **Superseded Versions**
- A **Document ID** combines one **Document Category** and one **Document Type**
- A **Template** may contain **Merge Fields**; filling a Template for a **Job** produces a **Record** belonging to that Job (not yet built)
- An **Import** must pass its **Fidelity Check** and be approved by a person before it becomes a **Version** in the **Document Register**
- **Suggested Corrections** never change wording during **Import**
- The **Baseline Plan** decides every **Document ID** before any **Import** is approved; Imports then follow it
- Every **Import** becomes **V1** on the **Baseline Date** and records its **Legacy ID** (one or more, where the old register and file disagreed)
- A **Controlled Document** has zero or more **Usage Triggers**
- A **Version** can have many **Reviews**; only a "Changes needed" Review leads to a new **Version**

## Flagged ambiguities

- The current register (QSE_REG006) uses Document IDs with no Document Category (e.g. `POL_005`), which clash with the IMS scheme (the same policy is `HR_POL008`). Resolved: the IMS Manual scheme is canonical, and the old register numbers are legacy.
- "Company documents" was used to mean both **Controlled Documents** and **Records**. Resolved: the Document Register holds Controlled Documents only.
