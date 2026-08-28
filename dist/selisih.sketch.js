// SELISIH — entity-model sketch, type-checked against the REAL @arkiv-network/sdk@0.7.0 package.
// Offline design only: no client is ever connected here, and nothing is deployed.
// `tsc --strict` passes against the published types (output reproduced in the write-up).
import { eq, gte, lte, lt, not } from "@arkiv-network/sdk/query";
// ---------- constants ----------
const APP = "selisih"; // project namespace — on EVERY entity, first in EVERY predicate
const CT = "application/json"; // contentType is required by CreateEntityParameters
const SNAPSHOT_FLOOR_SEC = 259_200; // 72h floor; the witness may fund longer — that is the bet
const COMMIT_SEC = 86_400; // 24h
const REGISTRATION_SEC = 604_800; // 7d heartbeat; lapsing IS deregistration (emits ArkivEntityExpired)
const ROSTER_EPOCH_SEC = 31_536_000; // 1y
const PIN_DEFAULT_SEC = 31_536_000; // 1y, pinner chooses and pays
const PAGE = 200; // SDK hard cap per page
// expiresIn must be a positive multiple of 2 (2-second blocks) or the SDK throws InvalidExpirationError
const even = (s) => (s % 2 === 0 ? s : s + 1);
// attributes are an ARRAY of { key, value }; value is string | number (numbers must be integers)
const attrs = (o) => Object.entries(o).map(([key, value]) => ({ key, value }));
const attr = (e, key) => e.attributes.find(a => a.key === key)?.value;
const enc = (v) => new TextEncoder().encode(JSON.stringify(v));
const now = () => Math.floor(Date.now() / 1000);
// `.count()` in 0.7.0 is the length of ONE page (≤200). For anything that can exceed a page, sum pages.
async function countAll(p, preds) {
    const res = await p.select({ key: true }).where(preds).limit(PAGE).fetch();
    let total = res.entities.length;
    while (res.hasNextPage()) {
        await res.next();
        total += res.entities.length;
    } // next() mutates in place
    return total;
}
// ---------- 1. commit → reveal (closes the copy-the-leader hole) ----------
export async function commit(w, market, round, digest) {
    return w.createEntity({
        payload: new Uint8Array(0), contentType: CT, expiresIn: COMMIT_SEC,
        attributes: attrs({ project: APP, type: "commit", market, round, digest, committedTs: now() }),
    });
}
export async function reveal(w, s, topK, fundedDays = 3) {
    const expiresIn = even(Math.max(SNAPSHOT_FLOOR_SEC, fundedDays * 86_400));
    const { supersedesRound, ...rest } = s;
    // No `witness` attribute: the SDK exposes `.createdBy()` and `entity.creator` natively, so mirroring
    // $creator into an attribute is redundant. The earlier draft did that and was wrong.
    // The cost actually paid for `expiresIn` is emitted on-chain in ArkivEntityCreated(..., cost) —
    // so `fundedDays` is checkable against the event, not merely self-reported.
    return w.createEntity({
        payload: enc(topK), contentType: CT, expiresIn,
        attributes: attrs({ project: APP, type: "snapshot", ...rest, fundedDays, expiresAtTs: now() + expiresIn,
            ...(supersedesRound !== undefined ? { supersedesRound } : {}) }),
    });
}
// ---------- 2. the divergence board — Q1 + Q2 ----------
export async function divergence(p, market, round) {
    const res = await p.select({ key: true, creator: true, attributes: true, expiresAtBlock: true, createdAtBlock: true })
        .where(eq("project", APP), eq("type", "snapshot"), eq("market", market), eq("round", round), not("supersedesRound")) // `not(key)` = attribute ABSENT → originals only
        .limit(PAGE).fetch();
    const rows = res.entities; // bounded by roster size → one page holds it
    const hf = rows.map(r => Number(attr(r, "healthFactorBps"))).sort((a, b) => a - b);
    const median = hf[Math.floor(hf.length / 2)]; // computed client-side and NEVER written
    const registered = await p.select({ key: true })
        .where(eq("project", APP), eq("type", "witness"), eq("market", market)).limit(PAGE).count();
    return { rows, median, missing: registered - rows.length };
}
// ---------- 3. reputation as two numbers — Q3 (native createdBy, not a mirrored attribute) ----------
export async function trackRecord(p, witness) {
    const broke = await countAllBy(p, witness, [eq("project", APP), eq("type", "snapshot"), gte("severityTier", 3)]);
    const vindicated = await countAll(p, [eq("project", APP), eq("type", "resolution"), eq("vindicatedWitness", witness)]);
    return { broke, vindicated }; // one number alone punishes the best witness
}
async function countAllBy(p, creator, preds) {
    const res = await p.select({ key: true }).createdBy(creator).where(preds).limit(PAGE).fetch();
    let total = res.entities.length;
    while (res.hasNextPage()) {
        await res.next();
        total += res.entities.length;
    }
    return total;
}
// ---------- 4. pin queue — Q5: readings that lapse before their dispute resolves ----------
export async function pinQueue(p, market, roundFrom, roundTo, deadlineTs) {
    const res = await p.select({ key: true, creator: true, attributes: true, payload: true })
        .where(eq("project", APP), eq("type", "snapshot"), eq("market", market), gte("round", roundFrom), lte("round", roundTo), lt("expiresAtTs", deadlineTs))
        .limit(PAGE).fetch();
    return res.entities;
}
// Only the OWNER may extend, so a reader preserves evidence by writing their OWN entity.
export async function pin(w, original, originTxHash, expiresIn = PIN_DEFAULT_SEC) {
    return w.createEntity({
        payload: original.payload, contentType: CT, expiresIn: even(expiresIn),
        attributes: attrs({ project: APP, type: "pin", market: String(attr(original, "market")),
            round: Number(attr(original, "round")), pinnedWitness: original.creator,
            originTxHash, pinnedTs: now(), expiresAtTs: now() + expiresIn }),
    });
}
// ---------- 5. heartbeat — a witness stands behind its own registration ----------
export async function heartbeat(w, registrationKey) {
    return w.extendEntity({ entityKey: registrationKey, expiresIn: REGISTRATION_SEC });
}
// ---------- 6. daily roster epoch — ONE atomic tx ----------
export async function rosterEpoch(w, market, epoch, roundFrom, roundTo, witnesses) {
    return w.mutateEntities({
        creates: [{
                payload: enc(witnesses), contentType: CT, expiresIn: ROSTER_EPOCH_SEC,
                attributes: attrs({ project: APP, type: "roster", market, epoch, roundFrom, roundTo, witnessCount: witnesses.length }),
            }],
    });
}
// ---------- 7. "who was on the roster at round 812?" — the upgrade path ----------
// The builder exposes validAtBlock(). IF the network serves historical state there, this replaces
// RosterEpoch entirely. Whether expired entities are returned at a past block is not documented,
// so the design keeps RosterEpoch and treats this as the upgrade path — not as a promise.
export async function rosterAtBlock(p, market, block) {
    const res = await p.select({ key: true, creator: true })
        .where(eq("project", APP), eq("type", "witness"), eq("market", market))
        .validAtBlock(block).limit(PAGE).fetch();
    return res.entities.map(e => e.creator);
}
