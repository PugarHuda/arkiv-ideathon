# SELISIH — second kill test: the incumbent's OWN witnesses.
# Chainlink's ETH/USD aggregator emits NewTransmission(aggregatorRoundId, answer, transmitter, int192[] observations,
# bytes observers, bytes32 rawReportContext) on every round. `observations` is every node's individual reading;
# only the median becomes "the price". This script decodes them from real mainnet logs via a public archive RPC.
# Nothing is deployed; nothing is written anywhere. Re-runs in ~1 minute.
import json, urllib.request, statistics, time
RPC = "https://eth.drpc.org"
PROXY = "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419"            # Chainlink ETH/USD proxy
T0 = "0xf6a97944f31ea060dfde0566e4167c1a1082551e64b60ecb14d599a9d023d451"  # keccak(NewTransmission(uint32,int192,address,int192[],bytes,bytes32))

def rpc(m, p):
    for i in range(4):
        try:
            r = urllib.request.Request(RPC, data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": m, "params": p}).encode(),
                                       headers={"Content-Type": "application/json", "User-Agent": "selisih-nodes/1"})
            o = json.loads(urllib.request.urlopen(r, timeout=60).read())
            if "result" in o: return o["result"]
        except Exception: pass
        time.sleep(2)
    return None

def i192(h): v = int(h, 16); return v - (1 << 256) if v >= (1 << 255) else v

def decode(data):
    d = data[2:]; w = lambda i: d[i*64:(i+1)*64]
    answer = i192(w(0)); off = int(w(2), 16) // 32; n = int(w(off), 16)
    obs = [i192(w(off+1+k)) for k in range(n)]
    bo = int(w(3), 16) // 32; bl = int(w(bo), 16); observers = list(bytes.fromhex(d[(bo+1)*64:(bo+1)*64+bl*2]))
    return answer, obs, observers

def scan(agg, fb, tb, label):
    logs = rpc("eth_getLogs", [{"fromBlock": hex(fb), "toBlock": hex(tb), "address": agg, "topics": [T0]}]) or []
    rows = []
    for l in logs:
        ans, obs, observers = decode(l["data"]); pairs = sorted(zip(obs, observers)); obs = [p[0] for p in pairs]
        med = obs[len(obs)//2]
        rows.append({"block": int(l["blockNumber"], 16), "tx": l["transactionHash"], "answer": ans/1e8, "n": len(obs),
                     "min": obs[0]/1e8, "max": obs[-1]/1e8, "spreadBps": (obs[-1]-obs[0])/med*1e4,
                     "maxAbsDevBps": max(abs((o-med)/med*1e4) for o in obs),
                     "nodesOver200": sum(1 for o in obs if abs((o-med)/med*1e4) > 200), "obs": [o/1e8 for o in obs]})
    rows.sort(key=lambda r: r["block"])
    sp = [r["spreadBps"] for r in rows]
    print(f"\n=== {label}: {len(rows)} transmissions ===")
    print(f"node spread (max-min)/median bps: median={statistics.median(sp):.1f} p90={sorted(sp)[int(len(sp)*0.9)-1]:.1f} max={max(sp):.1f}")
    top = max(rows, key=lambda r: r["spreadBps"])
    print(f"widest round: block {top['block']} tx {top['tx']} median ${top['answer']:.2f} min ${top['min']:.2f} max ${top['max']:.2f} nodes>200bps={top['nodesOver200']}/{top['n']}")
    return rows

if __name__ == "__main__":
    agg = "0x" + rpc("eth_call", [{"to": PROXY, "data": "0x245a7bfc"}, hex(20_459_000)])[-40:]   # aggregator() behind the proxy
    print("aggregator:", agg)
    S = scan(agg, 20_456_500, 20_460_500, "STRESS  5 Aug 2024")
    C = scan(agg, 20_603_000, 20_607_000, "CALM    ~25 Aug 2024")
    json.dump({"stress": S, "calm": C}, open("chainlink_nodes.json", "w"), indent=0)
