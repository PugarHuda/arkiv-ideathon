// MemArkiv — an executable specification of the Arkiv semantics this design depends on.
// NOT Arkiv, and not a substitute for it. Every rule below is cited to the published SDK source
// (@arkiv-network/sdk@0.7.0) or the arkiv-fundamentals doc, so that the sketches — which already
// type-check against the real package — can be EXECUTED and their invariants asserted, offline.
//
//  R1  expiresIn is seconds; lifetimes are 2-second blocks (utils/expirationTime.ts, consts BLOCK_TIME=2)
//  R2  an expired entity leaves the query surface (fundamentals: "drops off the query surface")
//  R3  only the owner may update / delete / extend (ideation-guide §4)
//  R4  updateEntity is a full replace (fundamentals: "An attribute you omit ... is silently removed")
//  R5  $creator is immutable; $owner moves via changeOwnership (types/entity.ts, actions/wallet/changeOwnership.ts)
//  R6  results are newest-first; no server-side ordering (docs: "always returns matching entities newest first")
//  R7  string attributes support eq() only; range ops on numerics (fundamentals + query/predicate.ts)
//  R8  not(key) = attribute absent; neq = not equal (query/predicate.ts)
//  R9  .count() = length of ONE page, limit ≤ 200 (query/queryBuilder.ts count(): queryResult.data.length)
//  R10 mutateEntities is one atomic transaction (actions/wallet/mutateEntities.ts: single sendArkivTransaction)
//  R11 ArkivEntityCreated(..., cost) / ArkivEntityExpired / ArkivEntityBTLExtended(..., cost) are emitted
//      (actions/public/subscribeEntityEvents.ts arkivABI); cost ∝ size × lifetime (fundamentals)
//  R12 createdAtBlock / expiresAtBlock / creator / owner are returned as metadata (types/entity.ts)

import type { Attribute } from "@arkiv-network/sdk";
import type { Predicate } from "@arkiv-network/sdk/query";
import type { Hex } from "viem";

export const BLOCK_TIME = 2;
const PAGE_MAX = 200;

type Row = {
  key: Hex; creator: Hex; owner: Hex; payload: Uint8Array; contentType: string;
  attributes: Attribute[]; createdAtBlock: bigint; expiresAtBlock: bigint; lastModifiedAtBlock: bigint; seq: number;
};
export type Event =
  | { name: "ArkivEntityCreated"; entityKey: Hex; owner: Hex; expirationBlock: bigint; cost: bigint }
  | { name: "ArkivEntityBTLExtended"; entityKey: Hex; owner: Hex; oldExpirationBlock: bigint; newExpirationBlock: bigint; cost: bigint }
  | { name: "ArkivEntityExpired"; entityKey: Hex; owner: Hex }
  | { name: "ArkivEntityOwnerChanged"; entityKey: Hex; oldOwner: Hex; newOwner: Hex };

export class NotOwnerError extends Error {}
export class InvalidExpirationError extends Error {}

// One shared store per chain; `as(signer)` returns a view over the SAME store with a different wallet.
type Store = { block: bigint; seq: number; rows: Map<Hex, Row>; events: Event[]; genesisUnix: number };

export class MemArkiv {
  private st: Store;
  constructor(public signer: Hex, st?: Store) {
    // genesis chosen so that chain time ≈ wall-clock at construction: the sketches stamp `now()` from Date.now()
    this.st = st ?? { block: 1000n, seq: 0, rows: new Map(), events: [], genesisUnix: Math.floor(Date.now() / 1000) - 1000 * BLOCK_TIME };
  }
  as(signer: Hex) { return new MemArkiv(signer, this.st); }
  get block() { return this.st.block; }
  get rows() { return this.st.rows; }
  get events() { return this.st.events; }

  // ---- time ----
  advanceSeconds(s: number) {
    this.st.block += BigInt(Math.ceil(s / BLOCK_TIME));
    for (const r of this.rows.values())                                                  // R2 + R11
      if (r.expiresAtBlock <= this.block && !r.attributes.some(a => a.key === "__expired")) {
        r.attributes.push({ key: "__expired", value: 1 });
        this.events.push({ name: "ArkivEntityExpired", entityKey: r.key, owner: r.owner });
      }
  }
  blockToUnix(b: bigint) { return this.st.genesisUnix + Number(b) * BLOCK_TIME; }
  nowUnix() { return this.blockToUnix(this.block); }

  // ---- wallet actions (same parameter shapes as the SDK) ----
  private cost(payload: Uint8Array, attributes: Attribute[], expiresIn: number) {
    const bytes = payload.length + JSON.stringify(attributes).length;
    return BigInt(bytes) * BigInt(Math.ceil(expiresIn / BLOCK_TIME));                  // R11: size × lifetime
  }
  createEntity(p: { payload: Uint8Array; attributes: Attribute[]; contentType: string; expiresIn: number }) {
    if (!Number.isInteger(p.expiresIn) || p.expiresIn <= 0 || p.expiresIn % 2 !== 0) throw new InvalidExpirationError(String(p.expiresIn)); // R1
    const seq = ++this.st.seq;
    const key = ("0x" + seq.toString(16).padStart(64, "0")) as Hex;
    const exp = this.block + BigInt(p.expiresIn / BLOCK_TIME);
    this.rows.set(key, { key, creator: this.signer, owner: this.signer, payload: p.payload, contentType: p.contentType,
      attributes: [...p.attributes], createdAtBlock: this.block, expiresAtBlock: exp, lastModifiedAtBlock: this.block, seq });
    const cost = this.cost(p.payload, p.attributes, p.expiresIn);
    this.events.push({ name: "ArkivEntityCreated", entityKey: key, owner: this.signer, expirationBlock: exp, cost });
    return { entityKey: key, txHash: ("0x" + "t".repeat(0) + key.slice(2)) as Hex };
  }
  private own(key: Hex) { const r = this.rows.get(key); if (!r) throw new Error("no such entity"); if (r.owner !== this.signer) throw new NotOwnerError(key); return r; } // R3
  extendEntity(p: { entityKey: Hex; expiresIn: number }) {
    const r = this.own(p.entityKey); const old = r.expiresAtBlock;
    r.expiresAtBlock = this.block + BigInt(p.expiresIn / BLOCK_TIME); r.lastModifiedAtBlock = this.block;
    this.events.push({ name: "ArkivEntityBTLExtended", entityKey: r.key, owner: r.owner, oldExpirationBlock: old, newExpirationBlock: r.expiresAtBlock, cost: this.cost(r.payload, r.attributes, p.expiresIn) });
    return { entityKey: r.key, txHash: r.key };
  }
  updateEntity(p: { entityKey: Hex; payload: Uint8Array; attributes: Attribute[]; contentType: string; expiresIn: number }) {
    const r = this.own(p.entityKey);                                                     // R4: full replace
    r.payload = p.payload; r.attributes = [...p.attributes]; r.contentType = p.contentType;
    r.expiresAtBlock = this.block + BigInt(p.expiresIn / BLOCK_TIME); r.lastModifiedAtBlock = this.block;
    return { entityKey: r.key, txHash: r.key };
  }
  deleteEntity(p: { entityKey: Hex }) { this.own(p.entityKey); this.rows.delete(p.entityKey); return { entityKey: p.entityKey, txHash: p.entityKey }; }
  changeOwnership(p: { entityKey: Hex; newOwner: Hex }) {
    const r = this.own(p.entityKey); const old = r.owner; r.owner = p.newOwner;         // R5: creator untouched
    this.events.push({ name: "ArkivEntityOwnerChanged", entityKey: r.key, oldOwner: old, newOwner: p.newOwner });
    return { entityKey: r.key, txHash: r.key };
  }
  mutateEntities(p: { creates?: Parameters<MemArkiv["createEntity"]>[0][]; extensions?: Parameters<MemArkiv["extendEntity"]>[0][];
                      ownershipChanges?: Parameters<MemArkiv["changeOwnership"]>[0][]; deletes?: { entityKey: Hex }[] }) {
    // R10: atomic — validate ownership/expiry for every op BEFORE applying any
    for (const e of p.extensions ?? []) this.own(e.entityKey);
    for (const o of p.ownershipChanges ?? []) this.own(o.entityKey);
    for (const d of p.deletes ?? []) this.own(d.entityKey);
    for (const c of p.creates ?? []) if (c.expiresIn % 2 !== 0 || c.expiresIn <= 0) throw new InvalidExpirationError(String(c.expiresIn));
    const createdEntities = (p.creates ?? []).map(c => this.createEntity(c).entityKey);
    const extendedEntities = (p.extensions ?? []).map(e => this.extendEntity(e).entityKey);
    const ownershipChanges = (p.ownershipChanges ?? []).map(o => this.changeOwnership(o).entityKey);
    const deletedEntities = (p.deletes ?? []).map(d => this.deleteEntity(d).entityKey);
    return { txHash: "0xbatch" as Hex, createdEntities, updatedEntities: [] as Hex[], deletedEntities, extendedEntities, ownershipChanges };
  }

  // ---- public query surface (same chain shape as the SDK builder) ----
  select(_fields?: unknown) { return new MemQuery(this); }
}

function matches(r: Row, p: Predicate): boolean {
  if (p.type === "and") return p.predicates.every(q => matches(r, q));
  if (p.type === "or") return p.predicates.some(q => matches(r, q));
  const lp = p as Extract<Predicate, { key: string }>;
  const a = r.attributes.find(x => x.key === lp.key);
  if (lp.type === "not") return a === undefined;                                         // R8
  if (a === undefined) return false;
  const v = a.value;
  switch (lp.type) {
    case "eq": return v === lp.value;
    case "neq": return v !== lp.value;
    default:
      if (typeof v !== "number" || typeof lp.value !== "number") return false;           // R7: ranges on numerics only
      return lp.type === "gt" ? v > lp.value : lp.type === "gte" ? v >= lp.value : lp.type === "lt" ? v < lp.value : v <= lp.value;
  }
}

export class MemQuery {
  private preds: Predicate[] = []; private _limit = PAGE_MAX; private _offset = 0; private _creator?: Hex; private _owner?: Hex; private _at?: bigint;
  constructor(private db: MemArkiv) {}
  where(...ps: (Predicate | Predicate[])[]) { this.preds.push(...ps.flat()); return this; }
  createdBy(h: Hex) { this._creator = h; return this; }
  ownedBy(h: Hex) { this._owner = h; return this; }
  limit(n: number) { this._limit = Math.min(n, PAGE_MAX); return this; }
  validAtBlock(_b: bigint) { this._at = _b; return this; }
  private all() {
    const at = this._at ?? this.db.block;
    return [...this.db.rows.values()]
      .filter(r => r.createdAtBlock <= at && r.expiresAtBlock > at)                     // R2 (validAtBlock reads history in the spec; see design note)
      .filter(r => (!this._creator || r.creator === this._creator) && (!this._owner || r.owner === this._owner))
      .filter(r => this.preds.every(p => matches(r, p)))
      .sort((a, b) => b.seq - a.seq);                                                    // R6: newest-first, nothing else
  }
  async fetch() {
    const rows = this.all(); const page = rows.slice(this._offset, this._offset + this._limit);
    const entities = page.map(r => ({ key: r.key, creator: r.creator, owner: r.owner, payload: r.payload, contentType: r.contentType,
      attributes: r.attributes.filter(a => a.key !== "__expired"), createdAtBlock: r.createdAtBlock, expiresAtBlock: r.expiresAtBlock, lastModifiedAtBlock: r.lastModifiedAtBlock })); // R12
    const self = this;
    const res = {
      entities,
      hasNextPage: () => self._offset + self._limit < rows.length,
      async next() { self._offset += self._limit; const n = await self.fetch(); res.entities = n.entities; res.hasNextPage = n.hasNextPage; },
    };
    return res;
  }
  async count() { return (await this.fetch()).entities.length; }                        // R9: ONE page, not a total
}
