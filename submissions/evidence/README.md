# evidence/

Everything in this directory is evidence rather than description: it was run, and it can be re-run. Nothing touches an Arkiv network — the event forbids deployment and there is no open network during August 2026. Two scripts read public Ethereum mainnet through an archive RPC; the rest is offline.

| File | What it is | Produced by |
| :--- | :--- | :--- |
| `memarkiv.ts` | An **executable specification** of the twelve Arkiv rules both designs depend on — owner-only extend, full-replace update, 2-second blocks, expiry leaving the query surface, one-page `count()`, atomic batches, the on-chain events, newest-first results, `eq`-only strings, `not(key)` as absence, `$creator`/`$owner` semantics, metadata fields. Every rule is cited to the SDK source file or the fundamentals doc in a comment. It is **not Arkiv** and claims nothing about performance; it is the referee for the designs' logic. | hand-written |
| `invariants.test.ts` | 17 invariants (9 LAYAK, 8 SELISIH) that run the **unchanged sketch code** from `../*.sketch.ts` against `MemArkiv`. One test's first run failed because the test was wrong and the design was right; the comment is left in. | hand-written |
| `invariants.result.txt` | `node --test` output: 17 tests, 17 pass, 0 fail. | `node --test dist/evidence/invariants.test.js` |
| `tsconfig.sketch.json` | The compiler options under which `../selisih.sketch.ts` and `../layak.sketch.ts` type-check with `--strict` against `@arkiv-network/sdk@0.7.0`. | hand-written |
| `killtest.py` | **Kill test 1.** Two independent observers of ETH/USD at the same block — Chainlink `latestRoundData` and Uniswap V3 `slot0` on the USDC/WETH 0.05% pool — for 31 blocks across the 5 Aug 2024 crash (20,455,000–20,462,500) and 31 across a calm window (20,600,000–20,607,500). Archive `eth_call` via `eth.drpc.org`. A third observer (Aave V3 oracle) reverted at those blocks and is excluded, not approximated. | hand-written |
| `killtest.txt` | Full per-block table and verdict. Stress: median 17.5 bps, max **423.1 bps** at block 20,459,000 (Chainlink $2,233.80 vs Uniswap $2,139.28). Calm: median 7.6, max 39.1. | `python killtest.py` |
| `killtest.json` | The same series as data, used to draw the chart on the SELISIH page. | derived from `killtest.txt` |
| `chainlink_nodes.py` | **Kill test 2.** Decodes `NewTransmission(aggregatorRoundId, answer, transmitter, int192[] observations, bytes observers, bytes32 rawReportContext)` from the ETH/USD aggregator behind the Chainlink proxy — every node's individual observation, of which only the median is ever published — for 161 rounds across the crash and 18 across a calm window. | hand-written |
| `chainlink_nodes.json` | Per-round spread of the 31 node observations. Stress: median **49.5 bps**, p90 212.8, max **868.5 bps**. Calm: median 3.3, max 10.2. | `python chainlink_nodes.py` |
| `chainlink_round_20458998.json` | The widest round, block 20,458,998, tx `0x887c3a8f…2854f`: the feed published $2,233.80 while the 31 nodes observed $2,141.32 to $2,335.32. Observations are attributed to node **index** as the `observers` bytes report them; index-to-operator mapping needs the aggregator's configuration at that block and is not claimed. | `python chainlink_nodes.py` (single-round extract) |

## Re-running

```sh
# invariants — from a directory with @arkiv-network/sdk@0.7.0, typescript and @types/node installed;
# rootDir holds ../*.sketch.ts and evidence/{memarkiv,invariants.test}.ts
npx tsc -p tsconfig.run.json && echo '{"type":"module"}' > dist/package.json
node --test dist/evidence/invariants.test.js

# kill tests — plain Python 3, no dependencies; needs an archive RPC (the scripts default to eth.drpc.org)
python killtest.py          # ~3 min, sequential calls, retries built in
python chainlink_nodes.py   # ~1 min
```

## What this evidence does and does not show

It shows that independent observation of a DeFi market genuinely diverges, that the divergence is largest exactly under stress, and that the incumbent oracle's own witnesses already disagree by hundreds of basis points at the moments that matter — while publishing one number. It shows that both designs' logic holds under Arkiv's documented rules, and that the schemas are real SDK code.

It does not show that Arkiv performs at any particular scale, that the SDK's future versions behave as 0.7.0 does (0.8.0-dev is read and discussed in the write-ups, not executed against), or that witness collusion is detectable — the write-ups say so explicitly.
