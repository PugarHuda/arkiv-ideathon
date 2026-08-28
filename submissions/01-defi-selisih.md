# SELISIH — a multi-witness flight recorder for DeFi risk state

*Selisih is Indonesian for the **difference** between two numbers. Berselisih is to be in dispute. One word for both halves of this product.*

**Track:** Challenge 3 · DeFi (host: Marcos Miranda) · closes Aug 31, 23:59 UTC

**One-line pitch:** Independent watchers each publish their own signed snapshot of the same lending market every round — and the product is not the snapshot, it's the *disagreement* between them: queryable while it matters, kept only by whoever pays to keep it.

---

## In one screen

- **Problem.** After a liquidation cascade, the only record of what the system saw is the protocol's own log — written by the party under investigation. A single-writer log is a claim, not evidence.
- **Mechanism.** N independent witnesses each write their own reading of the same market and round under their own key. The core query returns a *set to compare*, not a row to read. Six agreeing and one 440bps lower is the product; the outlier is named by an immutable `$creator`.
- **Not an oracle.** Oracles collapse N observations into one settleable value. SELISIH never aggregates, never resolves, and never writes a median. Seven different numbers is it working.
- **The constraint that became the mechanic.** Only the owner may extend, so nobody can preserve or destroy anyone else's evidence. Cost = size × lifetime turns each witness's chosen lifetime into a bet (`fundedDays`, queryable); anyone else who wants a reading kept writes their own `EvidencePin` and pays for it.
- **The hole, closed.** Copying witness 1 is free and looks like consensus. A salted `Commit` before each reveal makes that impossible — using Arkiv's own store-commitments-not-secrets guidance.
- **Seven entities, six lifetimes**, 25/25 documented primitives used or explicitly declined, two pieces of protocol feedback earned from friction.
- **Off Arkiv:** execution, aggregation, enforcement, raw feeds, alerting.
- **Kill test, run twice on real mainnet state.** Chainlink vs Uniswap at the same block: 423 bps apart at the crash bottom. Then the incumbent's *own* 31 nodes, decoded from `NewTransmission`: **868 bps spread in one round**, six nodes >200 bps from the published median. The disagreement already exists, signed, on-chain — and is thrown away. Day one, SELISIH's witnesses are already there.

## If you are reading a similar idea

The track's own seeds — a liquidation-snapshot dashboard, oracle round notes — will produce several entries that *sound* like this one. The rubric scores uniqueness on "a twist that changes what gets stored or asked", so here is exactly what is stored or asked differently, in a form a look-alike would have to reproduce rather than paraphrase:

| Decision in the data model | What the obvious version does instead |
| :--- | :--- |
| Primary key is `(market, round, witness)`; the core query returns a **set to compare** | `(market, round)`; the core query returns a row to read |
| The median is computed client-side and **never written** | Stores an aggregated value — and is then an oracle on a hot path |
| Snapshot lifetime is chosen and paid by the witness → `fundedDays`, verifiable against `cost` in `ArkivEntityCreated` | One blanket lifetime; retention is an ops setting |
| A reader preserves evidence with their **own** `EvidencePin`, because only the owner can extend | Assumes a dispute can extend someone else's entity (it cannot) |
| A salted `Commit` precedes every reveal | Nothing stops a witness copying witness 1 |
| Reputation is two numbers: broke from peers, and broke from peers **and was vindicated** | One number, which punishes the best witness |
| `RosterEpoch` stores "who was expected" while it is still true | Queries live registrations and answers wrong after they expire |
| The kill test was **run** on 62 mainnet blocks, not proposed; the sketch **compiles and executes** against the SDK | Prose |

Everything in the right-hand column is a reasonable first draft. Several of them were *this* idea's first draft. The difference is not the pitch; it is what the schema had to become to survive its own tests.

---

## 1. The problem, and who it's for

When a DeFi lending market has a bad day — a cascade of liquidations, a stale oracle print, a health-factor computation that turns out to have been wrong — nobody can reconstruct what the system actually saw at that block.

Today the reconstruction comes from the protocol's own logs. The protocol that just liquidated you writes the post-mortem, from a database it controls, weeks later. That is fine for a blog post and worthless for a decision. The people who need the answer are:

- **Risk / DAO governance** deciding whether to reimburse users after an incident.
- **Underwriters and cover protocols** pricing a market, and settling a claim after a loss.
- **Liquidators and solvers** arguing that the state they acted on was the state that existed.
- **Borrowers** who were liquidated and have no standing to say the number was wrong.

The gap is not "there's no data". The gap is **there's no data anyone on the other side of the dispute will accept.** A single-writer log is not evidence. It's a claim.

This is not hypothetical, and it is not old. On **10 March 2026** Aave's CAPO oracle applied a wstETH/ETH rate of ~1.1939 while the on-chain rate was ~1.228 — a 2.85% disagreement between two observers of the same quantity — and 34 E-Mode positions were liquidated for about **$27 million**, with liquidation bots collecting ~499 ETH in bonuses. The post-mortem was written by Chaos Labs, the protocol's own risk manager; reimbursement came from the DAO treasury on the strength of that account. On **5 August 2024**, over **$231 million** was liquidated on Aave in a single day, the largest event in its history — and the kill test in §9 shows what two independent observers saw at the bottom of that day: a 423 bps disagreement at the same block. In both cases the question afterwards was the same — *what did the system actually see, and who says so?* — and in both cases the only answer came from a party inside the system.

SELISIH makes risk state adversarial: N independent witnesses observe the same market, each writes their own snapshot under their own key, and nobody has to be trusted — because the interesting query is where they *diverge*.

## 2. Why this is not an oracle (the thing to read first)

The nearest neighbours are oracle networks, and the difference is the whole idea, so I would rather state it plainly than let a judge assume it away.

**Chainlink** aggregates many sources into one feed and streams it on-chain at intervals. **Pyth** does the same at high frequency. **UMA** takes a proposed value, opens a challenge window, and escalates a dispute to a token vote that returns a resolved answer. Different mechanisms, one shared purpose: **collapse N observations into 1 authoritative value that something downstream can settle against.**

SELISIH's purpose is the exact opposite. **It never aggregates, never resolves, and produces no value at all.**

| | Oracle networks | SELISIH |
| :--- | :--- | :--- |
| Output | one canonical value | N attributable readings, kept apart |
| Purpose of disagreement | a failure to be resolved away | the product |
| Settles anything? | yes, that is the point | no, ever |
| Slashing / token vote | central to the design | absent by construction |
| Position | on the hot path | explicitly off it |

An oracle that returns seven different numbers has malfunctioned. SELISIH returning seven different numbers is SELISIH working. The median is rendered as a faint dashed line and is never written anywhere, because the moment a canonical value exists, someone builds on it and SELISIH is on a hot path it was designed to stay off.

What it borrows honestly from that prior art is the **dispute window**: UMA's optimistic oracle runs a 48-hour liveness period, and 72 hours is chosen as the snapshot lifetime for the same reason — it is roughly how long a challenge to a piece of market evidence stays live in practice.

## 3. The core mechanic

**a. Divergence is the alarm.** Seven witnesses reporting `healthFactorBps = 10420` is noise. Six reporting `10420` and one reporting `9980` is a signal that something is wrong — a bad oracle feed, a partial view, or a witness with an agenda. The product surfaces the spread, not the value. Every reading carries an unforgeable `$creator`, so divergence is always attributable.

**b. Silence is evidence.** Because expiry is a protocol guarantee rather than a cron job, and because a witness's registration entity is *alive only while it keeps being renewed*, "witness 4 did not report in round 812" is a checkable fact, not an absence in someone's logs. A witness that quietly stops reporting during the exact window a market blew up cannot hide that — and when its registration lapses, the chain emits `ArkivEntityExpired(entityKey, owner)`. Leaving is not a missing row; it is a log entry with your key on it.

**c. Lifetime is a bet, because only the owner can extend.** On Arkiv, only an entity's owner may extend it — so a disputant cannot reach in and preserve someone else's reading. That constraint looked like a problem and turned out to be the best mechanic in the design.

Cost on Arkiv is size × lifetime. So when a witness chooses how long to fund its own snapshot, it is **spending money in proportion to its confidence**. The 72-hour floor is the protocol convention; a witness that pays for ninety days on a reading is staking real cost on being right, and `fundedDays` is a numeric attribute anyone can filter on. Conviction becomes queryable.

And the inverse is the sharper half. A witness whose reading turns out to be damning cannot delete it — but it *can* decline to extend it. **Letting your own evidence lapse is an act**, it is visible in advance through `expiresAtTs`, and the roster shows exactly who chose it. Silence at write time and silence at renewal time are two different signals, and SELISIH surfaces both.

**Anyone else who wants a reading preserved pays for it themselves.** An underwriter or a liquidated borrower writes an `EvidencePin`: their own entity, which they own and fund, carrying the full copy and the original's tx hash. Expiry removes an entity from the query surface **without erasing on-chain history**, so a pin remains checkable against the original write long after the original has left the index. Preserving evidence becomes a public good with a named, attributable funder — and nobody needs the witness's permission to do it.

## 4. Entity model

All numerics are **integers**; decimals are scaled to fixed point and the scale is named in the attribute key. All timestamps are unix seconds.

**Every entity carries `app: "selisih"`.** Arkiv is one shared, public database — my entities sit beside everyone else's, and `kind: "snapshot"` is a word other projects will reach for too. There is no namespace primitive to lean on, so the namespace is an attribute, it is on every entity, and it is the first term of every predicate in §5. Without it, the divergence board is one naming collision away from rendering somebody else's data as a witness disagreement, which is the most embarrassing possible failure for a product about evidence.

### `RiskSnapshot` — append-only, never updated

The atom. One witness's view of one market at one round.

| Attribute | Type | Notes |
| :--- | :--- | :--- |
| `app` | string | `"selisih"` — the project namespace, on **every** entity in the model (see below) |
| `kind` | string | `"snapshot"` — discriminator, `eq()` only |
| `market` | string | e.g. `"aave-v3-eth-wsteth"` — `eq()` only, so it is an exact slug |
| `round` | numeric | monotonic round id; the join key across witnesses |
| `blockNumber` | numeric | the block the witness read |
| `observedTs` | numeric | unix seconds |
| `priceE8` | numeric | collateral price, fixed point ×1e8 |
| `healthFactorBps` | numeric | position health, basis points (10000 = 1.0) |
| `totalDebtE6` | numeric | debt, ×1e6 |
| `collateralE6` | numeric | collateral, ×1e6 |
| `atRiskCount` | numeric | positions under the liquidation threshold this round |
| `deviationBps` | numeric | this witness vs the previous round's cross-witness median |
| `severityTier` | numeric | coarse 0–4 bucket derived from `deviationBps` |
| `fundedDays` | numeric | how long the witness chose to pay for — its conviction, made queryable |
| `expiresAtTs` | numeric | mirror of the entity's own expiry, so "what lapses next" is a range query |
| `sourceHash` | string | hash of the raw feed bundle held off-Arkiv |

Payload: a compact JSON of the top-K at-risk positions (ids + `healthFactorBps`), capped in size.

**Lifetime: chosen by the witness, floor 72h** (`expiresIn: 259200`). Only the owner may extend, so this is the witness's own bet and nobody else's decision.

**No `witness` attribute — and the first draft had one.** Checking the published SDK (`@arkiv-network/sdk@0.7.0`) showed the query builder exposes `.createdBy(address)` natively and returns `creator` on every entity, so mirroring `$creator` into an attribute "for filtering" was redundant. Removed. The same check found that `fundedDays` is more than self-reported: the chain emits `ArkivEntityCreated(entityKey, owner, expirationBlock, cost)` on every write, so the **cost a witness actually paid** for its chosen lifetime is in the event log and checkable against the attribute. Conviction is not a claim; it is a receipt.

**Never updated.** Append-only is a deliberate choice: `updateEntity` is a full replace, and a snapshot that could be rewritten after the fact is not evidence. A correction is a *new* snapshot carrying `supersedesRound` — both stay visible, and the correction is itself signed and timestamped. The original is never silently edited, which is the entire point.

### `Commit` — the entity that makes divergence honest

| Attribute | Type | Notes |
| :--- | :--- | :--- |
| `app` / `kind` | string | `"selisih"` / `"commit"` |
| `market` | string | |
| `round` | numeric | |
| `digest` | string | hash of the reading plus a per-round salt — the committer is `$creator`, read natively |
| `committedTs` | numeric | |

**Lifetime: 24h** (`expiresIn: 86400`). Tiny payload, so it is nearly free to write.

Without this, the whole product has a free-rider hole big enough to hollow it out. **The cheapest way to be a witness is to read what witness 1 published and copy it.** A copier costs nothing to run, never diverges, never gets flagged, and quietly turns seven independent observers into one observer and six mirrors — while the board keeps reporting reassuring agreement. Consensus produced by copying looks exactly like consensus produced by correctness, and that is the failure mode that would kill SELISIH silently rather than loudly.

So each round runs in two beats. Witnesses first write a `Commit` carrying only a salted hash; once the commit window closes they publish the `RiskSnapshot` with the salt. Arkiv's own guidance is to keep secrets off and **store commitments or hashes instead**, which is exactly what a digest is — nothing confidential is written, and the reading itself is public a minute later. A witness cannot copy a number nobody has revealed yet, and one that reveals a value not matching its own commit has published a discrepancy under its own key that anyone can check forever.

The cost of the pattern is one extra cheap write per round and a minute of latency, which SELISIH can afford precisely because it is off the execution hot path. On a hot path this would be unacceptable; here it is free.

### `WitnessRegistration` — alive only while renewed

| Attribute | Type | Notes |
| :--- | :--- | :--- |
| `kind` | string | `"witness"` |
| `witness` | string | address |
| `market` | string | the market this witness covers |
| `bondRef` | string | pointer to the stake held in a contract off-Arkiv |
| `activeSince` | numeric | unix seconds |
| `expiresAtTs` | numeric | **mirror** of the entity's own expiry, so it is range-queryable |

**Lifetime: 7 days** (`expiresIn: 604800`), extended by the witness itself as a heartbeat. Stopping the renewal *is* the deregistration — there is no "please remove me" transaction, and no operator who could forget to process one. The roster is self-maintaining.

### `RosterEpoch` — append-only, long-lived

`kind`, `market`, `epoch` (numeric), `roundFrom` / `roundTo` (numeric), `witnessCount` (numeric); payload lists the witness addresses live during that epoch. Written once a day, **lifetime 1 year**.

This entity exists because of a lifetime mismatch that would otherwise be a silent correctness bug — see §11. Registrations expire in days; disputed snapshots live for months; so "who was on the roster in round 812" cannot be answered by querying live registrations. `RosterEpoch` stores that fact while it is still true.

### `Dispute` — single authoritative writer

| Attribute | Type | Notes |
| :--- | :--- | :--- |
| `kind` | string | `"dispute"` |
| `disputeId` | string | uuid |
| `market` | string | |
| `roundFrom` / `roundTo` | numeric | the range of evidence being frozen |
| `openedTs` | numeric | |
| `deadlineTs` | numeric | end of the challenge window |
| `statusCode` | numeric | 0 open · 1 upheld · 2 rejected · 3 withdrawn |
| `claimHash` | string | hash of the full claim text, held off-Arkiv |

**Lifetime: challenge window + 30 days.** Updated in place — safe *here*, because exactly one party (the disputant) may write it, which is the only shape where a full-replace update is not a race. Every other entity in the model is append-only for precisely that reason.

### `EvidencePin` — anyone can preserve a reading, at their own cost

| Attribute | Type | Notes |
| :--- | :--- | :--- |
| `kind` | string | `"pin"` |
| `market` / `round` | string / numeric | the reading being pinned |
| `pinnedWitness` | string | whose reading it was |
| `originTxHash` | string | the original write, checkable on-chain forever |
| `pinnedTs` | numeric | |
| `expiresAtTs` | numeric | mirror |

Payload: the verbatim copy of the pinned snapshot. **Lifetime: chosen and paid for by the pinner**, typically 1 year.

This entity exists because only an owner may extend, so a reader who needs a reading preserved cannot preserve the original — they must make their own. The `$creator` of a pin is the party who thought it mattered, which is itself information: an underwriter pinning six readings the day before a market broke is a fact about the underwriter. Nothing is forged by pinning, because `originTxHash` resolves against on-chain history that expiry never touched.

### `Resolution` — append-only, written by the arbiter

| Attribute | Type | Notes |
| :--- | :--- | :--- |
| `disputeId` | string | |
| `arbiter` | string | |
| `outcomeCode` | numeric | |
| `vindicatedWitness` | string | which witness's divergent reading the process found correct |
| `vindicatedRound` | numeric | |
| `rationaleHash` | string | |
| `decidedTs` | numeric | |

Written once, never edited; `$creator` is the arbiter, so a resolution cannot be retroactively attributed to someone else. Note what this is *not*: it records that a human process reached a conclusion. It does not make that conclusion binding, and SELISIH has no mechanism that acts on it.

`vindicatedWitness` closes an incentive flaw the first draft had. Q3 counts how often a witness diverged from its peers — but **divergence is not error.** The most valuable witness in the system is the one who broke from the consensus and turned out to be right, and a reputation query that only counts disagreement quietly punishes exactly that behaviour. Vindication is the counterweight, and it is why the reputation screen shows two numbers rather than one.

**Relationships** are shared attribute keys throughout: `market` + `round` joins snapshots across witnesses; `disputeId` joins a dispute to its resolution; `witness` joins a snapshot to its registration; `market` + `epoch` joins a round to the roster expected to cover it.

## 5. The queries the product lives on

Written against the real constraints: string attributes support `eq()` only, range operators work on numerics, results come back newest-first with no server-side ORDER BY, and a `limit` applied before a client-side sort gives you the top of a page rather than a true global top-N. Every query below is therefore designed so the **filter** narrows the set to something one page holds, and sorting is cosmetic.

Every predicate below is prefixed with `eq(app,"selisih")`, elided here for readability but never in the code — in a shared public database it is the term that keeps the whole result set mine.

**Q1 — The divergence check (the core screen).**
`eq(kind,"snapshot") AND eq(market,"aave-v3-eth-wsteth") AND eq(round, 812)`
Returns one row per witness for that round — bounded by roster size, so a single page holds it. The client computes median, spread and outliers. The query the whole product is built around needs no ordering at all.

**Q2 — Who is missing.** A `count` on Q1's predicate, compared against a `count` of live `WitnessRegistration` for that market. If 7 are registered and 6 reported, the seventh row of the dashboard is the interesting one. A precision the SDK forced: in 0.7.0 `.count()` returns the length of **one page** (≤200), not a server-side total — fine for a roster, and the sketch pages-and-sums for anything that could exceed it.

**Q3 — Witness track record, as two numbers.**
`.createdBy(0x…)` with `eq(kind,"snapshot") AND gte(severityTier, 3)` — times this witness broke from its peers. Creator filtering is a native builder method, not an attribute predicate.
`eq(kind,"resolution") AND eq(vindicatedWitness, 0x…)` — times it broke from them and was right.

One number alone is misleading, and which one you drop decides what the product rewards. `severityTier` is a **coarse integer bucket that exists purely to make the first filter narrow enough to be an honest top-N** — `deviationBps > 50` alone would match more than a page can hold, and sorting a page is not ranking a set. This is reputation the witness cannot edit and no operator can quietly launder.

**Q3b — Conviction.**
`eq(kind,"snapshot") AND eq(market, M) AND gte(fundedDays, 30)`
Every reading someone paid to keep alive well past the dispute window. Because cost is size × lifetime, this filter returns the readings their own authors were willing to spend on — a signal no conventional database can produce, because in a conventional database storage duration is an operations decision and costs the writer nothing.

**Q4 — Danger scan across a market.**
`eq(kind,"snapshot") AND eq(market, M) AND lt(healthFactorBps, 10500) AND gte(round, N)`
Everything near the liquidation threshold in the recent window, per witness. A numeric health factor is what makes this possible; stored as text it would be unqueryable.

**Q5 — Open disputes, and the pin queue.**
`eq(kind,"dispute") AND eq(statusCode, 0) AND gte(deadlineTs, now)`
For each open dispute the UI then runs `eq(kind,"snapshot") AND eq(market,M) AND gte(round, from) AND lte(round, to) AND lt(expiresAtTs, deadlineTs)` — **the readings that will lapse before the dispute they matter to is resolved.** That list is the product's call to action: anyone who cares can pin them, at their own cost, before they go. A conventional system would silently delete them on schedule and nobody would know what had been lost.

**Q6 — Regulator / underwriter pull.**
`eq(kind,"snapshot") AND eq(market, M) AND gte(observedTs, T0) AND lte(observedTs, T1)`
The full multi-witness record of an incident window, cursor-paginated, verifiable by the reader against `$creator` and tx hashes without asking the protocol for anything.

## 6. Expiry, extension and ownership as product features

**Expiry is the retention policy, and it is why the product is affordable.** Rounds are frequent and almost all of them are boring. A 72-hour default means SELISIH pays for the window in which a dispute could plausibly be raised, and nothing more. On a conventional stack the equivalent is a retention cron owned by the same party the evidence is about — not a retention policy, an honour system.

**Only the owner may extend, and that constraint shapes the whole product.** A disputant cannot preserve a witness's reading, so retention is never something done *to* evidence by an interested party. Each witness funds its own lifetime — a bet priced in size × lifetime — and everyone else preserves what they care about by writing their own `EvidencePin` and paying for it. Two separate mechanisms, each with a funder whose name is on it, and neither requiring anyone's permission.

**Extension is also the liveness proof.** A witness's registration is a heartbeat: renewal is participation, lapsing is exit. `mutateEntities` batches the routine writes — a snapshot plus its roster update — respecting the 1000-operation cap, and where a sweep spans transactions the design never assumes ordering, because operations in different transactions are not atomic with each other and can land in either order.

Neither renewal nor lapse needs an operator to act, so the historical roster cannot be rewritten to say someone wasn't watching when they were.

**`$creator` is the reputation primitive.** Every snapshot's author is immutable and independently checkable. We use `$creator` and deliberately not `$owner` for attribution — `$owner` is transferable, and a track record that can change hands is not a track record.

**`changeOwnership` handles the case that would otherwise break attribution.** Witness operators are real businesses: keys get rotated, a desk gets acquired, an on-call rota hands over. `changeOwnership` on the `WitnessRegistration` transfers who may renew and amend it, while every past `RiskSnapshot` keeps the `$creator` that wrote it. **Operational control moves; authorship does not.** That split is exactly why Arkiv exposes two fields instead of one, and a design that used `$owner` for attribution would let a witness sell its track record along with its infrastructure.

**Nothing is ever deleted.** `deleteEntity` does not appear anywhere in this design, and its absence is deliberate: a system where evidence can be removed on request is not an evidence system. Expiry is the only mechanism by which anything leaves the query surface, and expiry is a schedule set at write time by the author — not a decision available to anyone afterwards, including us.

### The Arkiv surface this design uses

| Arkiv primitive | Where it does work in SELISIH |
| :--- | :--- |
| Typed attributes, numeric | `healthFactorBps`, `priceE8`, `round`, `severityTier` — every value the product filters on |
| Integer-only numerics | prices ×1e8, debt ×1e6, health in basis points; the scale is in the attribute name |
| String attributes (`eq` only) | `market`, `witness`, `kind` — enumerated slugs, never free text |
| Shared attribute keys | `market`+`round` joins witnesses; `disputeId`, `market`+`epoch` |
| `$creator` | attribution on every reading — the reputation primitive |
| `$owner` + `changeOwnership` | operational control of a registration, separated from authorship |
| `expiresIn` | five differentiated lifetimes: 72h floor snapshots · 7d registrations · window+30d disputes · 1y roster epochs · pinner-funded pins |
| **Owner-only extension** | the constraint the design is built on: nobody can preserve or destroy someone else's evidence |
| **Cost = size × lifetime** | turned into `fundedDays` — conviction priced in storage, and queryable |
| `extendEntity` | the witness heartbeat, and a witness choosing to stand behind its own reading |
| `mutateEntities` | snapshot + roster update in one batch, chunked under the 1000-op cap |
| `updateEntity` | one entity type only (`Dispute`), where a single writer makes full-replace safe |
| `deleteEntity` | **deliberately unused** |
| Counts | "who is missing" without fetching rows |
| Cursor pagination | the incident pull (Q6) |
| Tx hashes | rendered next to each reading, so the reader verifies rather than trusts |
| Hash commitments | the `Commit` round — Arkiv's guidance is to store commitments, not secrets |
| Project namespace | `app: "selisih"` on every entity — a shared public database has no other separation |

### Who pays for the writes

Worth answering plainly, because on Arkiv storage is a real cost rather than a rounding error hidden in someone's cloud bill.

**Witnesses pay for their own readings**, and that is the design rather than an inconvenience: a cost the writer bears is what makes `fundedDays` mean anything. A witness's per-round bill is one small commit plus one capped summary at the 72-hour floor — the cheapest possible position, and the correct one for an honest low-conviction reading. **Pinners pay for pins**, so anyone who wants evidence kept beyond what its author would fund is the party spending money on it. **The roster epoch is written once a day** by whoever runs the board.

Nobody pays for anyone else's opinion, which is the only reason the cost signal is readable at all. Where it bites is granularity: rounds cannot be arbitrarily frequent, and §9 names that as a real bound rather than an implementation detail.

### What this design would ask of Arkiv

Arkiv's public roadmap says the phase after Devcon 8 is decided with the teams using it, and the current architecture came out of hackathon feedback. So here is the feedback this design actually earned — from friction, not from a wishlist. Two things, both small:

1. **Third-party-fundable lifetime extension.** Owner-only extension is the right default and it produced the best mechanic in this design. But `EvidencePin` exists only because a reader who wants a reading preserved must *duplicate* it rather than fund it, storing the same bytes twice. An operation letting a non-owner pay to extend, while gaining no right to modify, would remove the duplication and keep every guarantee intact.
2. **Creation block as a predicate key.** The published SDK already returns `createdAtBlock` as metadata on every entity (`select({ createdAtBlock: true })`) — so "was this attribute backdated?" is a per-entity read today, cheaper than the receipt lookup a first draft assumed. What it is not is *filterable*: predicates run over attributes only. As a predicate key, "everything written after block N claiming a timestamp before it" becomes one range query over the whole register instead of a walk.
3. **Documented semantics for `validAtBlock()`.** The builder exposes it. If it serves historical state — entities valid at a past block, including ones since expired — then `RosterEpoch` collapses into a query and one entity type leaves this design. Whether it does is not documented, so the design keeps the entity and names this as the upgrade path rather than assuming it.

None of these is needed for SELISIH to work as designed. All three would make it smaller.

## 7. Why Arkiv, and not Postgres

Three properties, and the pitch collapses without all three:

1. **The writers are adversarial to each other, and to the reader.** Witnesses compete; disputants have money at stake; the protocol under examination has the strongest motive of anyone to shape the record. There is no operator all of them would accept as custodian — and a conventional database requires exactly that operator to exist.
2. **The reader must verify without permission.** An underwriter settling a claim, or a DAO voting on reimbursement, needs to check authorship and timing themselves. Platform-asserted authorship — "trust our API, this row came from witness 4" — is worth nothing in the one situation the product exists for.
3. **Expiry has to be a guarantee, not a job.** "Snapshots older than 72h are deleted, extended only on dispute" is a claim on Postgres and a property here. The whole retention argument, and with it the cost model, rests on that difference. Equally, expiry removes an entity from the *query surface* without erasing on-chain history — exactly the semantics evidence needs. Old evidence stops being served without ever having been unsaid.

Remove any one and SELISIH is a worse Grafana.

**And the fourth pillar, stated precisely.** Arkiv's public roadmap is candid that DB-Chain block production stays **centralised** through Devcon 8 in November 2026, with decentralisation a later phase. For an evidence product that has to be answered head-on: why trust a centrally sequenced database with the record? The answer is the Ethereum anchor. Entities live on the DB-Chain and are owned by the witness's wallet, but the chain's state is anchored to L1 for final verifiability — so the sequencer can order writes and could, in principle, refuse them, but it **cannot rewrite what has been anchored** without that rewrite being visible against Ethereum. That is exactly the property SELISIH leans on: a witness's `$creator` and the tx hash a pin carries are checkable against the anchor, not against the operator's word. What the anchor does *not* give yet is censorship-resistance or liveness, and SELISIH does not claim them — a witness whose write is refused publishes elsewhere and the refusal is itself an event worth recording. Verifiability now, permissionlessness later: that is the roadmap's own sequencing, and the design is honest about which one it uses.

## 8. What deliberately stays OFF Arkiv

- **Execution.** No liquidations, no matching, no oracle feed anyone trades against. SELISIH is read after the fact, by humans and by claims processes, and is explicitly not on any protocol's hot path. Nothing in DeFi should block on it.
- **Aggregation.** The median is computed in the client and never written. A canonical value stored here would immediately be built on, which would put SELISIH on the hot path it exists to stay off. This is the one omission that is load-bearing rather than merely prudent.
- **Enforcement.** Arkiv stores and answers queries; it never executes logic. There are no triggers and no slashing here. Witness bonds live in a contract; SELISIH supplies the evidence a slashing decision is made *from*, and an off-chain agent reads Arkiv and acts.
- **Raw feed bundles and full position tables.** Large payloads stay in object storage; the entity carries `sourceHash` and a pointer. Snapshots are summaries plus top-K, deliberately capped.
- **Anything private.** Entities are public by design. No borrower identities beyond position ids that are already on-chain, no witness infrastructure details, no keys.
- **Real-time alerting.** Entity change events are polled by the SDK, not pushed, so a witness's own paging runs on its own infrastructure. Arkiv is where the claim is *filed*, not the pager.

## 9. The first slice (a genuine weekend)

One market. Three witnesses. One screen.

Witnesses are three scripts run by three different people, each writing a `RiskSnapshot` per round under its own key. The screen runs **Q1** and renders one row per witness with the spread highlighted, plus **Q2**'s two counts as a "6 of 7 reporting" badge. That is the entire core: if three independent parties can look at one screen and agree about what they disagreed about, the idea is proven. Disputes and extension are the second weekend.

**Two things v1 explicitly does not build:** the arbitration flow (disputes are written and frozen, but resolution is a human process off-product), and the bond contract (witnesses are listed with a `bondRef` that points at a stake I am not writing).

**Named risks, honestly.**

1. **Collusion.** Divergence detects disagreement, not a cartel. What SELISIH guarantees is *attributable* readings, not correct ones — a smaller claim than it first appears, and one I would rather state than have a judge find. Bonded, publicly listed witnesses are the mitigation, not a fix.
2. **Round alignment.** Witnesses must agree what round 812 means, so `round` is derived deterministically from block height, never from wall-clock time.
3. **Write cost sets a floor on granularity.** Cheap short lifetimes and summary payloads keep it viable, but the honest answer is that cost, not design, bounds how fine-grained the recorder can be.

**The kill test — run, not proposed.** The riskiest assumption is not technical: it is that **independent watchers actually disagree.** If competent parties observing the same market always produce the same number, there is no divergence, no signal, and no product — just an expensive way to write one number seven times.

So I ran it, against real Ethereum mainnet state, with nothing deployed. Two genuinely independent observation methods for the same quantity — ETH/USD — at the same block: **Chainlink's aggregated feed** (`latestRoundData` on the ETH/USD proxy) and **Uniswap V3 spot** (`slot0` on the USDC/WETH 0.05% pool), read via archive `eth_call` at 31 blocks across the 5 August 2024 crash and 31 blocks across a quiet window three weeks later. Script and raw output are attached (`evidence/killtest.py`, `evidence/killtest.txt`) and re-run in about three minutes against any archive RPC.

| | Median abs Δ | p90 | Max |
| :--- | ---: | ---: | ---: |
| Stress — 5 Aug 2024, blocks 20,455,000–20,462,500 | **17.5 bps** | 41.4 | **423.1 bps** |
| Calm — ~25 Aug 2024, blocks 20,600,000–20,607,500 | 7.6 bps | 23.7 | 39.1 bps |

At block **20,459,000** — the bottom of the cascade — Chainlink reported **$2,233.80** while Uniswap spot was at **$2,139.28**. A 4.2% disagreement between two honest observers of the same market, at the same block, at exactly the moment liquidation engines were deciding who to liquidate. On the divergence board that block is a single orange dot 400 basis points below the line, with a `$creator` on it.

The idea survives, and the shape of the survival matters: divergence is not noise that happens to be larger under stress — median disagreement rises 2.3×, but the *tail* rises 10.8×. Independent observation fails hardest precisely when the answer matters most, which is the entire case for recording who saw what rather than settling on one number.

One honest note on method: a third observer, the Aave V3 oracle, was attempted and its call reverted at those blocks; it is excluded rather than approximated. And because Aave's oracle wraps Chainlink for ETH, it would not have been an independent witness anyway — a reminder that "different source" and "independent observation" are not the same thing, which is exactly why the commit round exists.

**The second kill test: the incumbent's own witnesses.** Then a sharper question occurred to me. Chainlink's feed is *itself* an aggregation of ~31 independent node readings. Every round, the aggregator emits `NewTransmission(…, int192[] observations, bytes observers, …)` — **every node's individual observation is on-chain**, and only the median becomes "the price". So the disagreement SELISIH is built to surface already exists, already signed, inside the incumbent — and is thrown away. Nobody can query it.

I decoded it. 161 transmissions of the ETH/USD aggregator across the crash window and 18 across a calm one (`evidence/chainlink_nodes.py`, `evidence/chainlink_nodes.json`):

| Per-round node spread, (max−min)/median | Median | p90 | Max |
| :--- | ---: | ---: | ---: |
| Stress — 5 Aug 2024, 161 rounds | **49.5 bps** | 212.8 | **868.5 bps** |
| Calm — ~25 Aug 2024, 18 rounds | 3.3 bps | 6.5 | 10.2 bps |

At block **20,458,998**, the 31 nodes observed from **$2,141.32 to $2,335.32** — an 8.7% spread between honest, bonded, professionally run observers of the same market at the same instant — and the protocol published **$2,233.80**. **Six of the 31 nodes** were more than 200 bps from that median — two below (−414, −302 bps) and four above (+211 to +455 bps). The lowest node saw almost exactly what Uniswap spot saw in the first test. Every one of those 31 numbers is in `evidence/chainlink_round_20458998.json`, attributed to its node index in the oracle set as the `observers` bytes report it. (Mapping index to operator address needs the aggregator's configuration at that block; I did not decode it and do not claim it.)

This changes what SELISIH is on day one. The witnesses do not have to be recruited: **the incumbent already has 31 of them, and their readings are already signed and already public.** The first product is a decoder that writes each `NewTransmission` observation as its own entity — `(feed, round, nodeIndex)` — with the node's address as `witness`, so that "which nodes saw $2,141 at the bottom of the cascade?" becomes a query instead of an archaeology project. Chainlink is not the adversary here; it is the first and best data source, and the thing it discards by design is exactly the thing SELISIH keeps.

The ratio is also the point. Median node disagreement rises **15×** under stress; the maximum rises **85×**. That is not noise scaling with volatility — that is independent observation failing hardest at the exact moment a liquidation engine is choosing whom to liquidate, and then being collapsed into one number nobody can interrogate afterwards.

**Distribution.** The first hundred readers are not new users to find; they are people already awake at 3am during an incident. Risk forums where lending-market parameters are argued, the governance threads where reimbursement votes happen, and cover-protocol underwriting channels are where this gets posted — attached to a specific incident, the day after it, showing what the divergence board would have shown. A tool for arguments belongs where the argument already is.

## 10. Verified against the published SDK, not the summary

The entity-model sketch (`selisih.sketch.ts`) **type-checks with `tsc --strict` against `@arkiv-network/sdk@0.7.0` installed from npm.** That is a different standard from "consistent with the fundamentals doc", and it changed the design:

| What the docs summary implied | What the package actually does | Design consequence |
| :--- | :--- | :--- |
| `buildQuery().where().fetch()` | `publicClient.select({…}).where(…).limit(n).fetch()`; operators from `@arkiv-network/sdk/query`; `limit` caps at 200 | Every query rewritten |
| "counts are supported" | `.count()` = length of one page | Fine for a roster; summed by cursor anywhere it could exceed a page |
| mirror `$creator` into an attribute | `.createdBy()` native; `creator` returned as metadata | `witness` attribute deleted from the schema |
| cost is "size × lifetime" in the abstract | `ArkivEntityCreated(…, cost)` and `ArkivEntityBTLExtended(…, cost)` are emitted on-chain | `fundedDays` is checkable against the receipt — conviction is not self-reported |
| expiry "removes from the query surface" | `ArkivEntityExpired` is an on-chain event | "Silence is evidence" is literally an event log entry with the witness's key on it |

It also surfaced `not(key)` — used in Q1 to return originals only, excluding corrections — and `validAtBlock()`, which if it serves historical state makes `RosterEpoch` unnecessary. Whether it does is undocumented, so the entity stays and the upgrade path is named.

Nothing here is deployed. It is what you learn by compiling against the real thing instead of reading about it.

### The sketch is executed, not just compiled — eight invariants, eight pass

The sketch code — unchanged — runs against `MemArkiv`, an executable specification of the twelve Arkiv rules this design depends on, each cited to the SDK source or the fundamentals. It is not Arkiv; it is the referee for the design's *logic*, offline, in under a second. Files: `evidence/memarkiv.ts`, `evidence/invariants.test.ts`, `evidence/invariants.result.txt`.

| # | Invariant | What it would have caught |
| :-- | :--- | :--- |
| 1 | The board returns a **set** per round, one row per witness; the outlier carries its `creator`; "6 registered, 5 reported" is a count difference | A single-writer design in disguise |
| 2 | A correction is a new entity; `not("supersedesRound")` shows originals only, both stay visible | Silent edits |
| 3 | A disputant **cannot** extend a witness's reading; a pin written by the reader survives the original's expiry and carries its tx hash | The broken first-draft mechanic |
| 4 | Cost in `ArkivEntityCreated` scales with funded lifetime — 90 days costs >20× three days | `fundedDays` as an unverifiable claim |
| 5 | The pin queue lists exactly the readings that lapse before the dispute deadline | Evidence expiring unnoticed mid-dispute |
| 6 | A witness that stops renewing emits `ArkivEntityExpired` under its own key | "Silence is evidence" as a slogan |
| 7 | Track record uses `createdBy`; **no** `witness` attribute exists on any snapshot | The redundant mirror the first draft had |
| 8 | After registrations expire, live queries answer "who was expected?" **wrong**; `RosterEpoch` answers right; `validAtBlock` answers right if history is served | The correctness bug found in round one |

### And against what comes next: `0.8.0-dev`

The September testnet runs a rebuilt architecture, and its SDK is already on npm under the `dev` tag (`0.8.0-dev.3`). I read that too. It makes this design smaller and confirms one piece of feedback:

| This design, on 0.7.0 | On 0.8.0-dev | Effect |
| :--- | :--- | :--- |
| `expiresAtTs` mirrored so the pin queue can range-filter on lifetime | `$expiresAt` is a **queryable system attribute** | The mirror disappears; `$expiresAt < deadline` is native |
| `priceE8`, `healthFactorBps` — integers, scale in the key | `dec` type, 18 exact fractional digits | Prices and ratios stored as written. `severityTier` stays an integer bucket on purpose |
| `vindicatedWitness`, `pinnedWitness` as strings | `addr` type | Witness identity is a typed address the engine understands |
| `validAtBlock()` — named as an upgrade path for `RosterEpoch` | `atBlock(block)` — still there | The upgrade path survives the rewrite |
| `.count()` = one page | no `count()` in the builder | The page-and-sum pattern in the sketch is the right shape on both |
| `createdAtBlock` returned, not filterable | `$createdAt` is still **result-only** | **Protocol feedback #2 stands** on the new architecture |

Not sketched against `0.8.0-dev` because it is explicitly unreleased — but it is why nothing here is mirrored that the next version will not need.

## 11. The hard questions, answered

**What happens when a referenced entity expires?** This was the sharpest hole in the first draft and it changed the model. A `WitnessRegistration` has a 7-day lifetime; a `RiskSnapshot` under dispute can be extended for months. So the registration that authorised a snapshot will routinely be gone from the query surface long before the snapshot is. Asking "was witness 4 on the roster in round 812?" by querying live registrations gives the wrong answer with total confidence — the worst kind of bug for an evidence system.

The fix is `RosterEpoch`: roster membership becomes a historical fact stored at the time it was true, rather than an inference from present state. Attribution itself never depends on it — `$creator` is on every snapshot forever, so who wrote a reading survives regardless. `RosterEpoch` answers only the separate question of who was *expected* to write, which is exactly what Q2 needs and what a live-registration query silently gets wrong.

**Single-player mode — can one adopter get value on day one?** Yes, and this matters because divergence obviously needs N ≥ 2. A solo risk desk running one witness still gets something Postgres cannot give it: **its own readings become unforgeable to itself.** "We published this health factor before the cascade, and we could not have edited it afterwards" is a defensible claim in front of a DAO, an auditor or a counterparty — and it is precisely the claim an internal log cannot make, because an internal log is exactly as editable as its owner is motivated. Divergence is the multiplayer unlock; self-binding commitment is the single-player floor.

**Who adopts first, and who writes the first 100 entities?** The decoder does — and the first hundred are not mine. A single process tails the ETH/USD aggregator's `NewTransmission` logs and writes each node's observation as its own entity; one round is 31 entities, and the crash window alone is 161 rounds. Day one, SELISIH is a queryable, per-node, per-block history of what the incumbent oracle's own witnesses saw — with no new witness recruited and nothing asked of Chainlink. Independent witnesses (a risk desk's own reads, a subgraph, a venue's spot) join as second-class citizens of the same schema, and the divergence board compares all of them. Three witnesses on one lending market, run from three machines, was the first-draft answer; it is still the minimum, but it is no longer where the data comes from. The first adopters are risk contributors and cover underwriters, and what they were doing immediately before is refreshing a Dune dashboard and a protocol Discord during an incident — reading numbers with no author. The activation event is narrow and observable: **the first time two witnesses disagree and the board shows who was out on a limb.** Until that happens the product is a chart; the moment it does, it is evidence.

**Where does a user SEE verifiability?** On the divergence row. Each witness's reading renders with its `$creator` address and the tx hash of the write, side by side with the spread — so the outlier is named, not anonymised into an error bar. Verifiability that lives only in the plumbing is not worth paying for, so it is the leftmost column.

**What breaks first at 100×?** Q4, the danger scan, is the least selective query in the set: as positions per market grow, `lt(healthFactorBps, 10500)` alone matches a lot. `market` is therefore the hard partition — SELISIH never queries across markets — and `severityTier` is the coarse bucket that keeps the filter narrow enough that a page is a real answer. Q1 does not degrade at all, because it is bounded by roster size rather than position count, which is a deliberate reason to build the core screen on it.

**Everything here is publicly readable — what about scrapers?** Public reads are the product, not a leak. A competitor querying the whole board is the intended use, because evidence nobody outside can check is not evidence. Nothing written is confidential: positions are already on-chain, witnesses are meant to be identifiable, and the payload is a capped summary behind a hash.

**What is the obvious version ten other people will submit?** A single-writer liquidation dashboard — the track's own second seed, read literally: one service snapshots health factors on a schedule and stores them on Arkiv. It is a reasonable idea and it fails the counterfactual, because a single writer signing its own log is just a log with a signature on it. The separating decision is in the data model, not the framing: **the primary key is `(market, round, witness)` rather than `(market, round)`**, the same round is written N times by N parties, and the core query returns a set to be compared rather than a row to be read.
