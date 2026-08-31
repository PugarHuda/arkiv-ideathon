# Every long-text Tally field is capped at 700 characters (the form rejects more: "Please enter 700
# characters or less"). These are the <=700-char versions — the ones that actually get pasted.
# Run: python FORM-700.py  -> prints each field with its character count; exit 1 if any exceeds 700.

LIMIT = 700

S = {}
L = {}

# The two questions the form asks about tooling. Same answer for both entries — it is one person's process.
MCP_USED = "A — Yes, I connected it to my agent"
MCP_NOTES = (
"The Ideathon MCP (rules, rubric, arkiv-fundamentals, ideation-guide, network-and-roadmap) and "
"docs.arkiv.network, then @arkiv-network/sdk@0.7.0 read from source — where the real corrections came from. Hardest to work out: (1) .count() is the length of ONE page (<=200), not a total, so "
"any site-wide tally must sum pages; (2) string attributes are eq-only and $expiresAt is not a predicate key "
"in 0.7.0, forcing an integer expiresAtTs mirror for any 'expiring soon' query; (3) updateEntity is a full "
"replace — an omitted attribute is silently removed; (4) whether validAtBlock() serves expired entities at a "
"past block is undocumented, so I treated it as an upgrade path, not a guarantee.")

# ---------------------------------------------------------------- SELISIH
S["Idea name"] = "SELISIH"
S["One-line pitch"] = ("A multi-witness flight recorder for DeFi risk state: independent watchers each publish their own signed "
    "snapshot of the same lending market, and the product is the disagreement between them — queryable while it matters, "
    "kept only by whoever pays to keep it.")

S["The problem — and who it's for"] = (
"After a liquidation cascade or a bad oracle print, nobody can reconstruct what the system actually saw at that block. "
"The only record is the protocol's own log — written by the party under investigation, from a database it controls. "
"Risk/DAO governance deciding reimbursement, underwriters settling claims, liquidators and liquidated borrowers all need "
"the same thing: data the other side of the dispute will accept. A single-writer log is a claim, not evidence. "
"SELISIH makes risk state adversarial: N independent witnesses each write their own reading of the same market and round "
"under their own key, and the product is where they diverge — the outlier named by an immutable $creator.")

S["Scope — the first slice you'd build"] = (
"One market, three witnesses run by three different people, each writing a RiskSnapshot per round under its own key. "
"One screen: the divergence row for a round — one row per witness, spread highlighted, $creator + tx hash as the first "
"column — plus a '6 of 7 reporting' badge from two counts. If three parties can agree about what they disagreed about, "
"the idea is proven. Not in v1: arbitration and the bond contract. Kill test, already run, no deploy: Chainlink's own 31 "
"nodes, decoded from NewTransmission, spread 868 bps in one round while the feed published one number. Independent "
"observers do disagree, hardest under stress.")

S["The entities and typed attributes you'd write"] = (
"Integers only; every entity carries project:selisih; relations via shared keys. "
"RiskSnapshot (append-only; lifetime chosen by the witness, floor 72h): market, round, blockNumber, observedTs, priceE8, "
"healthFactorBps, totalDebtE6, collateralE6, atRiskCount, deviationBps, severityTier 0-4, fundedDays, expiresAtTs "
"(mirror), sourceHash; corrections are new entities. Commit (24h): market, round, digest — salted hash pre-reveal. "
"WitnessRegistration (7d heartbeat; lapsing = leaving). RosterEpoch (1y): who was expected. Dispute (window+30d): "
"roundFrom/To, deadlineTs, statusCode. EvidencePin (pinner-funded): verbatim copy + originTxHash. Resolution: "
"outcomeCode, vindicatedWitness.")

S["The queries you'd rely on"] = (
"All prefixed eq(project,selisih); strings eq-only; newest-first, no server ORDER BY. "
"1 Divergence board: eq(type,snapshot) eq(market,M) eq(round,R) — one row per witness; median/spread client-side. "
"2 Who is missing: count of (1) vs count of live registrations for M. "
"3 Track record, two numbers: createdBy(W) + gte(severityTier,3) [broke from peers] and eq(type,resolution) "
"eq(vindicatedWitness,W) [broke and was right] — one number alone punishes the best witness. "
"4 Conviction: gte(fundedDays,30). 5 Danger scan: lt(healthFactorBps,10500) gte(round,N). "
"6 Pin queue: snapshots with lt(expiresAtTs,deadlineTs) — evidence that lapses before its dispute resolves.")

S["How expiry / extension / verifiable ownership work as product features"] = (
"Only the owner may extend — and that is the best mechanic here. A disputant cannot preserve a witness's reading, so "
"retention is never done to evidence by an interested party. Cost = size x lifetime turns lifetime into a bet: a witness "
"funding 90 days is staking money on being right (fundedDays, checkable against cost in ArkivEntityCreated). The inverse "
"is sharper: a damning reading cannot be deleted, only left to lapse — a visible act that emits ArkivEntityExpired under "
"the witness's key. Anyone else keeps a reading by writing their own EvidencePin with the original tx hash. $creator is "
"the reputation primitive, never $owner: a track record cannot change hands.")

S["Why the idea genuinely needs Arkiv over a plain database"] = (
"Remove one and SELISIH is a worse Grafana. (1) The writers are adversarial to each other and to the reader — witnesses "
"compete, disputants have money at stake, the protocol under examination has every motive to shape the record; no "
"operator all of them would accept exists, and a conventional DB requires one. (2) The reader must verify without "
"permission — 'trust our API' is worth nothing in the one situation the product exists for. (3) Expiry must be a "
"guarantee, not a cron owned by an interested party: conviction priced in storage cannot exist where keeping a row "
"costs the writer nothing. Precisely: SELISIH relies on the Ethereum anchor, not on censorship-resistance.")

S["What deliberately stays off Arkiv"] = (
"Execution — no liquidations, matching or feed anyone trades against; nothing in DeFi blocks on this. Aggregation — the "
"median is computed client-side and never written; a stored canonical value would be built on, putting SELISIH on the hot "
"path it exists to stay off. Enforcement — bonds live in a contract; SELISIH supplies the evidence a slashing decision is "
"made from. Raw feed bundles and full position tables — capped summaries behind a sourceHash. Private data — none. "
"Real-time alerting — events are polled, not pushed. Honest limit: divergence detects disagreement, not a cartel — "
"attributable readings, not correct ones.")

S["Supporting links (optional)"] = (
"Write-up, diagrams, code: https://pugarhuda.github.io/arkiv-ideathon/submissions/selisih.html — Watch it run on that "
"round, unedited: https://pugarhuda.github.io/arkiv-ideathon/submissions/video/#divergence — 31 decoded node readings "
"become 31 attributable entities; the median is drawn, never written. Evidence: (1) kill test twice on mainnet archive "
"state — Chainlink vs Uniswap 423 bps apart at block 20,459,000; Chainlink's own 31 nodes spread 868 bps at 20,458,998 "
"while the feed said $2,233.80. (2) The TS schema type-checks with tsc --strict against @arkiv-network/sdk@0.7.0. "
"(3) Eight invariants execute the sketch against a cited spec — all pass. Nothing is deployed.")

S["Did you use the Ideathon MCP server while shaping this idea?"] = MCP_USED
S["Did you use the Arkiv MCP or docs?"] = MCP_NOTES

# ---------------------------------------------------------------- LAYAK
L["Idea name"] = "LAYAK"
L["One-line pitch"] = ("Statutory inspection certificates for lifting equipment written as Arkiv entities whose lifetime IS the "
    "certificate's validity period — so an expired certificate is not a row with a stale date on it; it is a row that no "
    "longer exists to be returned.")

L["The problem — and who it's for"] = (
"Under Permenaker 8/2020 every crane, hoist and forklift must pass riksa uji by a licensed inspector (PJK3) and carry a "
"fitness certificate. That certificate is a PDF whose date is trivially edited — by the owner who loses revenue when it "
"stops. The failure repeats: at the gate a supervisor has 90 seconds and a laminated card; in software valid_until is a "
"column one forgotten WHERE turns green; after an accident the history comes from the contractor's own system; at resale "
"a bad record is left behind. Users: supervisor, inspector, insurer, inspectorate. Since Dec 2025 Kemnaker's TemanK3 "
"verifies personnel credentials (SIO, SKP) — not equipment fitness; no register, no history, no API.")

L["Scope — the first slice you'd build"] = (
"One asset class, one certificate type, one screen, one phone. An inspector writes a Certificate and its ExamRecord in "
"one batch, expiresIn = the exam's validity. A supervisor scans the machine's QR; the gate check shows green with the "
"inspector's address and tx hash, or red with nothing. The proof: a certificate with a two-minute lifetime — green, "
"wait, refresh, red, with no code run, no job fired, no date compared. Not in v1: physical tagging and mapping inspector "
"addresses to people. Kill test, no deploy: show three PJK3 inspectors the 'inspector's whole book' query and ask "
"whether they'd rather their book was public or their competitor's. A shrug kills it.")

L["The entities and typed attributes you'd write"] = (
"Integers only; every entity carries project:layak; relations via shared keys. "
"Certificate (lifetime = validity, 1y/2y; never updated, never extended by rule): assetId, certType, siteId, "
"inspector, bodyId, examRecordId, issuedTs, expiresAtTs (mirror), outcomeCode. ExamRecord (5y, extended with the "
"machine): examTs, outcomeCode incl. fail, defectCount, testRatioBps (12500=1.25x), reportHash, regimeCode. One "
"exam writes both, opposite lifetimes; a failed exam writes the record and NO certificate — absence is the fail state. "
"Asset (2y; $owner moves on sale). Registration (licence). Prohibition (until lifted). DefectReport (30d), Escalation (1y). GateCheck (90d): every scan, resultCode 0-3.")

L["The queries you'd rely on"] = (
"All prefixed eq(project,layak); strings eq-only; newest-first; exact slugs. "
"1 Gate check: eq(type,cert) eq(assetId,A) eq(certType,T) returns >=1 AND eq(type,prohibition) eq(assetId,A) returns 0 — "
"an expired cert cannot be in the set; no date comparison to get wrong. "
"2 Site compliance: count(assets on site) vs count(live certs) — the gap is the risk number. "
"3 Renewal queue: gte(expiresAtTs,now) lt(expiresAtTs,now+7d). 4 Statutory pull: eq(type,exam) eq(assetId,A) — passes "
"and failures. 5 Inspector's book: eq(type,exam) eq(inspector,I). 6 Issuer licensed: eq(type,reg) eq(inspector,I). "
"7 Extension anomaly: gt(expiresAtTs, examTs+regimeSeconds) — 'never extended' as a checkable statement.")

L["How expiry / extension / verifiable ownership work as product features"] = (
"Expiry is the safety property: validity is the storage contract, not data someone must remember to filter — the "
"stale-row bug class is gone by construction. Extension is the liveness signal (assets, licences, records, prohibitions "
"all renew) and its absence is the integrity signal: certificates are never extended, because there it would be forgery. "
"Precisely: the inspector owns the certificate and could extend it; the guarantee is that it cannot happen in secret — "
"query 7 catches it. Ownership carries history through resale: changeOwnership moves the operator of record; every "
"record keeps its immutable $creator. deleteEntity is unused by design.")

L["Why the idea genuinely needs Arkiv over a plain database"] = (
"(1) The party holding the data is the party the data is about: the contractor runs the maintenance system and is who "
"the certificate constrains. (2) Expiry must be a guarantee, not a filter: on Postgres 'expired certs are not returned' "
"is a convention every query must honour forever; here it is the storage layer's behaviour and no query can opt out. "
"(3) The reader is a stranger — supervisor, insurer, inspector — with no account on the contractor's system. (4) The "
"history must outlive the relationship: companies fold, software is decommissioned, the statutory record is owed for the "
"life of the machine. LAYAK relies on the Ethereum anchor, not on censorship-resistance.")

L["What deliberately stays off Arkiv"] = (
"The reports themselves — riksa uji reports, load-test charts, thermography stay in object storage behind reportHash. "
"Personal data — inspectors are addresses, workers are a role; identity resolution stays inside the PJK3. Defect "
"diagnoses — encrypted payload with a public severityTier, so silence stays expensive without publishing repair quotes. "
"Enforcement — nothing here stops a crane; the gate and the stop-work order are the site's own systems reading Arkiv. "
"Anything needed in the next 50 ms — no interlocks, no PLC in the loop. Honest limits: LAYAK proves who signed and when, "
"not that the exam happened; and it is blind to machines never registered.")

L["Supporting links (optional)"] = (
"Write-up, diagrams, code: https://pugarhuda.github.io/arkiv-ideathon/submissions/layak.html — Watch the claim run, "
"unedited: https://pugarhuda.github.io/arkiv-ideathon/submissions/video/#expiry — a certificate goes green, then red, "
"while the query on screen never changes and no date is compared. Evidence: (1) the TS schema type-checks with tsc "
"--strict against @arkiv-network/sdk@0.7.0, which surfaced createdAtBlock, createdBy(), validAtBlock() and "
"ArkivEntityExpired. (2) Nine invariants execute the sketch against a cited spec — expired cert never returned, failed "
"exam writes record and no cert, an owner who extends is caught — all pass. Nothing is deployed.")

L["Did you use the Ideathon MCP server while shaping this idea?"] = MCP_USED
L["Did you use the Arkiv MCP or docs?"] = MCP_NOTES


if __name__ == "__main__":
    import sys
    bad = 0
    for name, d in (("SELISIH — track C · DeFi", S), ("LAYAK — track D · Other (open lane)", L)):
        print("\n" + "#" * 78 + "\n# " + name + "\n" + "#" * 78)
        for k, v in d.items():
            n = len(v); flag = "" if n <= LIMIT else f"   <<<<< OVER {LIMIT}"
            if n > LIMIT: bad += 1
            print(f"\n### {k}  [{n} chars]{flag}\n{v}")
    print("\n" + (f"ALL FIELDS <= {LIMIT}" if not bad else f"{bad} FIELDS OVER {LIMIT}"))
    sys.exit(1 if bad else 0)
