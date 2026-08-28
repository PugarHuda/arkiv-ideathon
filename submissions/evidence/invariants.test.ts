// Executable invariants for LAYAK and SELISIH — runs the real sketch code (type-checked against
// @arkiv-network/sdk@0.7.0) against MemArkiv, an executable spec of the documented semantics.
// Run: node --test dist/invariants.test.js   (after tsc). Nothing here touches a network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MemArkiv, NotOwnerError, InvalidExpirationError } from "./memarkiv.js";
import * as L from "../layak.sketch.js";
import * as S from "../selisih.sketch.js";
import type { Hex } from "viem";

const INSPECTOR = "0x1111111111111111111111111111111111111111" as Hex;
const CONTRACTOR = "0x2222222222222222222222222222222222222222" as Hex;
const BUYER      = "0x3333333333333333333333333333333333333333" as Hex;
const W = (n: number) => ("0x" + String(n).repeat(40)) as Hex;
const any = (x: unknown) => x as any;   // MemArkiv is structurally the surface the sketches use; the SDK's client type is a viem client

// ============================== LAYAK ==============================

test("LAYAK-1: an expired certificate is not returned — with no date filter anywhere", async () => {
  const db = new MemArkiv(INSPECTOR);
  await L.recordExamination(any(db), { assetId: "A-4471", siteId: "S1", certType: "SLO-angkat", bodyId: "PJK3-7", examRecordId: "E1", regimeCode: 2, outcomeCode: 0, defectCount: 0, testRatioBps: 12500, reportHash: "0xabc" });
  // First run of this test expected RED here and FAILED: the sketch returns AMBER — certified, but no Asset entity
  // claims responsibility. That is the designed behaviour (§9, orphaned certificate); the test expectation was wrong.
  assert.equal((await L.gateCheck(any(db), "A-4471", "SLO-angkat")).code, "AMBER_UNCLAIMED", "certified but unclaimed → amber, never green");
  db.createEntity({ payload: new Uint8Array(0), contentType: "application/json", expiresIn: 63_072_000, attributes: [{ key: "app", value: "layak" }, { key: "kind", value: "asset" }, { key: "assetId", value: "A-4471" }] });
  assert.equal((await L.gateCheck(any(db), "A-4471", "SLO-angkat")).code, "GREEN");
  db.advanceSeconds(31_536_000 + 2);                                     // one year + one block
  assert.equal((await L.gateCheck(any(db), "A-4471", "SLO-angkat")).code, "RED_NO_CERT", "lifetime lapsed → the row no longer exists to be returned");
  assert.ok(db.events.some(e => e.name === "ArkivEntityExpired"), "expiry is an on-chain event, not a silent row state");
});

test("LAYAK-2: a FAILED exam writes the statutory record and NO certificate, atomically", async () => {
  const db = new MemArkiv(INSPECTOR);
  const r = await L.recordExamination(any(db), { assetId: "A-9", siteId: "S1", certType: "SLO-angkat", bodyId: "B", examRecordId: "E9", regimeCode: 2, outcomeCode: 2, defectCount: 3, testRatioBps: 12500, reportHash: "0x" });
  assert.equal(r.createdEntities.length, 1);
  const exams = await db.select().where({ type: "eq", key: "kind", value: "exam" }).fetch();
  const certs = await db.select().where({ type: "eq", key: "kind", value: "cert" }).fetch();
  assert.equal(exams.entities.length, 1); assert.equal(certs.entities.length, 0);
  assert.equal((await L.gateCheck(any(db), "A-9", "SLO-angkat")).code, "RED_NO_CERT", "absence is the fail state — the same absence as expiry");
});

test("LAYAK-3: the record outlives the certificate; the two lifetimes are opposite", async () => {
  const db = new MemArkiv(INSPECTOR);
  await L.recordExamination(any(db), { assetId: "A-1", siteId: "S1", certType: "SLO-angkat", bodyId: "B", examRecordId: "E1", regimeCode: 2, outcomeCode: 0, defectCount: 0, testRatioBps: 12500, reportHash: "0x" });
  db.advanceSeconds(31_536_000 + 2);
  const certs = await db.select().where({ type: "eq", key: "kind", value: "cert" }).fetch();
  const exams = await db.select().where({ type: "eq", key: "kind", value: "exam" }).fetch();
  assert.equal(certs.entities.length, 0, "certificate gone");
  assert.equal(exams.entities.length, 1, "statutory record still served — LOLER/riksa uji retention duty");
});

test("LAYAK-4: only the owner can extend — and an owner extending a cert is CAUGHT by Q8", async () => {
  const db = new MemArkiv(INSPECTOR);
  await L.recordExamination(any(db), { assetId: "A-1", siteId: "S1", certType: "SLO-angkat", bodyId: "B", examRecordId: "E1", regimeCode: 2, outcomeCode: 0, defectCount: 0, testRatioBps: 12500, reportHash: "0x" });
  const cert = (await db.select().where({ type: "eq", key: "kind", value: "cert" }).fetch()).entities[0];
  await assert.rejects(async () => db.as(CONTRACTOR).extendEntity({ entityKey: cert.key, expiresIn: 63_072_000 }), NotOwnerError, "the contractor cannot extend a certificate it does not own");
  assert.deepEqual(await L.extensionAnomalies(any(db), "A-1"), [], "clean before");
  // the corrupt inspector CAN extend their own entity — the protocol allows it (R3) — but cannot do it in secret:
  db.extendEntity({ entityKey: cert.key, expiresIn: 63_072_000 });
  // the mirrored expiresAtTs must be rewritten for the extension to be useful on the renewal queue; a forger updating it exposes the lie
  db.updateEntity({ entityKey: cert.key, payload: cert.payload, contentType: cert.contentType, expiresIn: 63_072_000,
    attributes: cert.attributes.map(a => a.key === "expiresAtTs" ? { key: a.key, value: (a.value as number) + 31_536_000 } : a) });
  assert.deepEqual(await L.extensionAnomalies(any(db), "A-1"), ["E1"], "certificate living longer than its own examination justifies → flagged, by anyone, without permission");
});

test("LAYAK-5: a live certificate with a lapsed Asset is AMBER, not GREEN", async () => {
  const db = new MemArkiv(INSPECTOR);
  db.createEntity({ payload: new Uint8Array(0), contentType: "application/json", expiresIn: 60, attributes: [{ key: "app", value: "layak" }, { key: "kind", value: "asset" }, { key: "assetId", value: "A-1" }] });
  await L.recordExamination(any(db), { assetId: "A-1", siteId: "S1", certType: "SLO-angkat", bodyId: "B", examRecordId: "E1", regimeCode: 2, outcomeCode: 0, defectCount: 0, testRatioBps: 12500, reportHash: "0x" });
  assert.equal((await L.gateCheck(any(db), "A-1", "SLO-angkat")).code, "GREEN");
  db.advanceSeconds(62);
  assert.equal((await L.gateCheck(any(db), "A-1", "SLO-angkat")).code, "AMBER_UNCLAIMED", "certified, but nobody is renewing responsibility for the machine");
});

test("LAYAK-6: a Prohibition turns the gate red without touching the certificate (no triggers exist)", async () => {
  const db = new MemArkiv(INSPECTOR);
  db.createEntity({ payload: new Uint8Array(0), contentType: "application/json", expiresIn: 63_072_000, attributes: [{ key: "app", value: "layak" }, { key: "kind", value: "asset" }, { key: "assetId", value: "A-1" }] });
  await L.recordExamination(any(db), { assetId: "A-1", siteId: "S1", certType: "SLO-angkat", bodyId: "B", examRecordId: "E1", regimeCode: 2, outcomeCode: 0, defectCount: 0, testRatioBps: 12500, reportHash: "0x" });
  const pro = db.createEntity({ payload: new Uint8Array(0), contentType: "application/json", expiresIn: 86_400, attributes: [{ key: "app", value: "layak" }, { key: "kind", value: "prohibition" }, { key: "assetId", value: "A-1" }] });
  assert.equal((await L.gateCheck(any(db), "A-1", "SLO-angkat")).code, "RED_PROHIBITION");
  db.advanceSeconds(86_402);                                              // prohibition lapses (or the inspector lifts it) → green again, cert untouched
  assert.equal((await L.gateCheck(any(db), "A-1", "SLO-angkat")).code, "GREEN");
  assert.ok(pro.entityKey);
});

test("LAYAK-7: resale moves $owner and keeps $creator on every certificate", async () => {
  const db = new MemArkiv(INSPECTOR);
  const asset = db.as(CONTRACTOR).createEntity({ payload: new Uint8Array(0), contentType: "application/json", expiresIn: 63_072_000, attributes: [{ key: "app", value: "layak" }, { key: "kind", value: "asset" }, { key: "assetId", value: "A-1" }] });
  await L.recordExamination(any(db), { assetId: "A-1", siteId: "S1", certType: "SLO-angkat", bodyId: "B", examRecordId: "E1", regimeCode: 2, outcomeCode: 1, defectCount: 2, testRatioBps: 12500, reportHash: "0x" });
  await L.sell(any(db.as(CONTRACTOR)), asset.entityKey, BUYER);
  const a = (await db.select().where({ type: "eq", key: "kind", value: "asset" }).fetch()).entities[0];
  const e = (await db.select().where({ type: "eq", key: "kind", value: "exam" }).fetch()).entities[0];
  assert.equal(a.owner, BUYER); assert.equal(a.creator, CONTRACTOR); assert.equal(e.creator, INSPECTOR, "the past was never the seller's to leave behind");
});

test("LAYAK-8: .count() is one page — complianceGap sums pages, so 350 assets are 350, not 200", async () => {
  const db = new MemArkiv(CONTRACTOR);
  for (let i = 0; i < 350; i++) db.createEntity({ payload: new Uint8Array(0), contentType: "application/json", expiresIn: 63_072_000, attributes: [{ key: "app", value: "layak" }, { key: "kind", value: "asset" }, { key: "assetId", value: "A-" + i }, { key: "siteId", value: "S1" }] });
  const naive = await db.select().where({ type: "eq", key: "kind", value: "asset" }).limit(200).count();
  assert.equal(naive, 200, "the naive count the first draft relied on");
  const gap = await L.complianceGap(any(db), "S1", "SLO-angkat");
  assert.equal(gap.assets, 350); assert.equal(gap.gap, 350);
});

test("LAYAK-9: an odd expiresIn is rejected (2-second blocks)", () => {
  const db = new MemArkiv(INSPECTOR);
  assert.throws(() => db.createEntity({ payload: new Uint8Array(0), contentType: "application/json", expiresIn: 31_536_001, attributes: [] }), InvalidExpirationError);
});

// ============================== SELISIH ==============================

const snap = (round: number, hf: number, tier: 0|1|2|3|4 = 0) => ({ market: "aave-v3-eth-wsteth", round, blockNumber: 20_459_000, observedTs: 1_722_800_000, priceE8: 213_928_000_000, healthFactorBps: hf, totalDebtE6: 1, collateralE6: 1, atRiskCount: 0, deviationBps: 0, severityTier: tier, sourceHash: "0x", salt: "s" });

test("SELISIH-1: divergence board returns a SET per round, one row per witness, outlier attributable by creator", async () => {
  const db = new MemArkiv(W(1));
  for (const [w, hf] of [[1, 10420], [2, 10420], [3, 10420], [4, 9980], [5, 10420]] as const) {
    await S.reveal(any(db.as(W(w))), snap(812, hf, w === 4 ? 4 : 0), []);
    db.as(W(w)).createEntity({ payload: new Uint8Array(0), contentType: "application/json", expiresIn: 604_800, attributes: [{ key: "app", value: "selisih" }, { key: "kind", value: "witness" }, { key: "market", value: "aave-v3-eth-wsteth" }] });
  }
  db.as(W(7)).createEntity({ payload: new Uint8Array(0), contentType: "application/json", expiresIn: 604_800, attributes: [{ key: "app", value: "selisih" }, { key: "kind", value: "witness" }, { key: "market", value: "aave-v3-eth-wsteth" }] });
  const d = await S.divergence(any(db), "aave-v3-eth-wsteth", 812);
  assert.equal(d.rows.length, 5); assert.equal(d.median, 10420); assert.equal(d.missing, 1, "6 registered, 5 reported → w7 is the interesting row");
  const outlier = d.rows.find(r => r.attributes.some(a => a.key === "healthFactorBps" && a.value === 9980));
  assert.equal(outlier?.creator, W(4), "the outlier is named, not anonymised into an error bar");
});

test("SELISIH-2: a correction is a NEW entity; the board shows originals only via not(supersedesRound)", async () => {
  const db = new MemArkiv(W(1));
  await S.reveal(any(db), snap(812, 10420), []);
  await S.reveal(any(db), { ...snap(812, 10300), supersedesRound: 812 }, []);
  const d = await S.divergence(any(db), "aave-v3-eth-wsteth", 812);
  assert.equal(d.rows.length, 1); assert.equal(d.median, 10420, "the original is never silently edited; the correction sits beside it");
  const all = await db.select().where({ type: "eq", key: "kind", value: "snapshot" }).fetch();
  assert.equal(all.entities.length, 2);
});

test("SELISIH-3: only the owner may extend — a disputant CANNOT preserve a witness's reading; a pin can", async () => {
  const db = new MemArkiv(W(1));
  const { entityKey } = await S.reveal(any(db), snap(812, 9980, 4), [], 3);     // 72h floor
  await assert.rejects(async () => db.as(W(9)).extendEntity({ entityKey, expiresIn: 7_776_000 }), NotOwnerError);
  const original = (await db.select().where({ type: "eq", key: "kind", value: "snapshot" }).fetch()).entities[0];
  await S.pin(any(db.as(W(9))), { attributes: original.attributes, creator: original.creator, payload: original.payload }, entityKey, 31_536_000);
  db.advanceSeconds(259_200 + 2);                                                 // the original lapses
  const snaps = await db.select().where({ type: "eq", key: "kind", value: "snapshot" }).fetch();
  const pins  = await db.select().where({ type: "eq", key: "kind", value: "pin" }).fetch();
  assert.equal(snaps.entities.length, 0, "the witness's reading left the query surface");
  assert.equal(pins.entities.length, 1); assert.equal(pins.entities[0].creator, W(9), "the pin is the reader's own entity, funded by the reader, carrying the original tx hash");
  assert.equal(pins.entities[0].attributes.find(a => a.key === "originTxHash")?.value, entityKey);
});

test("SELISIH-4: conviction is a receipt — cost in ArkivEntityCreated scales with the funded lifetime", async () => {
  const db = new MemArkiv(W(1));
  await S.reveal(any(db), snap(812, 10420), [], 3);
  await S.reveal(any(db), snap(813, 10420), [], 90);
  const [c3, c90] = db.events.filter(e => e.name === "ArkivEntityCreated").map(e => (e as any).cost as bigint);
  assert.ok(c90 > c3 * 20n, `90-day funding costs ${c90} vs 3-day ${c3}: fundedDays is checkable against what was actually paid`);
});

test("SELISIH-5: pinQueue lists readings that will lapse BEFORE the dispute deadline", async () => {
  const db = new MemArkiv(W(1));
  await S.reveal(any(db), snap(812, 10420), [], 3);        // lapses in 72h
  await S.reveal(any(db), snap(813, 10420), [], 30);       // funded past the deadline
  const deadline = db.nowUnix() + 7 * 86_400;
  const q = await S.pinQueue(any(db), "aave-v3-eth-wsteth", 800, 900, deadline);
  assert.equal(q.length, 1); assert.equal(q[0].attributes.find(a => a.key === "round")?.value, 812);
});

test("SELISIH-6: silence is an event — a witness that stops renewing emits ArkivEntityExpired under its own key", async () => {
  const db = new MemArkiv(W(4));
  const reg = db.createEntity({ payload: new Uint8Array(0), contentType: "application/json", expiresIn: 604_800, attributes: [{ key: "app", value: "selisih" }, { key: "kind", value: "witness" }, { key: "market", value: "m" }] });
  await S.heartbeat(any(db), reg.entityKey); db.advanceSeconds(604_800 - 100);
  assert.equal(db.events.filter(e => e.name === "ArkivEntityExpired").length, 0, "renewed → still live");
  db.advanceSeconds(200);
  const ev = db.events.find(e => e.name === "ArkivEntityExpired") as any;
  assert.equal(ev?.owner, W(4), "leaving is a log entry with your key on it");
});

test("SELISIH-7: track record uses createdBy natively — no mirrored witness attribute exists in the schema", async () => {
  const db = new MemArkiv(W(4));
  await S.reveal(any(db), snap(1, 9000, 4), []); await S.reveal(any(db), snap(2, 9000, 3), []); await S.reveal(any(db), snap(3, 10420, 0), []);
  db.as(W(8)).createEntity({ payload: new Uint8Array(0), contentType: "application/json", expiresIn: 86_400, attributes: [{ key: "app", value: "selisih" }, { key: "kind", value: "resolution" }, { key: "vindicatedWitness", value: W(4) }] });
  const tr = await S.trackRecord(any(db), W(4));
  assert.deepEqual(tr, { broke: 2, vindicated: 1 });
  const s = (await db.select().where({ type: "eq", key: "kind", value: "snapshot" }).fetch()).entities[0];
  assert.ok(!s.attributes.some(a => a.key === "witness"), "$creator is metadata, not an attribute to mirror");
});

test("SELISIH-8: RosterEpoch answers 'who was expected' after registrations have expired", async () => {
  const db = new MemArkiv(W(1));
  for (const w of [1, 2, 3]) db.as(W(w)).createEntity({ payload: new Uint8Array(0), contentType: "application/json", expiresIn: 604_800, attributes: [{ key: "app", value: "selisih" }, { key: "kind", value: "witness" }, { key: "market", value: "m" }] });
  await S.rosterEpoch(any(db), "m", 1, 800, 900, [W(1), W(2), W(3)]);
  const atRound = db.block;
  db.advanceSeconds(30 * 86_400);                                                 // a month into a dispute: registrations long gone
  const live = await db.select().where({ type: "eq", key: "kind", value: "witness" }).count();
  assert.equal(live, 0, "querying live registrations now answers WRONG with total confidence");
  const epoch = (await db.select().where({ type: "eq", key: "kind", value: "roster" }, { type: "lte", key: "roundFrom", value: 812 }, { type: "gte", key: "roundTo", value: 812 }).fetch()).entities[0];
  assert.equal(epoch.attributes.find(a => a.key === "witnessCount")?.value, 3, "the fact was stored while it was true");
  // and the upgrade path: validAtBlock() — if the network serves history, this replaces RosterEpoch
  assert.equal((await S.rosterAtBlock(any(db), "m", atRound)).length, 3);
});
