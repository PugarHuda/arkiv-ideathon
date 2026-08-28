import json, sys, urllib.request

URL = "https://ideathon-mcp.arkiv.network/api/mcp"

def call(name, args):
    body = json.dumps({"jsonrpc": "2.0", "id": 9, "method": "tools/call",
                       "params": {"name": name, "arguments": args}}).encode()
    req = urllib.request.Request(URL, data=body, headers={
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream"})
    raw = urllib.request.urlopen(req, timeout=120).read().decode("utf-8")
    out = []
    for line in raw.splitlines():
        if line.startswith("data: "):
            o = json.loads(line[6:])
            if "error" in o:
                out.append("ERROR: " + json.dumps(o["error"]))
            for c in o.get("result", {}).get("content", []):
                out.append(c.get("text", ""))
    return "\n".join(out)

path, track = sys.argv[1], sys.argv[2]
idea = open(path, encoding="utf-8").read()
print("=" * 70)
print("REVIEW:", path, "| track:", track, "| chars:", len(idea))
print("=" * 70)
print(call("review_my_idea", {"idea": idea[:20000], "track": track}))
