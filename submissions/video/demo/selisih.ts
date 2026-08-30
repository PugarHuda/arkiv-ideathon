// SELISIH divergence board — the claim the design rests on, running on real decoded mainnet data:
// independent observers of the same market disagree, the disagreement is the product, and the outlier
// is named by an immutable $creator rather than averaged into an error bar.
//
// What is real here:
//   * The 31 observations are read from ../../evidence/chainlink_round_20458998.json — the file in this
//     repo, decoded from the NewTransmission log of Chainlink's ETH/USD aggregator at block 20,458,998
//     (mined 2024-08-05T01:12:11Z, during the 5 Aug 2024 liquidation cascade). The feed published one
//     number, 2233.80343462; the other 30 readings were discarded.
//   * divergence(), reveal() and pin() are imported UNMODIFIED from ../../selisih.sketch.ts — the same
//     functions the invariants run — against MemArkiv, the executable spec in ../../evidence/memarkiv.ts.
//   * Blocks advance at BLOCK_TIME (2s) against the wall clock. Nothing here speeds up or skips time.
// What is derived, and stated on the page: a NewTransmission log carries prices, not lending-market
// state, so each witness's healthFactorBps is ITS OWN observed price applied to one stated reference
// position (100 WETH collateral, 150,000 USDC debt, 82.5% liquidation threshold). deviationBps is
// measured against the published median. Nothing else is invented.
// ponytail: the outlier's snapshot is written inline rather than through reveal(), only because reveal()
// enforces the 72h SNAPSHOT_FLOOR_SEC and this one has to be watchable — the attribute shape is identical
// and the other 30 go through the real writer. The READ path is untouched throughout.

import { MemArkiv, BLOCK_TIME, NotOwnerError } from "../../evidence/memarkiv.js";
import { divergence, reveal, pin } from "../../selisih.sketch.js";
import type { Hex } from "viem";

const any = (x: unknown) => x as any;
const $ = (id: string) => document.getElementById(id)!;
const MARKET = "aave-v3-weth";
const ROUND = 20_458_998;                       // keyed by the block its NewTransmission landed in
const OBSERVED_TS = 1_722_820_331;              // that block's timestamp, from eth_getBlockByNumber
const DISPUTANT = "0xdd00000000000000000000000000000000000000" as Hex;   // a borrower disputing the round

// the stated reference position every witness's price is applied to
const COLLATERAL_WETH = 100, DEBT_USDC = 150_000, LIQ_THRESHOLD = 0.825;
const hfBps = (price: number) => Math.round((COLLATERAL_WETH * price * LIQ_THRESHOLD / DEBT_USDC) * 10_000);
const tierOf = (dev: number) => (Math.abs(dev) >= 400 ? 4 : Math.abs(dev) >= 300 ? 3 : Math.abs(dev) >= 200 ? 2 : Math.abs(dev) >= 100 ? 1 : 0) as 0 | 1 | 2 | 3 | 4;
const addrOf = (observer: number) => ("0x" + (observer + 1).toString(16).padStart(2, "0").repeat(20)) as Hex;
const short = (h: string) => h.slice(0, 8) + "…" + h.slice(-4);
const usd = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ttl = (() => {
  const raw = Number(new URLSearchParams(location.search).get("ttl") ?? 120);
  const n = Number.isFinite(raw) && raw >= 4 ? Math.floor(raw) : 120;
  return n % 2 === 0 ? n : n + 1;
})();

const db = new MemArkiv(addrOf(0));
const startedAt = Date.now();
(window as unknown as { __selisihStart: number }).__selisihStart = startedAt;

const seen = new Set<string>();
function log(kind: string, text: string) {
  const el = document.createElement("div");
  el.className = "ev " + kind;
  el.innerHTML = `<span class="t">block ${db.block}</span> ${text}`;
  $("events").prepend(el);
}

type Row = { observer: number; price: number; dev: number; hf: number; addr: Hex };
let rows: Row[] = [];
let outlier: Row;
let outlierKey: Hex;
let publishedMedian = 0;

async function boot() {
  const round = await (await fetch("../../evidence/chainlink_round_20458998.json")).json() as
    { block: number; tx: string; median: number; observations: number[]; observers: number[] };
  publishedMedian = round.median;

  rows = round.observations.map((price, i) => {
    const dev = Math.round(((price - round.median) / round.median) * 10_000);
    return { observer: round.observers[i], price, dev, hf: hfBps(price), addr: addrOf(round.observers[i]) };
  });
  outlier = rows.reduce((a, b) => (Math.abs(b.dev) > Math.abs(a.dev) ? b : a));

  $("feedPrice").textContent = usd(round.median);
  $("feedSub").textContent = `one number published · ${rows.length - 1} observations discarded · block ${round.block.toLocaleString("en-US")}`;
  $("txline").innerHTML = `NewTransmission <b>${short(round.tx)}</b> · mined 2024-08-05T01:12:11Z`;

  // every witness registers, and every witness writes its OWN reading under its OWN key
  for (const r of rows) {
    const w = db.as(r.addr);
    w.createEntity({ payload: new Uint8Array(0), contentType: "application/json", expiresIn: 604_800,
      attributes: [{ key: "project", value: "selisih" }, { key: "type", value: "witness" }, { key: "market", value: MARKET }] });

    const snap = { market: MARKET, round: ROUND, blockNumber: round.block, observedTs: OBSERVED_TS,
      priceE8: Math.round(r.price * 1e8), healthFactorBps: r.hf, totalDebtE6: DEBT_USDC * 1_000_000,
      collateralE6: COLLATERAL_WETH * 1_000_000, atRiskCount: r.hf < 10_000 ? 1 : 0,
      deviationBps: r.dev, severityTier: tierOf(r.dev), sourceHash: round.tx, salt: `s-${r.observer}` };

    if (r === outlier) {
      // identical attribute shape to reveal(), lifetime shortened so the lapse is watchable
      const { salt, ...rest } = snap;
      const res = w.createEntity({ payload: new Uint8Array(0), contentType: "application/json", expiresIn: ttl,
        attributes: Object.entries({ project: "selisih", type: "snapshot", ...rest, fundedDays: 3,
          expiresAtTs: Math.floor(Date.now() / 1000) + ttl }).map(([key, value]) => ({ key, value })) });
      outlierKey = res.entityKey;
    } else {
      await reveal(any(w), snap, []);
    }
  }

  // a disputant wants the outlier's reading preserved. It cannot touch it — only the owner may extend.
  try {
    db.as(DISPUTANT).extendEntity({ entityKey: outlierKey, expiresIn: 7_776_000 });
    log("bad", "extend SUCCEEDED — the spec is wrong");
  } catch (e) {
    // instanceof, not constructor.name: the bundle is minified and class names are mangled
    const kind = e instanceof NotOwnerError ? "NotOwnerError" : String((e as Error).message);
    log("warn", `<b>extendEntity refused</b> — ${kind}. A disputant cannot preserve someone else's reading.`);
  }
  // so the disputant writes, and pays for, its OWN copy
  const original = (await db.select().where({ type: "eq", key: "type", value: "snapshot" }).fetch())
    .entities.find(e => e.key === outlierKey)!;
  await pin(any(db.as(DISPUTANT)), { attributes: original.attributes, creator: original.creator, payload: original.payload },
            outlierKey, 31_536_000);
  log("ok", `<b>pin written</b> by ${short(DISPUTANT)} — its own entity, its own money, carrying originTxHash`);
  log("ok", `${rows.length} witnesses revealed round ${ROUND.toLocaleString("en-US")} — one entity each, one key each`);

  $("ttl").textContent = `${ttl}s`;
  setInterval(paint, 500);
  setInterval(() => {
    const due = Math.floor((Date.now() - startedAt) / 1000 / BLOCK_TIME);
    const behind = due - Number(db.block - 1000n);
    if (behind > 0) db.advanceSeconds(behind * BLOCK_TIME);
  }, 250);
  void paint();
}

function plot(live: Row[], median: number) {
  const W = 560, H = 132, PAD = 26;
  const lo = Math.min(...rows.map(r => r.price)), hi = Math.max(...rows.map(r => r.price));
  const x = (p: number) => PAD + ((p - lo) / (hi - lo)) * (W - PAD * 2);
  const liveSet = new Set(live.map(r => r.observer));
  const dots = rows.map(r => {
    const gone = !liveSet.has(r.observer);
    const cls = gone ? "gone" : r === outlier ? "out" : Math.abs(r.dev) > 200 ? "far" : "near";
    return `<circle class="${cls}" cx="${x(r.price).toFixed(1)}" cy="${(H / 2).toFixed(1)}" r="${r === outlier ? 7 : 5}"></circle>`;
  }).join("");
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="31 observed prices with the published median">
    <line class="axis" x1="${PAD}" y1="${H / 2 + 26}" x2="${W - PAD}" y2="${H / 2 + 26}"></line>
    <line class="med" x1="${x(median).toFixed(1)}" y1="18" x2="${x(median).toFixed(1)}" y2="${H / 2 + 26}"></line>
    <text class="lbl" x="${x(median).toFixed(1)}" y="12" text-anchor="middle">published median ${usd(median)}</text>
    ${dots}
    <text class="tick" x="${PAD}" y="${H / 2 + 44}" text-anchor="start">${usd(lo)}</text>
    <text class="tick" x="${W - PAD}" y="${H / 2 + 44}" text-anchor="end">${usd(hi)}</text>
  </svg>`;
}

async function paint() {
  const d = await divergence(any(db), MARKET, ROUND);
  const liveObs = d.rows.map(r => {
    const dev = Number(r.attributes.find(a => a.key === "deviationBps")?.value);
    return rows.find(x => x.dev === dev && x.addr === r.creator)!;
  }).filter(Boolean);

  $("plot").innerHTML = plot(liveObs, publishedMedian);
  $("reporting").textContent = `${d.rows.length}`;
  $("spread").textContent = liveObs.length
    ? `${Math.max(...liveObs.map(r => r.dev)) - Math.min(...liveObs.map(r => r.dev))}`
    : "0";
  $("medianHf").textContent = String(d.median);
  $("block").textContent = String(db.block);

  const far = [...liveObs].sort((a, b) => Math.abs(b.dev) - Math.abs(a.dev)).slice(0, 6);
  $("board").innerHTML = far.map(r => `<tr class="${r === outlier ? "out" : ""}">
      <td class="mono">${short(r.addr)}</td><td class="mono">node ${r.observer}</td>
      <td class="mono num">${usd(r.price)}</td><td class="mono num">${r.hf}</td>
      <td class="mono num dev">${r.dev > 0 ? "+" : ""}${r.dev}</td></tr>`).join("")
    || `<tr><td colspan="5" class="empty">no readings left in the query surface</td></tr>`;

  const outlierLive = liveObs.some(r => r === outlier);
  $("outlierState").className = outlierLive ? "state live" : "state gone";
  $("outlierState").innerHTML = outlierLive
    ? `the outlier <b>node ${outlier.observer}</b> is on the board, named by its own key — it cannot be edited or handed over`
    : `the outlier's reading has <b>lapsed</b> — it was never deleted, and the pin someone else paid for is still here`;

  const pins = await db.select().where({ type: "eq", key: "type", value: "pin" }).limit(5).fetch();
  $("pins").textContent = String(pins.entities.length);

  $("pulse").animate([{ opacity: 1 }, { opacity: 0.25 }], { duration: 400 });
  for (const e of db.events) {
    const id = e.name + (e as any).entityKey;
    if (seen.has(id) || e.name === "ArkivEntityCreated") continue;
    seen.add(id);
    if (e.name === "ArkivEntityExpired")
      log("bad", `<b>ArkivEntityExpired</b> ${short(e.entityKey)} — emitted under the witness's own key. Silence is an event.`);
  }
}

void boot();
