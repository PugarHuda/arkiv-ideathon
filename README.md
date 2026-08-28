# Arkiv Ideathon — August 2026

Two entries for *What can YOU [ ARKIV ] ?*, the Arkiv Network ideathon (ideas + Arkiv data-model design, no deployment). One idea per track, as the rules allow.

| Entry | Track | Closes | Write-up | Form answers |
| :--- | :--- | :--- | :--- | :--- |
| **SELISIH** — a multi-witness flight recorder for DeFi risk state | Challenge 3 · DeFi (host: Marcos Miranda) | 31 Aug 2026, 23:59 UTC | [`submissions/01-defi-selisih.md`](submissions/01-defi-selisih.md) · [artifact](https://claude.ai/code/artifact/c4bf64e1-1f53-4a42-b6a3-de9e0aa91ee2) | [`submissions/FORM-selisih.md`](submissions/FORM-selisih.md) |
| **LAYAK** — safety certification that cannot be out of date | Open lane · Other (host: Santiago Zuluaga) | 31 Aug 2026, 23:59 UTC | [`submissions/02-other-layak.md`](submissions/02-other-layak.md) · [artifact](https://claude.ai/code/artifact/60440808-a338-45c2-9c30-a390939e2226) | [`submissions/FORM-layak.md`](submissions/FORM-layak.md) |

**Public site (no login):** <https://pugarhuda.github.io/arkiv-ideathon/> — [SELISIH](https://pugarhuda.github.io/arkiv-ideathon/submissions/selisih.html) · [LAYAK](https://pugarhuda.github.io/arkiv-ideathon/submissions/layak.html) · [evidence](https://pugarhuda.github.io/arkiv-ideathon/submissions/evidence/)

Submission form: <https://tally.so/r/OD9eeY>. The form answers **are** the submission; the artifacts are the optional supporting link. Artifacts are private until shared from the page's share menu — share before pasting the link.

## The two ideas in one line each

- **SELISIH** (Indonesian: the *difference* between two numbers; *berselisih*, to be in dispute). Independent witnesses each publish their own signed snapshot of the same lending market, and the product is the disagreement between them — kept apart, never aggregated, funded by whoever wants it kept. Kill-tested twice on real Ethereum mainnet state, including Chainlink's own 31 node observations decoded from `NewTransmission`.
- **LAYAK** (Indonesian: *fit* — fit to operate; a crane's certificate is a *Surat Keterangan Layak Operasi*). Statutory inspection certificates written as entities whose lifetime **is** the validity period, so an expired certificate is not a row with a stale date — it is a row that no longer exists to be returned. Grounded in Permenaker 8/2020 and positioned against Kemnaker's TemanK3.

## Repository layout

```
README.md                         this file
audit.py                          coverage check: 25 Arkiv primitives × both write-ups
review.py                         calls the Ideathon MCP's review_my_idea tool on a draft
submissions/
  01-defi-selisih.md              full SELISIH write-up (source of truth)
  02-other-layak.md               full LAYAK write-up (source of truth)
  FORM-selisih.md                 SELISIH answers mapped to the Tally form's fields, paste-ready
  FORM-layak.md                   LAYAK answers mapped to the Tally form's fields, paste-ready
  selisih.html / layak.html       the published artifact pages (diagrams, charts, embedded code)
  selisih.sketch.ts               entity-model sketch — type-checks against @arkiv-network/sdk@0.7.0
  layak.sketch.ts                 entity-model sketch — type-checks against @arkiv-network/sdk@0.7.0
  evidence/                       everything that is evidence rather than description — see its README
  video/                          LAYAK.mp4 · SELISIH.mp4 — Playwright screen recordings of the live pages with burned-in
                                  narration, wrapped by Remotion (intro/outro). 1080p, ~1:48 each. Nothing staged.
```

## What is verified, and how

Nothing here is deployed — the event forbids it and there is no open Arkiv network during August. Everything below runs offline or against public Ethereum mainnet.

| Claim | How it is checked | Where |
| :--- | :--- | :--- |
| The schemas are real Arkiv code, not pseudocode | `tsc --strict` against the published `@arkiv-network/sdk@0.7.0` package, installed from npm | `submissions/*.sketch.ts`, `evidence/tsconfig.sketch.json` |
| The designs' logic holds under Arkiv's documented rules | 17 invariants execute the sketch code against `MemArkiv`, an executable spec with every rule cited | `evidence/memarkiv.ts`, `evidence/invariants.test.ts`, `evidence/invariants.result.txt` |
| Independent observers of a DeFi market really do disagree, hardest under stress | Chainlink vs Uniswap ETH/USD at the same block, 62 blocks across the 5 Aug 2024 crash and a calm window, via archive `eth_call` | `evidence/killtest.py`, `killtest.txt`, `killtest.json` |
| The incumbent oracle's own nodes disagree — and the disagreement is discarded | 179 `NewTransmission` rounds decoded; per-node observations attributed by index | `evidence/chainlink_nodes.py`, `chainlink_nodes.json`, `chainlink_round_20458998.json` |
| Both write-ups use (or explicitly decline) every documented Arkiv primitive | `python audit.py submissions/01-defi-selisih.md submissions/02-other-layak.md` | `audit.py` |
| The walkthrough videos show the real pages | Playwright `recordVideo` against the public GitHub Pages URLs; captions injected into the DOM at known timestamps; Remotion adds title/outro cards — recorder and compositions are reproducible | `submissions/video/` |
| The artifact pages render correctly | Playwright: light/dark contrast, no horizontal overflow at 375 px and 929 px, SVG `role`/`aria-label`, no console errors | done in-session; not scripted |

## Reproducing the evidence

```sh
# 1. type-check the sketches against the real SDK
mkdir sdk && cd sdk && npm init -y && npm i @arkiv-network/sdk@0.7.0 typescript @types/node
cp ../submissions/*.sketch.ts . && cp ../submissions/evidence/tsconfig.sketch.json tsconfig.json
npx tsc -p tsconfig.json            # exit 0

# 2. run the invariants (Node ≥ 20)
mkdir -p run/evidence && cp ../submissions/*.sketch.ts run/ && cp ../submissions/evidence/{memarkiv,invariants.test}.ts run/evidence/
# tsconfig: module es2022, moduleResolution bundler, rootDir run, outDir dist — then:
npx tsc -p tsconfig.run.json && echo '{"type":"module"}' > dist/package.json && node --test dist/evidence/invariants.test.js

# 3. the kill tests (needs an archive RPC; eth.drpc.org serves historical state without a key)
python submissions/evidence/killtest.py          # ~3 min
python submissions/evidence/chainlink_nodes.py   # ~1 min
```

## Sources the designs stand on

- Ideathon MCP: `https://ideathon-mcp.arkiv.network/api/mcp` — rules, rubric, `arkiv-fundamentals`, `ideation-guide`, `network-and-roadmap`.
- `@arkiv-network/sdk` 0.7.0 (published) and 0.8.0-dev.3 (the September testnet's architecture) — read from source.
- Permenaker No. 8 Tahun 2020 (K3 Pesawat Angkat dan Angkut); LOLER 1998 (UK) for the retention duty; Kemnaker TemanK3 (digital K3 documents since 3 Dec 2025).
- Aave: the 5 Aug 2024 liquidations (~$231M) and the 10 Mar 2026 CAPO incident (~$27M, Chaos Labs post-mortem).

## Status

Both entries are complete and paste-ready. Not yet done, and only the author can do them: share the two artifacts, submit both forms (the first submission's timestamp is what settles precedence against a similar idea; later revisions keep it), and optionally film the 60-second LAYAK demo — a two-minute certificate going green, then red, with no code having run.
