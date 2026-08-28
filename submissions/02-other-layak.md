# LAYAK — safety certification that cannot be out of date

*Layak is Indonesian for **fit** — fit to be used, fit to operate. Indonesia's certificate of operational fitness for lifting equipment is a **Surat Keterangan Layak Operasi**; a roadworthy vehicle is layak jalan. The word already means the one thing this product returns.*

**Track:** Open lane · Other (host: Santiago Zuluaga) · closes Aug 31, 23:59 UTC

**One-line pitch:** Statutory inspection certificates for lifting equipment written as entities whose **lifetime is the certificate's validity period** — so an expired certificate is not a row with a stale date on it: it is a row that no longer exists to be returned.

---

## In one screen

- **Problem.** Under Permenaker 8/2020 (and LOLER), every crane must carry a certificate of fitness. It is a PDF; the date is the first thing edited; the editor owns the machine. At the gate, in software, after an accident and at resale, the same failure repeats.
- **Mechanism.** The validity period is passed to `expiresIn`, not stored as an attribute. The gate check is two predicates — a live certificate must exist, no live prohibition may — and there is no date comparison anywhere to get wrong. Zero rows means the machine does not move.
- **One exam, two entities, opposite lifetimes.** The certificate must vanish on schedule; the statutory `ExamRecord` must outlive the machine. Written in one batch. A failed exam writes the record and no certificate — absence is the fail state, the same absence as expiry.
- **Extension is withheld from exactly one entity.** Everything else renews; certificates never do, because that would be forgery. Honestly: the inspector *could* extend it — the guarantee is that it cannot happen in secret, because `gt(expiresAtTs, examTs + regimeSeconds)` catches it across the whole register.
- **Diligence becomes provable.** Every scan writes a `GateCheck` no employer can delete. After an accident the question is *did anybody look*, and today that is one person's word against another's.
- **Practitioner objections answered:** offline gates (signed cache, degradation recorded as a number), backdating (on-chain write time is not the writer's to choose), competitor scraping (public `severityTier`, encrypted diagnosis).
- **Eight entities, seven lifetimes**, 25/25 documented primitives used or explicitly declined, two pieces of protocol feedback earned from friction.
- **Kill test, no deploy:** ask three PJK3 inspectors whether they'd rather their book was public or their competitor's was.
- **Honest limits:** proves who signed and when, not that the exam happened; blind to machines never registered.

## If you are reading a similar idea

"An on-chain certificate registry" is the Other lane's first seed and there will be several. The rubric scores uniqueness on "a twist that changes what gets stored or asked", so here is what this schema stores or asks differently — decisions a look-alike would have to reproduce, not paraphrase:

| Decision in the data model | What the obvious version does instead |
| :--- | :--- |
| The validity period is passed to **`expiresIn`**, never stored as an attribute; the gate check has **no date comparison** | Stores `validUntil` as an attribute — and is a `WHERE` clause away from waving a crane through |
| One examination writes **two entities with opposite lifetimes** — a certificate that must vanish and a record that must outlive the machine | One entity, and either the register lies after expiry or it fails statutory retention |
| A **failed** exam writes the record and **no certificate**; absence is the fail state, the same absence as expiry | Passes only, or a `status` column |
| `extendEntity` is withheld from certificates and its misuse is **detectable by anyone** (`gt(expiresAtTs, examTs + regimeSeconds)`) | Claims extension is impossible, or never considers it |
| `Prohibition` is a separate entity because the database executes nothing; the gate asks **two** questions | Expects a defect to revoke a certificate via a trigger that does not exist |
| Every scan writes a `GateCheck` — diligence becomes provable, including `resultCode: 3` for degraded offline checks | Records certificates, not whether anyone looked |
| Regulation encoded as constants: Permenaker 8/2020's cadence *is* the `expiresIn` table; the vocabulary is *riksa uji*, PJK3, SLO | A generic "license" with a generic "1 year" |
| The sketch **compiles against the SDK and nine invariants execute**, including one whose first run exposed a wrong test rather than a wrong design | Prose |

The left-hand column is what the idea had to become to survive testing against the statutes and against the SDK. The right-hand column is where it started.

---

## 1. The problem, and who it's for

Under **Permenaker No. 8 Tahun 2020**, every crane, hoist, forklift and lifting accessory operating in Indonesia must pass *riksa uji* — inspection and testing by a labour inspector or a registered inspection body (PJK3 / LIT) — and carry a certificate of operational fitness. The first examination is followed by another within two years, and annually after that.

That certificate is a PDF. PDFs are trivially edited, the date field is trivially edited, and the person with the strongest motive to edit it is the contractor who owns the machine and loses a day's revenue when it comes off the line.

The failure has a shape, and it repeats:

- **At the gate**, a site supervisor has ninety seconds and a laminated card. They cannot call the PJK3 to confirm the certificate is real, so they wave the machine through.
- **In software**, systems store `valid_until` as a column and rely on every query, report, dashboard and integration remembering to filter on it. One forgotten `WHERE valid_until > now()` and the fleet view shows green on a machine that lapsed five weeks ago. This is not an exotic bug; it is the ordinary one.
- **After an accident**, the investigation asks for the inspection history — and receives it from the contractor's own maintenance system, which the contractor has had every opportunity and every incentive to tidy.
- **At resale**, a machine with a bad record is sold, re-registered in a new system, and arrives clean. The history does not travel with the asset, because the history lived in the seller's database.

The users are the site supervisor at the gate, the PJK3 inspector whose registration is on the line, the insurer settling a claim, and the labour inspectorate reconstructing a chain of custody after someone got hurt.

**What already exists, and what LAYAK must not pretend to replace.** Since **3 December 2025**, Kemnaker issues K3 documents digitally through **TemanK3** (temank3.kemnaker.go.id): certificates, statement letters, appointment decisions (SKP) and operator licences (SIO), each carrying a barcode that resolves to the official portal, with an E-Personel lookup by name and date of birth. That is a real improvement and this design builds on it rather than against it. Read precisely, though, TemanK3's public surface is a **personnel-credential** verifier: its four lookups are certificate/licence, expert card, auditor card and doctor SKP. Equipment fitness — the SLO/SIA for the crane itself, and the *riksa uji* report behind it — is not among the documents the launch names, and the portal exposes no equipment register, no history and no API. So the honest division of labour is: **TemanK3 is the issuer of record for who an inspector is; LAYAK is the register for what the inspector examined and whether it is still fit.** The `Registration` entity in this design should *reference* TemanK3's credential rather than duplicate it — the inspector's licence number is the join key, and the accrediting body's `$creator` on the Arkiv entity is the on-chain shadow of a document Kemnaker already issued. What TemanK3 does not do, and a verification portal structurally cannot, is the rest of this design: a certificate that is *absent* rather than *stale* when it lapses, a gate check that is recorded, a register that survives the operator, and a record that a stranger — an insurer abroad, a regulator after the company has folded — can verify without the portal being up. The "PDF the date is edited on" is still the reality for equipment fitness certificates today; for personnel it is, since December, being fixed — which is exactly the sequence that makes the equipment layer the next obvious step.

The failure is not abstract. Indonesian inspection-industry reporting describes an overhead crane collapse in an industrial estate in **2024** with fatalities, where the equipment's *riksa uji* had lapsed **more than two years** earlier, and a mobile-crane collapse in Jakarta where Kemnaker's investigation found the machine had no valid equipment permit and the operator no valid licence for its capacity. I cite these as reported by industry sources rather than as verified findings — but notice the shape: in each, the fact that decided liability was *whether a certificate was in date*, and that fact was established after the deaths, from documents the operator held. LAYAK's gate check is the same question asked ninety seconds earlier, from a record the operator cannot edit.

The shape is not specific to Indonesia — the UK's LOLER 1998 has the same structure with a Report of Thorough Examination, and every jurisdiction with heavy lifting has a version. Indonesia is where this starts because the regulation is explicit, the inspection bodies are already a licensed third party, and the enforcement gap is well known to everyone working under it.

## 2. The core mechanic

**A certificate's validity is not a field. It is the entity's lifetime.**

A LAYAK certificate is created with `expiresIn` set to exactly the examination's validity period. When it lapses, it leaves the query surface. There is no expired row to accidentally read, no `valid_until` column to forget to filter on, no batch job that was supposed to mark it stale and didn't run on Sunday.

The gate check becomes the simplest query in the system: ask for a live certificate for this asset. **You get one, or you get nothing.** Nothing means the machine does not move. The system is fail-closed by construction rather than fail-closed by everyone remembering — which is the difference between a safety property and a coding convention.

Three consequences make it more than a trick:

**Two-level expiry.** The *inspector's own registration* is also an entity with a lifetime, renewed only by the body that issued it. So "was this certificate written by someone actually registered at the time they wrote it?" is answerable, and cannot be manufactured after the fact. A lapsed inspector cannot backdate themselves into good standing.

**The operative record and the statutory record are separate entities.** This is the correction that came out of testing the idea against the regulations, and it matters — see §3. A certificate that governs whether a machine may move should vanish the moment it lapses. A statutory examination record that must be retained for the life of the equipment must not. One examination therefore writes **two** entities with deliberately opposite lifetimes.

**History survives resale.** The asset entity's `$owner` transfers with the machine via `changeOwnership`. Every examination record carries an immutable `$creator` — the inspector who performed it — and is joined to the asset by a shared `assetId`. The buyer inherits the machine *and* its record. You cannot launder a machine's past by selling it, because the past was never in the seller's database.

## 3. Entity model

All numerics are **integers**; timestamps are unix seconds.

**Every entity carries `project: "layak"`.** Arkiv is one shared, public database — these entities sit beside everyone else's, and `type: "cert"` is a word many projects will reach for. There is no namespace primitive, so the namespace is an attribute, it is on every entity, and it is the first term of every predicate in §4. Getting this wrong in a fail-closed system is worse than getting it wrong elsewhere: a gate check that matched somebody else's `"cert"` entity would return green for a machine that has none.

### `Certificate` — the operative one. Its lifetime IS the validity.

| Attribute | Type | Notes |
| :--- | :--- | :--- |
| `project` | string | `"layak"` — the project namespace, on every entity in the model |
| `type` | string | `"cert"` |
| `assetId` | string | joins to `Asset` |
| `certType` | string | `"SLO-angkat"` \| `"SLO-angkut"` \| `"LOLER"` … `eq()` only |
| `siteId` | string | site at time of examination |
| `inspector` | string | inspector address, mirrored from `$creator` for `eq()` filtering |
| `bodyId` | string | the PJK3 / inspection body |
| `examRecordId` | string | joins to the archival record of the same examination |
| `issuedTs` | numeric | |
| `expiresAtTs` | numeric | **mirror of the entity's own expiry** — see §4, Q3 |
| `outcomeCode` | numeric | 0 pass · 1 pass-with-conditions |

**Lifetime: exactly the examination validity.** Permenaker's cadence maps directly onto it: the post-commissioning certificate is written with `expiresIn: 63072000` (two years), and every periodic one after that with `31536000` (one year). Both even, as lifetimes are measured in two-second blocks.

**Never updated, and — uniquely in this model — never extended.** `extendEntity` on a certificate would forge a re-examination that never happened, so extension is not a code path the product has. A re-examination is a *new* certificate, written by whoever actually performed it. **Naming where extension must not be available is as much a part of the design as naming where it is.** Nor is it ever updated: `updateEntity` is a full replace, and a certificate that can be rewritten after issue is a PDF again. A correction is a new certificate carrying `supersedesCertId`.

**But be precise about what that guarantees.** On Arkiv only the owner may extend an entity, and the certificate's owner is the inspector who wrote it. So a corrupt inspector *can* extend their own certificate — the prohibition is LAYAK's rule, not the protocol's, and claiming otherwise would be exactly the over-promise this design is meant to avoid.

What the protocol does guarantee is that **it cannot be done quietly.** The `ExamRecord` for the same examination is immutable and carries `examTs` and `regimeCode`, so the certificate's correct expiry is always recomputable from the regime cadence: `examTs + regimeSeconds(regimeCode)`. Any certificate whose `expiresAtTs` exceeds that is an extension that no examination supports — and it is a range query, not an audit. `gt(expiresAtTs, examTs + regimeSeconds)` is a standing anomaly report anyone can run over the whole register, without permission and without asking the inspector.

The honest formulation is therefore not *extension is impossible*. It is **extension is unforgeable-in-secret**, which for a licensed inspector whose registration can be revoked is the constraint that actually binds. Prevention would need a protocol feature that does not exist; detection needs only the two-entity split that already had to be there for statutory retention.

Only a failed examination writes no certificate at all. Absence is the fail state, and it is the same absence as expiry — which is the point.

### `ExamRecord` — the statutory one. It must outlive the certificate.

`type`, `assetId`, `examRecordId`, `inspector`, `bodyId`, `examTs` (numeric), `outcomeCode` (numeric, including 2 = fail), `defectCount` (numeric), `reportHash` (string), `regimeCode` (numeric), `testRatioBps` (numeric).

`testRatioBps` is the one place a decimal appears: a proof-load test is performed at some multiple of the safe working load, typically 1.25×. Numeric attributes are integers, so it is stored as basis points — `12500` — and the scale is named in the attribute. Anyone who stores that as `"1.25"` gets a string, and a string cannot answer `gte(testRatioBps, 12500)`, which is exactly the query an insurer asks when it wants every machine proof-tested to standard.

**Lifetime: 5 years, extended alongside the asset for as long as the equipment is in service.**

This entity exists because testing the design against the regulations surfaced a straight conflict. LOLER requires the Report of Thorough Examination to be **retained for the life of the equipment and produced on demand for the inspectorate**; Permenaker's *riksa uji* documentation carries the same expectation. A model where the record vanishes when the certificate lapses would fail an audit on day one — and expiry removing an entity from the *query surface* is no help when the statutory duty is precisely to produce it on demand.

So the same examination writes two entities in one `mutateEntities` batch: the certificate that governs movement and must vanish, and the record that proves the examination happened and must not. **Same event, opposite lifetimes, because they answer different questions** — and a failed examination writes an `ExamRecord` with `outcomeCode: 2` and no certificate at all, which is the most important row in the system and the one a paper regime loses most often.

### `Asset` — long-lived, ownership transfers with the machine

`type`, `assetId` (stable serial hash), `assetClass` (string), `siteId` (string), `manufacturedYear` (numeric), `capacityKg` (numeric), `regimeCode` (numeric — which inspection cadence applies).

**Lifetime: 2 years, extended annually** while the asset is in service. An asset nobody renews is an asset nobody is claiming responsibility for, and it drops off the register — the correct outcome, not a bug. **`$owner` is the operator of record** and moves with `changeOwnership` on sale or long-term hire.

### `Registration` — the inspector's own licence, alive only while renewed

`type`, `inspector`, `scheme` (string, e.g. `"PJK3"` / `"LEEA"`), `bodyId` (string), `scopeCode` (numeric), `grantedTs`, `expiresAtTs` (numeric mirror).

**Lifetime: the registration period, renewed by the issuing body — never by the inspector.** `$creator` is the body, immutably. An inspector cannot write their own registration into existence, because the entity's author is checkable and it is not them.

### `DefectReport` — append-only, written by anyone on site

`type`, `assetId`, `siteId`, `severityTier` (numeric 0–4), `reportedTs`, `reporterRole` (string), `photoHash` (string), `statusCode` (numeric).

**Lifetime: 30 days.** A near-miss nobody acts on lapses; that is correct, and it keeps honest logging cheap.

Escalation is **a new entity, not an extension** — because only the owner may extend, and the owner is the worker who filed it, who may be off-shift, off-site, or no longer employed. An `Escalation` (`defectId`, `severityTier`, `escalatedBy`, `escalatedTs`, lifetime 1 year) is written by the safety officer who picks it up. The original report lapses on schedule; the escalation carries it forward with a second, named author. **A design that needed the original reporter to still be around in order to preserve a serious finding would fail on exactly the reports that matter most.**

### `Prohibition` — how revocation works when the database executes nothing

`type`, `assetId`, `siteId`, `issuedBy`, `reasonCode` (numeric), `issuedTs`, `expiresAtTs` (numeric mirror). **Lifetime: until lifted or re-examined, extended by the issuing inspector.**

Arkiv never executes logic, so a tier-4 defect cannot revoke a certificate — there are no triggers, and a design that implied otherwise would be over-promising the model. Real regimes solve this with a separate instrument, a prohibition notice, and so does LAYAK: the gate check asks two questions instead of one. **A live certificate AND no live prohibition.** Both are one-line predicates, the second one written by an inspector who owns it and can lift it, and neither requires the database to do anything but answer.

This is also why the certificate's lifetime can stay simple. Revocation does not have to reach back into an issued certificate and shorten it — which, given owner-only extension and full-replace updates, would be both awkward and dangerous. It is a second, independent entity that the gate consults.

### `GateCheck` — proof that somebody looked

`project`, `type`, `assetId`, `siteId`, `checkedBy`, `checkedTs`, `resultCode` (numeric: 0 pass · 1 blocked-no-cert · 2 blocked-prohibition · **3 offline-cached**), `cacheAgeSec` (numeric). **Lifetime: 90 days, extended if an investigation opens.**

Every scan at the gate writes one tiny entity. This is the feature a site manager will actually ask for, and it inverts who the system protects.

After an accident the question is never only *was the machine certified* — it is **did anybody check**, and today the answer is a supervisor's word against a contractor's. A `GateCheck` is a signed, timestamped, unforgeable answer, written by the person who did the checking, that no employer can delete afterwards. It makes diligence provable rather than assertable, which is what an insurer is actually pricing when it prices a site.

It also makes the blocked cases visible: `resultCode` 1 and 2 are the moments the system did its job, and a site that never records one is either flawless or not scanning. `count(eq(type,"gate") AND eq(siteId,S) AND gte(checkedTs, T))` against the number of machine-movements is the cheapest honest measure of whether the process is real.

### Two objections a practitioner raises in the first minute

**"What happens when the gate has no signal?"** This is the objection to fail-closed, and it is the right one. A port at 5am with a flaky uplink cannot stop every machine because a query timed out — a safety control that halts operations during a network blip gets switched off within a week, and then protects nothing.

So the gate app holds a **signed local cache** of the certificates for assets on its own site, refreshed on every successful read. Offline, it answers from cache and writes the `GateCheck` with `resultCode: 3` and `cacheAgeSec` — the check happened, it was degraded, and *how* degraded is a number. Beyond a site-set staleness bound the cache stops answering and the machine genuinely stops. **The degradation is recorded rather than hidden**, which is the honest version: `count(eq(resultCode, 3))` is a site's own measure of how often it was flying blind, and an insurer will ask for it.

The cache is deliberately not a second source of truth. It cannot create a certificate, only remember one it already saw, and it expires faster than the certificates in it.

**"What stops an inspector backdating an examination?"** Nothing stops them writing `examTs` as last Tuesday. But every Arkiv write is a transaction, so **the time it was actually written is on-chain and not something the writer controls.** A certificate claiming an examination three weeks before the write is a claim that contradicts its own transaction, permanently, under the inspector's own key.

Be precise about the limit. The published SDK returns `createdAtBlock` as metadata on every entity (`select({ createdAtBlock: true })`), so the check is a per-entity read — no receipt lookup — and the gate-check card can show it beside the claimed `issuedTs` for free. What it is not is a *predicate*: filters run over attributes only, so this is a verification you run on a certificate in front of you, not a standing sweep across the register. That is a real difference from Q8's anomaly report, and it is the first item in §5's protocol feedback for exactly that reason.

**Relationships** are shared attribute keys: `assetId` joins certificates, records, defects, prohibitions, gate checks and the asset; `examRecordId` joins a certificate to the examination that produced it; `defectId` joins an escalation to its report; `inspector` joins a certificate to the registration that authorised it.

## 4. The queries the product lives on

Designed against the real constraints — string attributes support `eq()` only, ranges work on numerics, results are newest-first with no server-side ORDER BY, and no wildcard or prefix matching exists, so every string attribute above is an exact enumerated slug rather than free text.

Every predicate below is prefixed with `eq(project,"layak")`, elided for readability but never in the code. In a fail-closed system that term is load-bearing: it is what stops another project's `"cert"` entity from turning a red gate green.

**Q1 — The gate check: two predicates, both trivial.**
`eq(type,"cert") AND eq(assetId, A) AND eq(certType,"SLO-angkat")` — must return ≥1.
`eq(type,"prohibition") AND eq(assetId, A)` — must return 0.

Green needs both. What makes this trustworthy is not the predicates but the fact that an out-of-date certificate **cannot** be in the first result set, and a lifted prohibition cannot be in the second. There is no date comparison anywhere to get wrong. On any conventional stack this same check is one forgotten clause away from waving through an uncertified crane, and the revocation half is a status column somebody has to remember to update.

Then the scan writes a `GateCheck`, so the answer and the asking are both on the record.

**Q2 — Site compliance, as two counts.**
`count(eq(type,"asset") AND eq(siteId,S))` versus `count(eq(type,"cert") AND eq(siteId,S) AND eq(certType,T))`.
The **gap between the two counts is the risk number** — assets on site with no live certificate. A precision the published SDK forced: `.count()` in 0.7.0 returns one page's length (≤200), not a server-side total. A large site exceeds that, so the sketch fetches keys only (`select({ key: true })`) and sums pages through the cursor — still no attributes or payloads pulled, which was the point.

**Q3 — The renewal queue (and why `expiresAtTs` is mirrored).**
`eq(type,"cert") AND eq(siteId,S) AND lt(expiresAtTs, now + 604800) AND gte(expiresAtTs, now)`
Everything lapsing within seven days. This is why `expiresAtTs` is duplicated as a numeric attribute: the system expiration governs *whether* an entity is returned, but cannot be used in a range predicate, so a mirror is required to ask "what expires soon". Without it this screen is unbuildable — and this screen is what turns LAYAK from an audit tool into something a scheduler opens every morning.

**Q4 — The statutory pull.**
`eq(type,"exam") AND eq(assetId, A) AND gte(examTs, T0)`
Every examination this machine has ever had, passes and failures alike, cursor-paginated. This is the query that answers a labour inspector's demand, and the reason `ExamRecord` exists as a separate entity from `Certificate`.

**Q5 — The inspector's whole book.**
`eq(type,"exam") AND eq(inspector, 0x…) AND gte(examTs, T0)`
After an incident, the inspectorate pulls every examination an inspector ever performed. Held by no employer, deletable by no employer. An inspector under pressure to sign off a machine is protected by the same property that exposes one who does.

**Q6 — Was the issuer actually registered?**
`eq(type,"reg") AND eq(inspector, 0x…) AND eq(scheme,"PJK3")`
Run alongside Q1. A live certificate from an inspector with no live registration is the highest-value anomaly in the system, and it is one extra query to find.

**Q7 — Open defects, worst first.**
`eq(type,"defect") AND eq(assetId,A) AND gte(severityTier, 3)`
`severityTier` is a **coarse integer bucket, chosen precisely because there is no server-side ordering**: filtering to tier 3+ narrows the set to something a page genuinely holds, so the client-side sort ranks a real set rather than reshuffling an arbitrary page.

**Q8 — The extension anomaly report.**
`eq(type,"cert") AND gt(expiresAtTs, examTs + regimeSeconds)`
Every certificate living longer than its own examination justifies. This is the query that makes "certificates are never extended" a checkable statement rather than a promise, and anyone can run it over the whole register without permission. Both operands are integers, which is the only reason it is a query at all.

**Q9 — Was anybody actually checking?**
`count(eq(type,"gate") AND eq(siteId, S) AND gte(checkedTs, T0))`, and the same with `gte(resultCode, 1)`.
Scans performed, and scans that stopped something. A site with hundreds of movements and no gate checks is not a compliant site with a clean record; it is a site that never looked. **The absence of this number is the finding** — and it is the query an insurer runs before quoting, which is why it is in the model at all.

## 5. Expiry, extension and ownership as product features

**Expiry is the safety property.** Everywhere else in software, validity is data you must remember to check. Here it is the storage contract. The certificate's lifetime and the certificate's meaning are the same fact, which removes an entire class of bug — the stale row a report, an export or a third-party integration reads without filtering — by construction rather than by discipline.

**Extension is the liveness signal, and its deliberate absence is the integrity signal.** Assets are extended while in service; registrations while the body still vouches; defect reports while someone is still investigating; examination records for the life of the equipment. Certificates are *never* extended, because extension there would manufacture an examination. Five entity types, five lifetimes spanning thirty days to the equipment's service life, and one hard prohibition — **the shape of the lifetimes is the shape of the regulation.**

**Ownership carries history through resale.** `changeOwnership` on the `Asset` transfers the operator of record; the examination records keep their immutable `$creator`. The used-equipment market's oldest trick — sell the machine, leave the record behind — stops working, because the record was never the seller's to leave behind.

**`$creator` is the signature.** A certificate's author is the inspector, immutably and independently checkable; a registration's author is the accrediting body. Neither can be reassigned. This is what a laminated card has been pretending to be for fifty years.

**The tx hash is on the screen, not in the plumbing.** The green gate-check card renders the inspector's address and the transaction hash of the write beside the issue date. A supervisor who wants to check taps it; one who doesn't still benefits, because the certificate could not have been backdated. Verifiability nobody can see is verifiability nobody will pay for, so it is on the card.

**Nothing is ever deleted.** `deleteEntity` does not appear in this design. A contractor asking for an inspection record to be removed is precisely the request the system exists to refuse. Expiry is the only removal, it is a schedule set at write time by the inspector, and it applies to the certificate — never to the `ExamRecord`.

**Polling is the right fit, and that is lucky rather than clever.** Entity change events are polled by the SDK, not pushed. Every read in LAYAK is already a pull at the moment of the question: the gate check happens when someone stands at the gate, and the renewal queue is a scheduled morning read. There is no screen here that needs to learn about a write within milliseconds of it happening, so the polling model costs the design nothing.

### The Arkiv surface this design uses

| Arkiv primitive | Where it does work in LAYAK |
| :--- | :--- |
| Typed attributes, numeric | `expiresAtTs`, `examTs`, `severityTier`, `capacityKg`, `testRatioBps` |
| Integer-only numerics | proof-load ratio as basis points (`12500` = 1.25×), never a float |
| String attributes (`eq` only) | `certType`, `scheme`, `assetId` — enumerated slugs; no wildcard search exists, so none is designed for |
| Shared attribute keys | `assetId` joins asset, certificate, record and defects; `examRecordId`; `inspector` |
| `$creator` | the inspector's signature; the accrediting body's on a registration |
| `$owner` + `changeOwnership` | operator of record, transferred when the machine is sold |
| `expiresIn` | seven differentiated lifetimes: 30d defects · 90d gate checks · 1y certificates & escalations · 2y assets · registration period · prohibition until lifted · service life for records |
| **Owner-only extension** | the constraint that shaped three decisions: escalation is a new entity, revocation is a new entity, and certificate extension is made *detectable* rather than claimed impossible |
| `extendEntity` | assets, registrations, records, prohibitions — and on certificates, an anomaly Q8 catches |
| **Cost = size × lifetime** | why a 30-day defect report is cheap enough to file honestly, and a 90-day gate check cheap enough to write on every scan |
| `mutateEntities` | certificate + examination record written as one atomic batch |
| `updateEntity` | avoided entirely; corrections are new entities carrying `supersedesCertId` |
| `deleteEntity` | **deliberately unused** |
| Counts | site compliance as a gap between two counts |
| Cursor pagination | the statutory pull and the inspector's book |
| Tx hashes | rendered on the gate-check card; also what makes a backdated `examTs` self-contradicting |
| Encrypted payloads | defect diagnoses encrypted, `severityTier` left public — the split that keeps silence expensive |
| Project namespace | `project: "layak"` on every entity — a shared public database has no other separation |

### Who pays for the writes

**The inspection body pays for the certificate and the examination record**, and this is the part that makes adoption plausible rather than aspirational: a *riksa uji* is a scheduled visit by a qualified engineer with test equipment. Two entity writes against that fee is a rounding error, and the PJK3 gets a verifiable credential out of it — a cost that buys a competitive claim rather than a compliance expense.

**The site pays for its own gate checks**, which is why they are 90 days and tiny. **The asset owner pays to keep the machine on the register**, which is the point: paying is how you claim responsibility, and letting it lapse is how you stop.

The one genuinely long-lived entity is the `ExamRecord`, and its cost is a decades-long lifetime on a small payload — deliberately small, which is why the report itself lives elsewhere behind a hash.

### What this design would ask of Arkiv

Arkiv's roadmap says the phase after Devcon 8 is decided with the teams using it, and the current architecture came out of hackathon feedback. This is the feedback this design earned from friction rather than from a wishlist:

1. **Creation block as a predicate key.** The SDK already returns `createdAtBlock` as metadata, so the strongest anti-fraud check here — claimed examination date versus actual write block — is a per-entity read today. As a predicate key it would be a range query, and backdating would be caught by a standing report over the whole register rather than one certificate at a time. Related: `ArkivEntityExpired` is emitted on-chain when an entity lapses, so a certificate's expiry is an event an insurer can subscribe to, not a state someone has to poll for.
2. **Owner-delegable extension.** An `ExamRecord` must outlive the equipment, but only its owner may extend it — and its owner is an inspector who may retire, or a body that may be wound up, decades before the machine is scrapped. Today the answer is `changeOwnership` to a successor custodian, which works and requires the outgoing owner to still be present and willing. A delegation that survives the delegator would fit statutory retention far better than a transfer that depends on them.

Neither blocks the design. Both would remove a workaround.

## 6. Why Arkiv, and not Postgres

1. **The party who holds the data is the party the data is about.** The contractor runs the maintenance system, and the contractor is who the certificate exists to constrain. Every conventional build of this idea puts the fox in charge of the henhouse ledger, then asks the regulator and the insurer to accept its export as evidence. They currently do, and that is the problem, not the baseline.
2. **Expiry must be a guarantee, not a filter.** This is the whole idea. On Postgres, "expired certificates are not returned" is a convention every query must honour, forever, across every integration anyone ever writes. Here it is the storage layer's behaviour and no query can opt out of it. That is the gap between a control that works and a control that works until someone writes a new report.
3. **The reader is a stranger.** A site supervisor at a gate, an insurer, a labour inspector — none have an account on the contractor's system, and none should have to trust it. They need to verify authorship and timing themselves, which platform-asserted data cannot offer at any price.
4. **The history must outlive the relationship.** Machines are sold, hire companies fold, sites close and their software is decommissioned — but the statutory record is owed for the life of the equipment. The record therefore cannot live inside the operator.

Remove any one of these and LAYAK is a spreadsheet with extra steps.

**And the fourth pillar, stated precisely.** Arkiv's roadmap says DB-Chain block production stays **centralised** through November 2026. A regulator will ask the obvious question: if one operator sequences the chain, how is this better than the contractor's database? The answer is the Ethereum anchor. Certificates live on the DB-Chain and the machine's `$owner` is a wallet the contractor holds — but the chain's state is anchored to L1 for final verifiability, so the operator can order writes and could in principle refuse one, but **cannot rewrite an anchored certificate, its `$creator`, or the block it was written in** without the rewrite being visible against Ethereum. That is the property the backdating check and the extension-anomaly report depend on: they compare an inspector's claim against a record the inspector, the contractor *and the Arkiv operator* cannot quietly alter. What the anchor does not yet give is censorship-resistance, and LAYAK does not claim it — an inspection body whose write is refused has a grievance against the operator, not a forged certificate in the register, and those are very different failures. Verifiability now, permissionlessness later, in the roadmap's own order.

## 7. What deliberately stays OFF Arkiv

- **The reports themselves.** Riksa uji reports, photographs, load-test charts and thermography are large; the entity carries `reportHash` plus a pointer and the file lives in ordinary object storage. Arkiv holds the claim and the proof of the claim, not the megabytes.
- **Personal data.** Inspectors are addresses and registration numbers, never names, licence scans or contact details. Entities are public by design, so identity resolution belongs inside the PJK3's own system behind its own access control. Workers filing defect reports are a `reporterRole`, not a person.
- **Enforcement.** Arkiv stores and answers queries; it never executes logic. Nothing here stops a crane. LAYAK makes the gate check answerable in one query — the gate, the interlock and the stop-work order are the site's own systems reading Arkiv and acting.
- **Anything the site needs in the next 50 milliseconds.** No interlocks, no PLC in the loop, no machine that fails to start because a query was slow. LAYAK informs a decision a human or a scheduler makes; a design that put it in a safety-critical control path would be worse than the clipboard it replaced.
- **Commercial terms.** Hire rates, contracts and invoices are between the parties and have no business being public.

## 8. The first slice (a genuine weekend)

One asset class, one certificate type, one screen and one phone.

An inspector writes a `Certificate` and its `ExamRecord` in a single batch, with `expiresIn` set to the examination validity. A site supervisor opens a page, scans the asset's QR code, and it runs **Q1**. Green with the inspector's address and issue date, or red with nothing at all.

Then the demo that proves the idea: create a certificate with a **two-minute lifetime**, show green, wait, refresh — red, with no code having run, no job having fired and no date having been compared. That two-minute certificate is the whole pitch. Everything else is built on the fact that the red state arrived by itself.

**Two things v1 explicitly does not build:** the physical tagging supply chain (v1 assumes a QR sticker and admits the trust gap), and any identity system mapping inspector addresses to human beings — that stays inside the PJK3.

**Named risks, honestly.**

1. **Garbage in.** LAYAK proves *who* signed and *when*, and cannot prove the examination happened. It raises forgery from editing a PDF to committing attributable fraud under a registration that can be revoked — a real improvement and not a solution. I would rather say so than let a judge find it.
2. **Asset identity is the hard part, and the blind spot is bigger than forgery.** Binding `assetId` to a physical machine needs a tamper-evident tag, and that is a supply-chain problem this design does not solve.

   Worse: the easiest way to defeat LAYAK is not to forge a certificate but to **never register the machine at all.** An unregistered crane has no `assetId`, so there is nothing to scan, nothing to return zero rows, and nothing for Q2 to count — its compliance gap measures registered assets against live certificates, and a machine outside the register is outside the metric too. LAYAK can prove things about equipment it knows exists and is structurally blind to equipment it does not. That boundary is worth stating plainly, because a system that quietly implied otherwise would be more dangerous than the clipboard: the gap has to be closed by the site's own asset register and by inspectors refusing to work off-register, neither of which is a database feature.
3. **Adoption is regulatory, not technical.** The first customer is a PJK3 or an insurer with a portfolio-wide reason to want verifiable certificates, not an individual site — and if none adopts it, the entity model is correct and unused.

**How to kill this idea in a weekend, without deploying anything.** The riskiest assumption is not that the data model works. It is that **an inspection body will publish to a register it cannot edit.**

Everything here is an unalloyed good for the regulator, the insurer and the site. For the PJK3 it is a mixed proposition: it makes their work verifiable, and it also makes their mistakes permanent and their whole book pullable by anyone after an incident. If inspection bodies read Q5 and see a liability rather than a credential, the product has no writers, and no amount of schema quality fixes that.

That is answerable with conversations, not code. Show three PJK3 inspectors the two-minute-certificate demo and Q5, and ask one question: *would you rather your book was public, or your competitor's was?* The answer that kills the idea is a shrug. The answer that makes it is an inspector who has been undercut by someone signing off machines they never climbed — and that person exists in every inspection market I have heard about, which is the whole reason to test it rather than assume it.

**Distribution.** Not through developers, and not through sites. The write side is the constraint, so it goes through the bodies that already accredit inspectors and the insurers that already price sites: PJK3 associations and K3 practitioner networks, where verifiable credentials are a competitive weapon rather than an IT project. One inspection body publishing its book is worth a thousand site sign-ups, because a site cannot use LAYAK until somebody has written to it.

## 9. Verified against the published SDK, not the summary

The entity-model sketch (`layak.sketch.ts`) **type-checks with `tsc --strict` against `@arkiv-network/sdk@0.7.0` installed from npm.** That is a different standard from "consistent with the fundamentals doc", and it changed the design in four places:

| What the docs summary implied | What the package actually does | Design consequence |
| :--- | :--- | :--- |
| `buildQuery().where().fetch()` | `publicClient.select({…}).where(…).limit(n).fetch()`; operators from `@arkiv-network/sdk/query`; `limit` caps at 200 | Every query rewritten; pagination is explicit |
| "counts are supported" | `.count()` = length of one page | Site compliance sums pages by cursor, keys only |
| attributes as an object | `Attribute[]` of `{ key, value }`; `contentType` required | Schema tables unchanged; sketch corrected |
| `$creator` as something to mirror | `.createdBy()` / `.ownedBy()` on the builder; `creator`, `createdAtBlock`, `expiresAtBlock` returned as metadata | Backdating check is a per-entity read, not a receipt lookup; the gate card shows `createdAtBlock` |

It also surfaced primitives the summary never mentions and this design now uses or names: `not(key)` (attribute absent) and `neq()`; `validAtBlock()` on the builder — the after-accident "what did the register say at block N" question, kept as an upgrade path because whether expired entities are served there is undocumented; and the on-chain events `ArkivEntityExpired` and `ArkivEntityBTLExtended(…, cost)`, which mean a certificate lapsing is something an insurer can *subscribe to*, and every extension carries the cost paid for it.

Nothing in this section is deployed. It is what you learn by compiling against the real thing instead of reading about it — which is also the honest answer to "could a builder start from this schema".

### The sketch is executed, not just compiled — nine invariants, nine pass

Compiling proves the calls exist. It does not prove the design does what the prose says. So the sketch code — unchanged — is run against `MemArkiv`, an executable specification of the twelve Arkiv rules this design depends on, each cited to the SDK source or the fundamentals (owner-only extend, full-replace update, 2-second blocks, expiry leaving the query surface, one-page `count()`, atomic batches, the four on-chain events…). It is not Arkiv and claims nothing about performance; it is the referee for the design's *logic*, and it runs in under a second with no network. Files: `evidence/memarkiv.ts`, `evidence/invariants.test.ts`, result in `evidence/invariants.result.txt`.

| # | Invariant | What it would have caught |
| :-- | :--- | :--- |
| 1 | An expired certificate is not returned — with **no date filter anywhere** in the query | The whole idea |
| 2 | A failed exam writes the statutory record and **no** certificate, in one atomic batch | A pass-only register |
| 3 | The record outlives the certificate | The statutory-retention bug the first draft had |
| 4 | A non-owner cannot extend; an owner who extends a certificate **is caught by Q8** | Over-claiming "impossible" instead of "detectable" |
| 5 | Live certificate + lapsed asset → **amber**, never green | Orphaned machines reading as compliant |
| 6 | A prohibition turns the gate red and lifts without touching the certificate | Needing triggers that do not exist |
| 7 | Resale moves `$owner`; every record keeps `$creator` | History laundered by sale |
| 8 | 350 assets count as 350, not 200 | The naive `.count()` the first draft relied on |
| 9 | An odd `expiresIn` is rejected | Silent `InvalidExpirationError` in production |

One honest detail: the first run of invariant 1 **failed** — because the test expected red where the design returns amber (certified, but no asset claims responsibility). The design was right and the test was wrong. That is the kind of mistake a referee exists to catch, and it is left in the test file as a comment.

### And against what comes next: `0.8.0-dev`

The public roadmap says the September testnet runs a rebuilt architecture. Its SDK is already on npm under the `dev` tag (`0.8.0-dev.3`), so I read it too. It does not invalidate this design; it makes it **smaller**, and it confirms one piece of feedback.

| This design, on 0.7.0 | On 0.8.0-dev | Effect |
| :--- | :--- | :--- |
| `expiresAtTs` mirrored as an integer so "what lapses next week" is a range query | `$expiresAt` is a **queryable system attribute** (`u64`) | The mirror disappears. The renewal queue is `$expiresAt < now+7d`, native |
| `testRatioBps = 12500` — integers only, scale named in the key | typed attributes: `dec` stores up to 18 fractional digits **exactly** as int256 | `testRatioBps` becomes `dec("1.25")`. Same query, no scaling convention |
| `examRecordId`, `inspector`, `bodyId` as strings | `key` and `addr` are attribute types | Relationships become **typed references**, not string conventions; an inspector is an address the query engine understands |
| validity as `expiresIn` seconds from now | `ExpirationTime.atDate(date, { atLeast })` — an absolute deadline with a minimum lifetime | A certificate's expiry is literally the date on the examination report. The design's core idea gets a first-class primitive |
| `updateEntity` is a full replace, so nothing is updated | `patchEntity` with `set` / `unset` | The trap is gone. The certificate stays append-only anyway — that was an evidence decision, not a workaround |
| no prefix search, so `assetId` is an exact slug | `startsWith` on strings | A yard's whole fleet by asset-id prefix becomes one query |
| `.count()` = one page | no `count()` in the builder at all | The page-and-sum in the sketch is the right shape on both versions |
| `createdAtBlock` returned, not filterable | `$createdAt` is still **result-only** | **Protocol feedback #1 stands** on the new architecture too: backdating is still a per-entity check, not a sweep |

The upgrade is mechanical and every entity survives it with fewer attributes. I have not sketched against `0.8.0-dev` because its API is explicitly unreleased — but knowing the direction is why this design mirrors nothing it will not need to.

## 10. The hard questions, answered

**Everything on Arkiv is publicly readable. What happens when a competitor queries a rival's whole fleet?** This is the sharpest objection and it deserves a real answer.

For **certificates it is not a problem, it is the mechanism.** A gate check performed by a stranger with no account is the core use case; a certificate readable only by permission would be a laminated card again.

For **defect reports it is a genuine cost**, and the design splits the entity to pay only the part that is worth paying. Arkiv's own guidance is to keep private data off or encrypt the payload, with the encryption layer left to the designer — so LAYAK draws the line straight down the middle of the entity:

- **Attributes stay public.** `severityTier` is queryable by anyone. This is deliberate and non-negotiable, because it is what stops silence being cheap: a fleet with no tier-4 reports is either exceptional or not reporting, and that distinction has to be visible.
- **The payload is encrypted** to the asset owner, the accrediting body and the site's insurer. The diagnosis, the repair quote and the photograph are commercially sensitive and serve no public purpose; the count and the severity serve the entire purpose.

A competitor scraping a rival's fleet therefore learns *how many* tier-4 defects it logged and nothing about what they were. That is still real exposure and I would rather name it than pretend encryption erases it — an operator who logs honestly still looks worse than one who logs nothing.

The answer is that this trade is not new. Aviation incident registers, restaurant hygiene ratings and vehicle test histories are all public, all commercially uncomfortable, and all considered net-good in exactly the domains where the failure mode is someone getting hurt. LAYAK takes the same position on purpose. What it must not do is make silence cheap — which is why Q2 measures the **gap** between assets and live certificates rather than counting reports: a site that logs nothing scores worse on the metric that matters, not better.

**What happens when a referenced entity expires?** Two cases, and testing them is what produced `ExamRecord`.

The first is the one that changed the design: a certificate lapsing would have taken the statutory record with it, which the regulations forbid. Splitting the examination into two entities with opposite lifetimes resolves it.

The second is subtler and stays in the product as a *feature*: a live certificate whose `Asset` has lapsed off the register. That is not an error to hide — it means nobody renewed responsibility for a machine that is still certified, which is precisely the machine that quietly moves between yards. So the gate check runs Q1 **and** an asset-liveness check, and an orphaned certificate renders amber rather than green: certified, unclaimed, ask who owns it.

**Can one adopter get value on day one?** Yes, and this is the structural advantage over anything needing a network. One inspector and one site are a complete loop: he writes a certificate, she scans the code at the gate, the answer is green or nothing. No second inspector, no consortium, no standards body. The registration cross-check and resale history are strictly better with more participants, but the core promise — *this cannot be out of date* — holds at n=1.

**Who writes the first 100 entities?** A PJK3 backfills its current book, which is the smallest write that creates immediate portfolio-wide value; failing that, one crane-hire yard, entered from its existing spreadsheet. The activation event is unusually crisp: **the first time a machine is stopped at a gate because the query returned nothing.** One prevented movement is the entire pitch, told back by the customer.

**What breaks first at 100×?** Q5, the inspector's whole book, is the only unbounded query — an inspector accumulates examinations over a career, and there is no ordering to lean on. It is bounded by an `examTs` range and cursor-paginated, and it is an audit query rather than an interactive one, so pages are acceptable. Everything a user touches daily is partitioned by `siteId` or pinned to a single `assetId`, which keeps filters selective no matter how large the shared database gets. That is why `siteId` is denormalised onto certificates rather than reached through the asset: without joins, the partition key has to be on the entity you actually query.

**What is the obvious version ten other people will submit?** "An on-chain certificate registry" — the Other lane's first seed at face value: certificates as entities with `issuedAt` and `validUntil` attributes. It is a fine idea and it throws away the only thing that makes it worth doing, because `validUntil` as an attribute is `valid_until` as a column, and every bug it was meant to prevent comes straight back the first time someone forgets the predicate. The separating decision is a data-model one and it is a single line: **the validity period is passed to `expiresIn`, not stored as an attribute** — and `extendEntity` is then forbidden on that entity type, because the mechanic every other entity here depends on would, on this one, be forgery.
