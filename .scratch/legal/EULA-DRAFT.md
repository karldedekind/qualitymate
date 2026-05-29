# QualityMate End User Licence Agreement — DRAFT

> **DRAFT — NOT LEGAL ADVICE.** This template is a starting point for a Queensland-admitted small-business lawyer to review, edit, and sign off. Do not distribute as-is. Move the final version into the private vendor repo (`qualitymate-runbook`) once executed; do not commit the executed copy here.

This End User Licence Agreement (**Agreement**) is between **RIM Construction Pty Ltd** (ACN to be confirmed) of Queensland, Australia (**Licensor**, **we**, **us**) and the entity identified on the order confirmation (**Licensee**, **you**).

By installing or using QualityMate (the **Software**), you accept this Agreement. If you do not accept, do not install or use the Software.

## 1. Definitions

**Software** — the QualityMate self-hosted application, including the Docker images, source files, scripts, documentation, and any updates we make available to you.

**Install** — a single deployment of the Software on infrastructure controlled by the Licensee, hosting data for a single legal entity.

**Fees** — the licence fee, support fee, and any installation fee payable under the order confirmation.

**Customer Data** — all data the Licensee or its users enter, upload, or generate through the Software.

## 2. Licence

2.1 We grant you a non-exclusive, non-transferable, perpetual licence to install and use the Software on **one Install** for the operations of one legal entity, subject to this Agreement.

2.2 You may not (and may not permit any third party to):

- (a) sublicence, sell, lease, lend, distribute, or make the Software available as a service to any third party;
- (b) host the Software for the benefit of any entity other than the Licensee;
- (c) modify, decompile, reverse-engineer, or disassemble the Software except to the extent permitted by law that cannot be excluded by agreement;
- (d) remove or alter copyright, trademark, or attribution notices in the Software;
- (e) use the Software to provide consulting, outsourcing, or processing services to third parties.

2.3 If you operate multiple legal entities or trading names and require separate audit trails for each, a separate licence is required for each entity.

## 3. Source code

3.1 We may make the source code available to licensees under the terms of this Agreement. Source-code access does not modify the licence in clause 2 — it is licensed solely for the purpose of operating, customising, or auditing the Install you are licensed to run.

3.2 You may make changes to the source code for your own use. We are not obliged to support or accept upstream contributions, and we provide no warranty in relation to your modifications.

## 4. Updates and support

4.1 During any period for which you have paid the support fee, we will provide email support during Australian business hours (Brisbane), bug fixes, and minor and major version upgrades through the GitHub Container Registry release channels we publish.

4.2 You may continue to use the Software on the version installed at the time your support period ends. We are not obliged to provide patches, fixes, or upgrades after that.

## 5. Customer Data

5.1 The Licensee owns all Customer Data. We do not access Customer Data unless:

- (a) you provide it to us (for example, by sending a diagnostics tarball or a backup); or
- (b) you opt in to the heartbeat feature, which sends only the documented payload (instance ID, version, uptime, user count, incident count, error count, and — only with your separate opt-in — company name).

5.2 You are solely responsible for:

- (a) the security and integrity of your Install (host, network, backups);
- (b) compliance with applicable privacy laws (including the *Privacy Act 1988* (Cth) and any Notifiable Data Breaches obligations) in your collection, storage, and use of Customer Data;
- (c) lawful collection of personal information from your workers and contractors, including consent for biometric (signature) and location-adjacent data captured during site check-in.

## 6. AI features

6.1 The Software optionally integrates with third-party large language models (**AI Services**) when you supply your own API key. We do not host the AI Services. Calls to the AI Services are made directly from your Install to the third-party provider.

6.2 The AI Services produce *suggestions* — including but not limited to incident triage suggestions, meeting pack drafts, and meeting minutes drafts. These suggestions are probabilistic and may be incorrect, incomplete, or misleading.

6.3 **You warrant that AI suggestions produced by or through the Software will be reviewed by a qualified person before action is taken on them.** You agree that no AI suggestion, in isolation, constitutes a quality, safety, or compliance decision; the Licensee remains responsible for every triage classification, corrective action, meeting outcome, and ISO 9001 record produced by the Software.

6.4 The third-party AI provider's terms apply to your use of the AI Services. We are not a party to those terms.

## 7. ISO 9001

7.1 The Software is designed to assist with record-keeping and process discipline relevant to ISO 9001:2015. It is **not** an ISO 9001 certification, audit, or substitute for a qualified auditor. Certification is the Licensee's responsibility.

## 8. Fees and payment

8.1 Fees are payable in Australian dollars in accordance with the order confirmation. The licence fee is one-time. The support fee is annual.

8.2 We may increase the support fee on renewal by giving 60 days' written notice.

## 9. Warranties

9.1 We warrant that, at the time of delivery, the Software is free of any virus or malicious code knowingly inserted by us.

9.2 **Except as expressly stated in this Agreement, the Software is provided "as is" and we exclude all warranties to the maximum extent permitted by law, including warranties of merchantability, fitness for a particular purpose, non-infringement, and availability.** Where the *Australian Consumer Law* implies guarantees that cannot be excluded, our liability for breach of those guarantees is limited (where permitted) to the cost of supplying the Software again.

## 10. Liability cap

10.1 To the maximum extent permitted by law, our aggregate liability to you in connection with this Agreement (whether in contract, tort, statute, or otherwise) is **limited to the total Fees paid by you in the 12 months immediately preceding the event giving rise to the claim**.

10.2 We are not liable for any indirect, consequential, special, or incidental loss, including loss of profits, loss of revenue, loss of data, loss of goodwill, or loss arising from a third-party claim, regardless of whether we were advised of the possibility of such loss.

10.3 Nothing in this clause 10 excludes or limits liability that cannot be excluded or limited under applicable law (including the non-excludable consumer guarantees under the *Australian Consumer Law*).

## 11. Indemnity

11.1 You indemnify us against any claim, loss, damage, or expense (including legal costs on a solicitor-and-own-client basis) arising from:

- (a) your use of the Software in breach of this Agreement;
- (b) Customer Data, including any allegation that Customer Data infringes a third-party right or breaches applicable law;
- (c) your failure to review AI suggestions before acting on them, in breach of clause 6.3.

## 12. Term and termination

12.1 This Agreement starts on the date of the order confirmation and continues unless terminated under this clause.

12.2 Either party may terminate this Agreement immediately by written notice if the other party commits a material breach that is not remedied within 30 days of written notice.

12.3 On termination by us for your breach, your licence in clause 2 ends and you must cease using the Software and destroy all copies. Termination does not affect rights or remedies that have accrued before termination.

## 13. Governing law and jurisdiction

13.1 This Agreement is governed by the laws of the State of **Queensland**, Australia.

13.2 The parties submit to the exclusive jurisdiction of the courts of Queensland and the courts competent to hear appeals from those courts.

## 14. General

14.1 **Notices** — must be in writing and sent to the email address on the order confirmation.

14.2 **Assignment** — you may not assign or novate this Agreement without our prior written consent. We may assign or novate this Agreement to an entity that acquires all or substantially all of our business.

14.3 **Force majeure** — neither party is liable for failure to perform an obligation (other than payment obligations) caused by an event beyond its reasonable control.

14.4 **Entire agreement** — this Agreement and the order confirmation form the entire agreement between the parties and supersede all prior representations.

14.5 **Severability** — if any clause is unenforceable, the rest of the Agreement continues in force.

14.6 **No waiver** — a delay in exercising a right is not a waiver of that right.

---

**Signed for the Licensor**

Name: ____________________  Title: ____________________  Date: ____ / ____ / ______

**Signed for the Licensee**

Name: ____________________  Title: ____________________  Date: ____ / ____ / ______
