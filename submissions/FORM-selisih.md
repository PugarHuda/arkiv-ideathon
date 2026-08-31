# SELISIH — form-ready answers (tally.so/r/OD9eeY)

Field labels below follow the rules doc's canonical list. Paste each block into its field. Every block is self-contained — a judge who reads only one field still gets a complete thought. Full write-up and diagrams are the supporting link.

---

## Idea name
SELISIH

## One-line pitch
A multi-witness flight recorder for DeFi risk state: independent watchers each publish their own signed snapshot of the same lending market, and the product is the *disagreement* between them — queryable while it matters, kept only by whoever pays to keep it.

## Which track?
DeFi

## The problem — and who it's for
When a lending market has a bad day — a liquidation cascade, a stale oracle print, a health factor that turns out to have been wrong — nobody can reconstruct what the system actually saw at that block. The reconstruction comes from the protocol's own logs: written by the party the investigation is about, from a database it controls, weeks later.

The people who need the answer are risk/DAO governance deciding on reimbursement, underwriters and cover protocols settling a claim, liquidators arguing the state they acted on existed, and liquidated borrowers with no standing to say the number was wrong. The gap is not "there's no data". It's that **there is no data anyone on the other side of the dispute will accept.** A single-writer log is a claim, not evidence.

SELISIH makes risk state adversarial. N independent witnesses observe the same market and each writes its own reading under its own key. Nobody is trusted, because the interesting query is where they diverge. Seven witnesses reporting the same health factor is noise; six agreeing and one 440bps lower is a signal — and the outlier is named by an immutable `$creator`.

It is explicitly **not an oracle.** Chainlink, Pyth and UMA all exist to collapse N observations into one value something downstream can settle against. SELISIH never aggregates, never resolves, and produces no value — the median is drawn as a dashed line and never written. An oracle returning seven different numbers has malfunctioned; SELISIH returning seven different numbers is SELISIH working.

## Scope — the first slice you'd build
One market. Three witnesses, run as three scripts by three different people, each writing a `RiskSnapshot` per round under its own key. One screen: the divergence row for a round (one row per witness, spread highlighted, `$creator` and tx hash as the leftmost column) plus a "6 of 7 reporting" badge from two counts. If three independent parties can look at one screen and agree about what they disagreed about, the idea is proven. Disputes, pins and the commit round are the second weekend.

**Explicitly not building in v1:** the arbitration flow (disputes are recorded; resolution is a human process off-product) and the bond contract (`bondRef` points at a stake I am not writing).

**How to kill it without deploying anything:** the riskiest assumption is that independent watchers actually disagree. Reconstruct a real lending-market incident with three genuinely different observation methods (direct contract reads, a subgraph, a commercial risk API) block by block. If they agree to the basis point throughout, there is no divergence, no signal and no product — and a spreadsheet says so before a build does.

## The entities and typed attributes you'd write
All numerics are integers with the scale in the key. Every entity carries `project: "selisih"` — Arkiv is one shared public database and there is no other namespace. Relationships are shared attribute keys.

**RiskSnapshot** (append-only, never updated; lifetime chosen by the witness, floor 72h): `market` (string slug), `round` (numeric, from block height), `blockNumber`, `observedTs`, `priceE8`, `healthFactorBps` (10000 = 1.0), `totalDebtE6`, `collateralE6`, `atRiskCount`, `deviationBps`, `severityTier` (0–4 coarse bucket), `fundedDays` (numeric — how long the witness paid for), `expiresAtTs` (numeric mirror of own expiry), `sourceHash`. Payload: capped top-K at-risk positions. A correction is a new entity with `supersedesRound`; `updateEntity` is full-replace and a rewritable snapshot is not evidence.

**Commit** (24h): `market`, `round`, `digest` (salted hash); the committer is `$creator`. Written before the reveal, so a witness cannot copy a number nobody has published yet. Arkiv's guidance is to store commitments, not secrets — a digest is exactly that.

**WitnessRegistration** (7d, extended by the witness as a heartbeat): `witness`, `market`, `bondRef`, `activeSince`, `expiresAtTs`. Lapsing *is* deregistration; no operator has to act.

**RosterEpoch** (1y, append-only): `market`, `epoch`, `roundFrom`, `roundTo`, `witnessCount`; payload lists addresses. Exists because registrations expire in days while disputed snapshots live for months — "who was on the roster in round 812" cannot be answered from live registrations.

**Dispute** (window + 30d; the one entity updated in place, because exactly one writer makes full-replace safe): `disputeId`, `market`, `roundFrom`/`roundTo`, `openedTs`, `deadlineTs`, `statusCode`, `claimHash`.

**EvidencePin** (lifetime chosen and paid by the pinner): `market`, `round`, `pinnedWitness`, `originTxHash`, `pinnedTs`, `expiresAtTs`; payload is the verbatim copy. Exists because only the owner may extend — a reader who wants a reading preserved must write their own.

**Resolution** (append-only, `$creator` = arbiter): `disputeId`, `outcomeCode`, `vindicatedWitness`, `vindicatedRound`, `rationaleHash`, `decidedTs`. Records a conclusion; binds nothing.

**What this schema stores differently from a liquidation-snapshot dashboard:** the primary key is `(market, round, witness)` so the core query returns a set to compare, not a row; the median is never written; lifetime is chosen and paid by the witness (`fundedDays`, checkable against `cost` in `ArkivEntityCreated`); a reader preserves evidence with their own `EvidencePin` because only the owner can extend; a salted `Commit` precedes every reveal; reputation is two numbers; `RosterEpoch` stores "who was expected" while it is still true. Several of the obvious alternatives were this idea's own first draft.

## The queries you'd rely on
All prefixed `eq(project,"selisih")`. Strings support `eq()` only; results are newest-first with no server-side ORDER BY, so every filter is narrow enough that a page is a real answer.

1. **Divergence board:** `eq(type,"snapshot") ∧ eq(market,M) ∧ eq(round,812)` — one row per witness, bounded by roster size, needs no ordering. Median and spread computed client-side.
2. **Who is missing:** `count` of the above vs `count(eq(type,"witness") ∧ eq(market,M))`. Two counts, no fetch.
3. **Track record, as two numbers:** `.createdBy(W)` with `eq(type,"snapshot") ∧ gte(severityTier,3)` (times it broke from peers — creator filtering is native to the SDK's builder, so no attribute mirrors `$creator`) and `eq(type,"resolution") ∧ eq(vindicatedWitness,W)` (times it broke and was right). One number alone punishes the best witness in the system. `severityTier` is a coarse integer bucket precisely so the filter, not a sort, does the work.
4. **Conviction:** `eq(type,"snapshot") ∧ eq(market,M) ∧ gte(fundedDays,30)` — readings their own authors paid to keep. Cannot exist in a database where storage costs the writer nothing.
5. **Danger scan:** `eq(type,"snapshot") ∧ eq(market,M) ∧ lt(healthFactorBps,10500) ∧ gte(round,N)`.
6. **Pin queue:** `eq(type,"dispute") ∧ eq(statusCode,0) ∧ gte(deadlineTs,now)`, then per dispute `gte(round,from) ∧ lte(round,to) ∧ lt(expiresAtTs,deadlineTs)` — readings that will lapse before the dispute they matter to is resolved. The call to action.
7. **Incident pull:** `eq(type,"snapshot") ∧ eq(market,M) ∧ gte(observedTs,T0) ∧ lte(observedTs,T1)`, cursor-paginated, verifiable by the reader without asking the protocol for anything.

## How expiry / extension / verifiable ownership work as product features
**Only the owner may extend — and that constraint is the best mechanic in the design.** A disputant cannot reach in and preserve a witness's reading, so retention is never done *to* evidence by an interested party. Instead, cost = size × lifetime turns lifetime into a bet: a witness paying for 90 days on a reading is staking money on being right, and `fundedDays` makes that filterable. The inverse is sharper — a witness whose reading turns out damning cannot delete it, but can decline to extend it. Letting your own evidence lapse is an act, visible in advance through `expiresAtTs`, with the roster showing who chose it.

Anyone else who wants a reading kept writes an `EvidencePin` at their own cost, carrying the original's tx hash. Expiry removes an entity from the query surface without erasing on-chain history, so a pin stays checkable long after the original left the index. Nobody can destroy someone else's evidence; nobody needs permission to save it.

**Extension is the liveness proof.** A registration is a heartbeat; renewal is participation, lapsing is exit, and neither needs an operator — so the historical roster cannot be rewritten to say someone wasn't watching.

**`$creator` is the reputation primitive**, deliberately not `$owner`: a track record that can change hands is not a track record. `changeOwnership` moves operational control of a registration (keys rotate, desks get acquired) while every past snapshot keeps its author. `deleteEntity` is unused by design.

Five differentiated lifetimes: 72h-floor snapshots · 24h commits · 7d registrations · window+30d disputes · 1y roster epochs · pinner-funded pins.

## Why the idea genuinely needs Arkiv over a plain database
Three properties, and the pitch collapses without all three. (1) **The writers are adversarial to each other and to the reader** — witnesses compete, disputants have money at stake, and the protocol under examination has the strongest motive to shape the record. There is no operator all of them would accept as custodian, and a conventional database requires exactly that operator to exist. (2) **The reader must verify without permission** — "trust our API, this row came from witness 4" is worth nothing in the one situation the product exists for. (3) **Expiry has to be a guarantee, not a job** — the whole cost model rests on "kept only as long as someone pays" being a property rather than a cron owned by an interested party. And the signal that makes SELISIH more than a chart — conviction priced in storage — cannot exist where keeping a row costs the writer nothing.

Remove any one and SELISIH is a worse Grafana.

On the fourth pillar, precisely: Arkiv's roadmap says block production stays centralised through November 2026. SELISIH relies on the **Ethereum anchor**, not on decentralised sequencing — the operator can order or refuse writes but cannot rewrite an anchored `$creator` or tx hash without it showing against L1. Verifiability now; censorship-resistance is a later phase and is not claimed here.

## What deliberately stays off Arkiv
**Execution** — no liquidations, no matching, no feed anyone trades against; nothing in DeFi should block on this. **Aggregation** — the median is computed in the client and never written; a canonical value stored here would immediately be built on, putting SELISIH on the hot path it exists to stay off. This is the one omission that is load-bearing. **Enforcement** — Arkiv never executes logic; witness bonds live in a contract and SELISIH supplies the evidence a slashing decision is made *from*. **Raw feed bundles and full position tables** — capped summaries behind a `sourceHash`. **Anything private** — positions are already on-chain, witnesses are meant to be identifiable. **Real-time alerting** — change events are polled, not pushed; Arkiv is where the claim is filed, not the pager.

**Honest limit:** divergence detects disagreement, not a cartel. What SELISIH guarantees is *attributable* readings, not correct ones.

## Supporting links (optional)
Full write-up with diagrams, the kill-test chart, and the entity-model sketch: https://pugarhuda.github.io/arkiv-ideathon/submissions/selisih.html

**Watch it run on that exact round** — one unedited real-time take, no cuts: https://pugarhuda.github.io/arkiv-ideathon/submissions/video/selisih.html — the 31 node observations are read from the decoded evidence file in the repo and written as 31 separate entities, one per witness key. The board is `divergence()` imported unmodified from the sketch: the outlier is named by its `$creator`, the median is computed on screen and never written, and when the outlier's own lifetime runs out a disputant's `extendEntity` is refused — only the pin it wrote and paid for survives. The page is at https://pugarhuda.github.io/arkiv-ideathon/submissions/video/demo/selisih.html if you would rather run it yourself.

Two things in there are evidence rather than description. (1) The **kill test was run twice**, against real Ethereum mainnet archive state. First, Chainlink vs Uniswap ETH/USD at the same block across the 5 Aug 2024 crash — max **423 bps** apart at block 20,459,000. Then the incumbent's own witnesses: Chainlink's aggregator emits every node's observation in `NewTransmission` and publishes only the median, so I decoded 161 rounds — at block 20,458,998 the 31 nodes saw **$2,141 to $2,335 (868 bps)** and the feed said $2,233.80; six nodes were >200 bps off. Median node spread 49.5 bps under stress vs 3.3 calm. The disagreement SELISIH exists to keep is already signed and on-chain, and discarded; day one, the witnesses are Chainlink's own nodes, decoded — nothing to recruit. Scripts and raw output are in the write-up. (2) The TypeScript sketch **type-checks with `tsc --strict` against `@arkiv-network/sdk@0.7.0` from npm**, which corrected the first draft in four places and removed an entity attribute. (3) The sketch is then **executed** against an executable spec of the documented semantics — eight invariants (one row per witness with the outlier attributable; corrections beside originals; a disputant cannot extend but a pin survives; cost scales with funded lifetime; the pin queue finds what lapses before the deadline; lapsing emits `ArkivEntityExpired`; `createdBy` replaces a mirrored attribute; `RosterEpoch` answers right where live registrations answer wrong) — all pass. (4) Read against `0.8.0-dev`: `$expiresAt` becomes queryable, `dec`/`addr` types arrive, `atBlock()` survives, and `$createdAt` stays result-only, so the protocol feedback stands. Nothing is deployed.
