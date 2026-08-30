// LAYAK gate check — a live demo of the one claim the whole design rests on:
// an expired certificate is not a row with a stale date. It is a row that no longer exists to be returned.
//
// What is real here:
//   * gateCheck() is imported UNMODIFIED from ../../layak.sketch.ts — the same function the 17 invariants run,
//     type-checked by `tsc --strict` against the published @arkiv-network/sdk@0.7.0.
//   * MemArkiv is the executable spec in ../../evidence/memarkiv.ts, every rule cited to the SDK source.
//   * Blocks advance at BLOCK_TIME (2s) against the wall clock — the rate a chain actually produces them.
//     Nothing in this page speeds up, skips or fakes time.
// What is shortened: the certificate's lifetime. A real SLO runs 1–2 years; here you choose it (?ttl=, default
// 120s) so it can be watched lapsing. ponytail: the write is inlined rather than routed through
// recordExamination() only because REGIME_SECONDS has no demo-length regime — the attribute shape is identical,
// and the READ path, which is what is being proved, is the untouched sketch.

import { MemArkiv, BLOCK_TIME } from "../../evidence/memarkiv.js";
import { gateCheck } from "../../layak.sketch.js";
import type { Hex } from "viem";

const any = (x: unknown) => x as any;           // MemArkiv is structurally the surface the sketch uses
const $ = (id: string) => document.getElementById(id)!;
const INSPECTOR = "0x1111111111111111111111111111111111111111" as Hex;
const CONTRACTOR = "0x2222222222222222222222222222222222222222" as Hex;
const ASSET = "A-4471", CERT_TYPE = "SLO-angkat", SITE = "S-JKT-03";

const ttl = (() => {
  const raw = Number(new URLSearchParams(location.search).get("ttl") ?? 120);
  const n = Number.isFinite(raw) && raw >= 4 ? Math.floor(raw) : 120;
  return n % 2 === 0 ? n : n + 1;               // R1: expiresIn must be an even number of seconds
})();

const db = new MemArkiv(INSPECTOR);
const startedAt = Date.now();
// the recorder draws its captions off THIS clock — the one the certificate's lifetime is measured against —
// so the narration cannot drift away from what is actually on screen (see record.mjs)
(window as unknown as { __layakStart: number }).__layakStart = startedAt;

// ---- the write: one atomic tx, the exam record and the certificate, opposite lifetimes ----
const examTs = Math.floor(Date.now() / 1000);
const tx = db.mutateEntities({
  creates: [
    { payload: new Uint8Array(0), contentType: "application/json", expiresIn: 157_680_000,
      attributes: [{ key: "project", value: "layak" }, { key: "type", value: "exam" }, { key: "assetId", value: ASSET },
                   { key: "examRecordId", value: "E-2026-0871" }, { key: "bodyId", value: "PJK3-7" }, { key: "examTs", value: examTs },
                   { key: "outcomeCode", value: 0 }, { key: "defectCount", value: 0 }, { key: "testRatioBps", value: 12500 },
                   { key: "regimeCode", value: 2 }, { key: "reportHash", value: "0x9f2c" }] },
    { payload: new Uint8Array(0), contentType: "application/json", expiresIn: ttl,
      attributes: [{ key: "project", value: "layak" }, { key: "type", value: "cert" }, { key: "assetId", value: ASSET },
                   { key: "certType", value: CERT_TYPE }, { key: "siteId", value: SITE }, { key: "bodyId", value: "PJK3-7" },
                   { key: "examRecordId", value: "E-2026-0871" }, { key: "issuedTs", value: examTs },
                   { key: "expiresAtTs", value: examTs + ttl }, { key: "outcomeCode", value: 0 }] },
  ],
});
// the machine itself — owned by the contractor, not the inspector; without it the gate is AMBER, never GREEN
db.as(CONTRACTOR).createEntity({
  payload: new Uint8Array(0), contentType: "application/json", expiresIn: 63_072_000,
  attributes: [{ key: "project", value: "layak" }, { key: "type", value: "asset" }, { key: "assetId", value: ASSET },
               { key: "siteId", value: SITE }, { key: "certType", value: CERT_TYPE }],
});
const certKey = tx.createdEntities[1];
const certRow = db.rows.get(certKey)!;
const expiresAtBlock = certRow.expiresAtBlock;

const short = (h: string) => h.slice(0, 10) + "…" + h.slice(-6);
const seen = new Set<string>();

function log(kind: string, text: string) {
  const el = document.createElement("div");
  el.className = "ev " + kind;
  el.innerHTML = `<span class="t">block ${db.block}</span> ${text}`;
  $("events").prepend(el);
}

// ---- the only code that runs after the write: a read, every 500ms ----
async function paint() {
  const r = await gateCheck(any(db), ASSET, CERT_TYPE);
  const green = r.code === "GREEN";
  const card = $("card");
  card.className = "card " + (green ? "green" : "red");
  $("verdict").textContent = green ? "LAYAK" : "TIDAK LAYAK";
  $("code").textContent = r.code;
  $("verdictSub").textContent = green
    ? "Certificate live. Cleared to operate."
    : "No certificate in the register. Do not operate.";
  $("certBody").innerHTML = green
    ? `<div class="kv"><span>issued by</span><b>${short(r.cert!.creator)}</b></div>
       <div class="kv"><span>written at</span><b>block ${r.cert!.createdAtBlock}</b></div>
       <div class="kv"><span>lapses at</span><b>block ${expiresAtBlock}</b></div>
       <div class="kv"><span>entity</span><b>${short(r.cert!.key)}</b></div>`
    : `<div class="gone">the query returned an empty set</div>
       <div class="gonesub">nothing was deleted, no flag was flipped, no date was compared</div>`;

  const left = Number(expiresAtBlock - db.block);
  $("left").textContent = left > 0 ? String(left) : "0";
  $("leftSec").textContent = left > 0 ? `${left * BLOCK_TIME}s of certificate lifetime remain` : "lifetime spent";
  $("block").textContent = String(db.block);
  $("rows").textContent = String([...db.rows.values()].filter(x => x.expiresAtBlock > db.block).length);

  $("pulse").animate([{ opacity: 1 }, { opacity: 0.25 }], { duration: 400 });
  for (const e of db.events) {
    const id = e.name + (e as any).entityKey;
    if (seen.has(id)) continue;
    seen.add(id);
    if (e.name === "ArkivEntityCreated") log("ok", `<b>ArkivEntityCreated</b> ${short(e.entityKey)} · expires ${e.expirationBlock} · cost ${e.cost}`);
    if (e.name === "ArkivEntityExpired") log("bad", `<b>ArkivEntityExpired</b> ${short(e.entityKey)} — emitted by the chain, under the issuer's key`);
  }
}

// ---- the chain: one block every BLOCK_TIME seconds, driven by the wall clock, never faster ----
setInterval(() => {
  const due = Math.floor((Date.now() - startedAt) / 1000 / BLOCK_TIME);
  const behind = due - Number(db.block - 1000n);
  if (behind > 0) db.advanceSeconds(behind * BLOCK_TIME);
}, 250);

setInterval(paint, 500);
$("ttl").textContent = `${ttl}s`;
log("ok", `certificate written with expiresIn ${ttl}s — the lifetime IS the validity period`);
void paint();
