// LAYAK — entity-model sketch, type-checked against the REAL @arkiv-network/sdk@0.7.0 package.
// Offline design only: no client is ever connected here, and nothing is deployed.
// `tsc --strict` passes against the published types (output reproduced in the write-up).
import { eq, gt, gte, lt } from "@arkiv-network/sdk/query";
// ---------- constants ----------
const APP = "layak"; // project namespace — on EVERY entity, first in EVERY predicate
const CT = "application/json";
const ONE_YEAR = 31_536_000;
const TWO_YEARS = 63_072_000;
const GATE_CHECK_SEC = 7_776_000; // 90d
const EXAM_RECORD_SEC = 157_680_000; // 5y, re-extended with the asset for the life of the equipment
const PAGE = 200; // SDK hard cap per page
// Permenaker 8/2020 cadence: first periodic exam ≤2y after commissioning, then every 1y.
const REGIME_SECONDS = { 1: TWO_YEARS, 2: ONE_YEAR };
const even = (s) => (s % 2 === 0 ? s : s + 1); // InvalidExpirationError otherwise
const attrs = (o) => Object.entries(o).map(([key, value]) => ({ key, value }));
const attr = (e, key) => e.attributes.find(a => a.key === key)?.value;
const now = () => Math.floor(Date.now() / 1000);
// `.count()` in 0.7.0 is the length of ONE page (≤200). Site-level tallies can exceed that → sum pages.
async function countAll(p, preds) {
    const res = await p.select({ key: true }).where(preds).limit(PAGE).fetch();
    let total = res.entities.length;
    while (res.hasNextPage()) {
        await res.next();
        total += res.entities.length;
    } // next() mutates in place
    return total;
}
// ---------- 1. one riksa uji writes TWO entities with OPPOSITE lifetimes, in ONE atomic tx ----------
export async function recordExamination(w, x) {
    const examTs = now();
    const validity = REGIME_SECONDS[x.regimeCode];
    const creates = [
        // the statutory record — passes AND failures — must outlive the certificate
        { payload: new Uint8Array(0), contentType: CT, expiresIn: EXAM_RECORD_SEC,
            attributes: attrs({ project: APP, type: "exam", assetId: x.assetId, examRecordId: x.examRecordId, bodyId: x.bodyId,
                examTs, outcomeCode: x.outcomeCode, defectCount: x.defectCount,
                testRatioBps: x.testRatioBps, regimeCode: x.regimeCode, reportHash: x.reportHash }) },
    ];
    if (x.outcomeCode !== 2) {
        // the operative certificate — its LIFETIME IS the validity. Never updated. Never extended by product rule.
        creates.push({ payload: new Uint8Array(0), contentType: CT, expiresIn: even(validity),
            attributes: attrs({ project: APP, type: "cert", assetId: x.assetId, certType: x.certType, siteId: x.siteId,
                bodyId: x.bodyId, examRecordId: x.examRecordId, issuedTs: examTs,
                expiresAtTs: examTs + validity, outcomeCode: x.outcomeCode }) });
    }
    // a FAILED examination writes the record and NO certificate: absence is the fail state, same as expiry
    return w.mutateEntities({ creates });
}
// ---------- 2. the gate check — two trivial predicates, both must hold ----------
export async function gateCheck(p, assetId, certType) {
    const certs = await p.select({ key: true, creator: true, attributes: true, createdAtBlock: true })
        .where(eq("project", APP), eq("type", "cert"), eq("assetId", assetId), eq("certType", certType))
        .limit(5).fetch(); // an expired cert CANNOT be in this set
    const prohibitions = await p.select({ key: true })
        .where(eq("project", APP), eq("type", "prohibition"), eq("assetId", assetId))
        .limit(5).count(); // a lifted prohibition CANNOT be in this count
    const assetLive = await p.select({ key: true })
        .where(eq("project", APP), eq("type", "asset"), eq("assetId", assetId))
        .limit(1).count();
    if (certs.entities.length === 0)
        return { code: "RED_NO_CERT" };
    if (prohibitions > 0)
        return { code: "RED_PROHIBITION" };
    if (assetLive === 0)
        return { code: "AMBER_UNCLAIMED", cert: certs.entities[0] };
    return { code: "GREEN", cert: certs.entities[0] }; // card shows creator + createdAtBlock
}
// every scan is itself an entity: diligence becomes provable, not assertable
export async function logGateCheck(w, assetId, siteId, resultCode, cacheAgeSec = 0) {
    return w.createEntity({
        payload: new Uint8Array(0), contentType: CT, expiresIn: GATE_CHECK_SEC,
        attributes: attrs({ project: APP, type: "gate", assetId, siteId, checkedTs: now(), resultCode, cacheAgeSec }),
    });
}
// ---------- 3. site compliance — the gap between two HONEST counts ----------
export async function complianceGap(p, siteId, certType) {
    const assets = await countAll(p, [eq("project", APP), eq("type", "asset"), eq("siteId", siteId)]);
    const certs = await countAll(p, [eq("project", APP), eq("type", "cert"), eq("siteId", siteId), eq("certType", certType)]);
    return { assets, certs, gap: assets - certs }; // the gap is the risk number
}
// ---------- 4. renewal queue — Q3: why expiresAtTs is mirrored as an integer ----------
// Entity.expiresAtBlock is returned as METADATA but is not a predicate key; the attribute mirror is.
export async function expiringWithin(p, siteId, seconds) {
    const t = now();
    const res = await p.select({ key: true, attributes: true })
        .where(eq("project", APP), eq("type", "cert"), eq("siteId", siteId), gte("expiresAtTs", t), lt("expiresAtTs", t + seconds))
        .limit(PAGE).fetch();
    return res.entities;
}
// ---------- 5. extension anomaly — Q8: "never extended" as a CHECKABLE statement ----------
export async function extensionAnomalies(p, assetId) {
    const exams = await p.select({ key: true, attributes: true })
        .where(eq("project", APP), eq("type", "exam"), eq("assetId", assetId)).limit(50).fetch();
    const out = [];
    for (const e of exams.entities) {
        const bound = Number(attr(e, "examTs")) + REGIME_SECONDS[Number(attr(e, "regimeCode"))];
        const over = await p.select({ key: true })
            .where(eq("project", APP), eq("type", "cert"), eq("examRecordId", String(attr(e, "examRecordId"))), gt("expiresAtTs", bound))
            .limit(1).count();
        if (over > 0)
            out.push(String(attr(e, "examRecordId")));
    }
    return out; // certificates living longer than their exam justifies
}
// ---------- 6. backdating check — claimed issuedTs vs the block it was ACTUALLY written in ----------
// createdAtBlock is metadata on every entity (select createdAtBlock:true) — no receipt lookup needed.
// It is not a predicate key, so this is a per-entity verification rather than a register-wide sweep.
export function looksBackdated(cert, blockToUnix, toleranceSec = 86_400) {
    return Number(attr(cert, "issuedTs")) < blockToUnix(cert.createdAtBlock) - toleranceSec;
}
// ---------- 7. escalation is a NEW entity — the reporter may be gone, and only the owner can extend ----------
export async function escalate(w, defectId, assetId, severityTier) {
    return w.createEntity({
        payload: new Uint8Array(0), contentType: CT, expiresIn: ONE_YEAR,
        attributes: attrs({ project: APP, type: "escalation", defectId, assetId, severityTier, escalatedTs: now() }),
    });
}
// ---------- 8. resale: the machine changes hands, the history does not ----------
export async function sell(w, assetKey, buyer) {
    return w.changeOwnership({ entityKey: assetKey, newOwner: buyer }); // $owner moves; every cert keeps its creator
}
// ---------- 9. keep the statutory record alive with the asset — ONE atomic tx ----------
export async function renewAsset(w, assetKey, examRecordKeys) {
    return w.mutateEntities({
        extensions: [{ entityKey: assetKey, expiresIn: TWO_YEARS },
            ...examRecordKeys.map(entityKey => ({ entityKey, expiresIn: EXAM_RECORD_SEC }))],
    }); // ≤1000 ops per tx; chunk beyond that
}
// ---------- 10. what the register said at block N — the after-accident question ----------
// validAtBlock() exists on the builder. Whether expired entities are served at a past block is not
// documented; treated as the upgrade path for investigations, not as a current guarantee.
export async function registerAtBlock(p, assetId, block) {
    return (await p.select({ key: true, creator: true, attributes: true })
        .where(eq("project", APP), eq("type", "cert"), eq("assetId", assetId))
        .validAtBlock(block).limit(PAGE).fetch()).entities;
}
