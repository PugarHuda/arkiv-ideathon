# LAYAK — form-ready answers (tally.so/r/OD9eeY)

Field labels below follow the rules doc's canonical list. Paste each block into its field. Every block is self-contained. Full write-up and diagrams are the supporting link.

---

## Idea name
LAYAK

## One-line pitch
Statutory inspection certificates for lifting equipment written as Arkiv entities whose **lifetime is the certificate's validity period** — so an expired certificate is not a row with a stale date on it; it is a row that no longer exists to be returned.

## Which track?
Other (open lane)

## The problem — and who it's for
Under Indonesia's Permenaker No. 8/2020, every crane, hoist, forklift and lifting accessory must pass *riksa uji* — inspection by a labour inspector or registered body (PJK3) — and carry a certificate of operational fitness (*layak operasi*): first exam, another within two years, then annually. The UK's LOLER has the same shape. That certificate is a PDF, the date field is trivially edited, and the person most motivated to edit it owns the machine and loses a day's revenue when it comes off the line.

The failure repeats in four places. At the **gate**, a supervisor has ninety seconds and a laminated card. In **software**, `valid_until` is a column every query must remember to filter on — one forgotten `WHERE` and the fleet view shows green on a machine that lapsed five weeks ago. After an **accident**, the investigation gets the history from the contractor's own maintenance system. At **resale**, a machine with a bad record is re-registered and arrives clean, because the history lived in the seller's database.

Users: the site supervisor at the gate, the PJK3 inspector whose registration is on the line, the insurer settling a claim, and the labour inspectorate reconstructing custody after someone got hurt.

What already exists: since 3 Dec 2025 Kemnaker issues K3 documents digitally via **TemanK3** — certificates, SKP and operator licences (SIO), barcode-verified. Read precisely it is a *personnel*-credential verifier; equipment fitness (SLO/SIA) and the riksa uji report are not among the documents named, and there is no equipment register, history or API. So LAYAK **references** TemanK3 for who an inspector is (licence number as join key) and fills what a verification portal structurally cannot: a certificate that is absent rather than stale, a recorded gate check, a register that survives the operator, and verification that does not need the portal to be up.

## Scope — the first slice you'd build
One asset class, one certificate type, one screen, one phone. An inspector writes a `Certificate` and its `ExamRecord` in a single batch with `expiresIn` set to the examination validity. A site supervisor scans the asset's QR code; the page runs the gate check and shows green with the inspector's address and tx hash, or red with nothing at all.

Then the demo that proves it: create a certificate with a **two-minute lifetime**, show green, wait, refresh — red, with no code having run, no job having fired and no date having been compared. That two-minute certificate is the whole pitch.

**Explicitly not building in v1:** the physical tagging supply chain (a QR sticker, with the trust gap admitted) and any system mapping inspector addresses to people — that stays inside the PJK3.

**How to kill it without deploying anything:** the riskiest assumption is that an inspection body will publish to a register it cannot edit. Show three PJK3 inspectors the two-minute demo and the "inspector's whole book" query, and ask: *would you rather your book was public, or your competitor's was?* A shrug kills it. An inspector who has been undercut by someone signing off machines they never climbed makes it — and that person exists in every inspection market.

## The entities and typed attributes you'd write
All numerics are integers. Every entity carries `app: "layak"` — in a fail-closed system that term is load-bearing: it stops another project's `"cert"` entity turning a red gate green. Relationships are shared attribute keys (`assetId`, `examRecordId`, `inspector`, `defectId`).

**Certificate** (lifetime = validity: `expiresIn` 63072000 post-commissioning, 31536000 periodic; never updated, never extended by product rule): `assetId`, `certType` (string slug), `siteId`, `inspector` (mirrors `$creator`), `bodyId`, `examRecordId`, `issuedTs`, `expiresAtTs` (numeric mirror), `outcomeCode`.

**ExamRecord** (5y, extended with the asset for the life of the equipment): `assetId`, `examRecordId`, `inspector`, `bodyId`, `examTs`, `outcomeCode` (incl. 2 = fail), `defectCount`, `testRatioBps` (proof-load ratio as basis points — `12500` = 1.25×, because `"1.25"` is a string and cannot answer a range query), `reportHash`, `regimeCode`. **One examination writes both entities in one `mutateEntities` batch, with opposite lifetimes** — the certificate governs movement and must vanish; the record satisfies the statutory retention duty and must not. A failed exam writes the record and no certificate: absence is the fail state, the same absence as expiry.

**Asset** (2y, extended annually; `$owner` = operator of record, moved by `changeOwnership` on sale): `assetId`, `assetClass`, `siteId`, `manufacturedYear`, `capacityKg`, `regimeCode`.

**Registration** (the inspector's licence; renewed only by the issuing body, `$creator` = the body): `inspector`, `scheme`, `bodyId`, `scopeCode`, `grantedTs`, `expiresAtTs`.

**Prohibition** (until lifted; extended by the issuing inspector): `assetId`, `siteId`, `issuedBy`, `reasonCode`, `issuedTs`, `expiresAtTs`. Revocation without triggers — Arkiv executes nothing, so a defect cannot revoke a certificate; real regimes use a separate instrument and so does LAYAK.

**DefectReport** (30d; attributes public, payload encrypted to owner/body/insurer): `assetId`, `siteId`, `severityTier`, `reportedTs`, `reporterRole`, `photoHash`, `statusCode`. **Escalation** (1y, a new entity by the safety officer — only the owner can extend, and the reporter may be gone): `defectId`, `assetId`, `severityTier`, `escalatedTs`.

**GateCheck** (90d): `assetId`, `siteId`, `checkedBy`, `checkedTs`, `resultCode` (0 pass · 1 no-cert · 2 prohibition · 3 offline-cached), `cacheAgeSec`. Every scan is an entity; diligence becomes provable, not assertable.

**What this schema stores differently from "an on-chain certificate registry":** validity goes to `expiresIn`, never to an attribute, so the gate check has no date comparison; one exam writes two entities with opposite lifetimes; a failed exam writes the record and no certificate; extension is withheld from certificates and its misuse is detectable by anyone; revocation is a separate `Prohibition` entity because nothing executes; every scan writes a `GateCheck`; and Permenaker 8/2020's cadence *is* the `expiresIn` table. The obvious alternatives were this idea's own first draft.

## The queries you'd rely on
All prefixed `eq(app,"layak")`. Strings support `eq()` only; no wildcard search exists, so every string is an enumerated slug.

1. **Gate check:** `eq(kind,"cert") ∧ eq(assetId,A) ∧ eq(certType,T)` must return ≥1, and `eq(kind,"prohibition") ∧ eq(assetId,A)` must return 0. Green needs both. An out-of-date certificate *cannot* be in the first set; no date comparison exists to get wrong.
2. **Site compliance as two counts:** `count(eq(kind,"asset") ∧ eq(siteId,S))` vs `count(eq(kind,"cert") ∧ eq(siteId,S) ∧ eq(certType,T))`. The gap is the risk number, and a site that logs nothing scores worse, not better.
3. **Renewal queue:** `eq(kind,"cert") ∧ eq(siteId,S) ∧ gte(expiresAtTs,now) ∧ lt(expiresAtTs,now+604800)` — why `expiresAtTs` is mirrored: system expiry governs what is returned but cannot be range-queried.
4. **Statutory pull:** `eq(kind,"exam") ∧ eq(assetId,A) ∧ gte(examTs,T0)` — every examination, passes and failures, cursor-paginated. The reason `ExamRecord` is a separate entity.
5. **Inspector's whole book:** `eq(kind,"exam") ∧ eq(inspector,I) ∧ gte(examTs,T0)` — held by no employer, deletable by no employer.
6. **Was the issuer registered:** `eq(kind,"reg") ∧ eq(inspector,I) ∧ eq(scheme,"PJK3")` — a live certificate from an unregistered inspector is the highest-value anomaly in the system.
7. **Extension anomaly:** `eq(kind,"cert") ∧ gt(expiresAtTs, examTs + regimeSeconds)` — makes "never extended" a checkable statement rather than a promise; anyone can run it over the whole register.
8. **Was anybody checking:** `count(eq(kind,"gate") ∧ eq(siteId,S) ∧ gte(checkedTs,T0))`, and with `gte(resultCode,1)`. A site with hundreds of movements and no gate checks never looked. The absence of this number is the finding.

## How expiry / extension / verifiable ownership work as product features
**Expiry is the safety property.** Everywhere else, validity is data you must remember to check; here it is the storage contract. The certificate's lifetime and its meaning are the same fact, which removes the stale-row bug class by construction rather than by discipline.

**Extension is the liveness signal, and its absence is the integrity signal.** Assets are extended while in service, registrations while the body still vouches, records for the life of the equipment, prohibitions until lifted. Certificates are never extended — the mechanic everything else depends on would, on this one entity, be forgery. Seven lifetimes from 30 days to a machine's service life: the shape of the lifetimes is the shape of the regulation. Being precise: the inspector owns the certificate and *could* extend it — the guarantee is not impossibility but that it cannot be done in secret, because query 7 catches it.

**Ownership carries history through resale.** `changeOwnership` on the asset moves the operator of record; every examination keeps its immutable `$creator`. You cannot launder a machine's past by selling it, because the past was never the seller's to leave behind. **`$creator` is the signature** — the inspector's on a certificate, the body's on a registration; neither can be reassigned. The tx hash is on the gate-check card, not in the plumbing, and every write's on-chain time is not the writer's to choose — a backdated `examTs` contradicts its own transaction permanently. `deleteEntity` is unused: a contractor asking for a record to be removed is the request this system exists to refuse.

## Why the idea genuinely needs Arkiv over a plain database
(1) **The party who holds the data is the party the data is about.** The contractor runs the maintenance system, and the contractor is who the certificate exists to constrain. Every conventional build puts the fox in charge of the henhouse ledger and asks the regulator to accept its export as evidence. (2) **Expiry must be a guarantee, not a filter.** On Postgres, "expired certificates are not returned" is a convention every query must honour forever, across every integration anyone ever writes; here it is the storage layer's behaviour and no query can opt out. That is the gap between a control that works and one that works until someone writes a new report. (3) **The reader is a stranger** — a supervisor, an insurer, an inspector — with no account on the contractor's system and no reason to trust it. (4) **The history must outlive the relationship** — companies fold and their software is decommissioned, but the statutory record is owed for the life of the equipment.

Remove any one and LAYAK is a spreadsheet with extra steps.

On the fourth pillar, precisely: block production stays centralised through November 2026 per Arkiv's roadmap. LAYAK relies on the **Ethereum anchor** — the operator can order or refuse writes but cannot rewrite an anchored certificate, its `$creator`, or its creation block without it showing against L1. That is what the backdating and extension-anomaly checks stand on. Censorship-resistance is a later phase and is not claimed.

## What deliberately stays off Arkiv
**The reports themselves** — riksa uji reports, load-test charts and thermography stay in object storage behind a `reportHash`. **Personal data** — inspectors are addresses; workers are a role; identity resolution stays inside the PJK3. **Defect diagnoses** — encrypted payload, public `severityTier`; the split that keeps silence expensive without publishing repair quotes. **Enforcement** — nothing here stops a crane; the gate and the stop-work order are the site's own systems reading Arkiv. **Anything needed in the next 50 ms** — no interlocks, no PLC in the loop. Fail-closed also needs an offline answer: the gate app holds a signed local cache and records degraded checks as `resultCode: 3` with `cacheAgeSec`, so the degradation is measured rather than hidden.

**Honest limits:** LAYAK proves who signed and when, not that the examination happened. And the easiest way to defeat it is never to register the machine at all — it is structurally blind to equipment it does not know exists, and that gap is closed by inspectors refusing to work off-register, not by a database feature.

## Supporting links (optional)
Full write-up with diagrams and the entity-model sketch: https://claude.ai/code/artifact/60440808-a338-45c2-9c30-a390939e2226

Three things in there are evidence rather than description. (1) The TypeScript sketch **type-checks with `tsc --strict` against `@arkiv-network/sdk@0.7.0` from npm** — which corrected four things (client-based API, `Attribute[]` shape, required `contentType`, page-bounded `.count()`) and surfaced `createdAtBlock`, `.createdBy()`, `validAtBlock()` and the `ArkivEntityExpired` event. (2) The sketch is then **executed** against an executable spec of the documented semantics: nine invariants (expired cert never returned, failed exam → record and no cert, record outlives cert, non-owner cannot extend and an owner who does is caught, orphan cert → amber, prohibition without triggers, resale keeps `$creator`, 350 ≠ 200, odd `expiresIn` rejected) — all pass. (3) Read against `0.8.0-dev`: `$expiresAt` becomes queryable (the mirror disappears), `dec`/`addr`/`key` types replace scaling conventions, `atDate()` makes a certificate's deadline first-class, and `$createdAt` stays result-only — so the protocol feedback stands. Nothing is deployed.
