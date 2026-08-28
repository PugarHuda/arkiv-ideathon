# SELISIH kill-test: do independent observation methods of the SAME quantity at the SAME block disagree,
# and does disagreement spike under stress?  Real Ethereum mainnet state via archive eth_call.
import json, urllib.request, time, statistics, sys
RPC = "https://eth.drpc.org"
CHAINLINK = "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419"   # ETH/USD aggregator proxy, 8 dec
UNI_POOL  = "0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640"   # Uniswap V3 USDC/WETH 0.05%, token0=USDC(6) token1=WETH(18)
AAVE_ORC  = "0x54586bE62E3c3580375aE3723C145253060Ca5C1"   # Aave V3 Oracle, 8 dec
WETH      = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"
SEL_LATEST = "0xfeaf968c"; SEL_SLOT0 = "0x3850c7bd"; SEL_ASSETPRICE = "0xb3596f07"
def one(c, b):
    body = json.dumps({"jsonrpc":"2.0","id":1,"method":"eth_call","params":[c,b]}).encode()
    for attempt in range(4):
        try:
            req = urllib.request.Request(RPC, data=body, headers={"Content-Type":"application/json","User-Agent":"selisih-killtest/1"})
            o = json.loads(urllib.request.urlopen(req, timeout=40).read())
            if "result" in o: return o["result"]
            time.sleep(1.5)
        except Exception:
            time.sleep(2 + 2*attempt)
    return None
def batch(calls):
    out = {}
    for i,(c,b) in enumerate(calls):
        out[i] = one(c, b); time.sleep(0.25)
    return out
def sample(blocks, label):
    rows = []
    for i in range(0, len(blocks), 8):
        chunk = blocks[i:i+8]; calls = []
        for b in chunk:
            hb = hex(b)
            calls += [({"to":CHAINLINK,"data":SEL_LATEST}, hb), ({"to":UNI_POOL,"data":SEL_SLOT0}, hb),
                      ({"to":AAVE_ORC,"data":SEL_ASSETPRICE+"000000000000000000000000"+WETH[2:]}, hb)]
        res = batch(calls)
        for j,b in enumerate(chunk):
            r0,r1,r2 = res.get(3*j), res.get(3*j+1), res.get(3*j+2)
            if not (r0 and r1) or len(r0) < 130 or len(r1) < 66: continue
            cl = int(r0[2+64:2+128],16)/1e8
            sqrtP = int(r1[2:2+64],16); uni = 1/((sqrtP*sqrtP)/(2**192)) * 1e12   # USDC per ETH
            aave = int(r2[2:],16)/1e8 if (r2 and len(r2) >= 66) else float('nan')
            rows.append((b, cl, uni, aave, (uni-cl)/cl*1e4, ((aave-cl)/cl*1e4 if aave==aave else float('nan'))))
        time.sleep(0.4)
    return rows
def report(rows, label):
    d_uni = [abs(r[4]) for r in rows]; d_aave = [abs(r[5]) for r in rows if r[5]==r[5]] or [float('nan')]
    print(f"\n=== {label}: {len(rows)} blocks ===")
    print(f"{'block':>9} {'chainlink':>10} {'uniswap':>10} {'aaveOracle':>11} {'uni-cl bps':>11} {'aave-cl bps':>12}")
    for r in rows: print(f"{r[0]:>9} {r[1]:>10.2f} {r[2]:>10.2f} {r[3]:>11.2f} {r[4]:>+11.1f} {r[5]:>+12.1f}")
    if rows:
        print(f"-- |uni-chainlink| bps: median={statistics.median(d_uni):.1f} p90={sorted(d_uni)[int(len(d_uni)*0.9)-1]:.1f} max={max(d_uni):.1f}")
        print(f"-- |aave-chainlink| bps: median={statistics.median(d_aave):.1f} max={max(d_aave):.1f}")
    return d_uni, d_aave
stress = list(range(20_455_000, 20_462_501, 250))   # Aug 5 2024 crash window (~50 min apart)
calm   = list(range(20_600_000, 20_607_501, 250))   # ~3 weeks later, quiet market
S = report(sample(stress, "STRESS  Aug 5 2024"), "STRESS  Aug 5 2024")
C = report(sample(calm,   "CALM    ~Aug 25 2024"), "CALM    ~Aug 25 2024")
print("\n=== VERDICT ===")
if S[0] and C[0]:
    ratio = statistics.median(S[0]) / max(statistics.median(C[0]), 0.01)
    print(f"uniswap-vs-chainlink median divergence: stress {statistics.median(S[0]):.1f} bps vs calm {statistics.median(C[0]):.1f} bps  (x{ratio:.1f})")
    print(f"max divergence: stress {max(S[0]):.1f} bps vs calm {max(C[0]):.1f} bps")
    print(f"aave-vs-chainlink median: stress {statistics.median(S[1]):.1f} bps, calm {statistics.median(C[1]):.1f} bps  -> {'NOT independent (same source)' if max(S[1])<1 else 'independent'}")
json.dump({"stress":sample.__doc__, "S":S, "C":C}, open("killtest.json","w"))
