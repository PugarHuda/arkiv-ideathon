# build_site.py — makes the artifact pages proper standalone HTML documents for GitHub Pages.
# The claude.ai artifact wrapper adds doctype/head at publish time; GitHub Pages serves the files raw, so without this
# step phones render them in quirks mode at a 980 px layout width and link previews have no card. Idempotent.
import re, pathlib, sys

ROOT = pathlib.Path(__file__).parent
SITE = "https://pugarhuda.github.io/arkiv-ideathon"
PAGES = {
    "submissions/selisih.html": dict(
        title="SELISIH — a multi-witness flight recorder for DeFi risk state",
        desc="Arkiv Ideathon, DeFi track. Independent witnesses each publish their own signed snapshot of the same lending market; the product is the disagreement. Kill-tested on real mainnet state, including Chainlink's own 31 node observations.",
        og="og-selisih.png", icon="📡"),
    "submissions/layak.html": dict(
        title="LAYAK — safety certification that cannot be out of date",
        desc="Arkiv Ideathon, Other lane. Statutory crane inspection certificates as Arkiv entities whose lifetime is the validity period — an expired certificate is a row that no longer exists to be returned.",
        og="og-layak.png", icon="🏷️"),
}
HEAD = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="{desc}">
<meta name="color-scheme" content="light dark">
<link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>{icon}</text></svg>">
<link rel="canonical" href="{url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Arkiv Ideathon — PugarHuda">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{site}/submissions/{og}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{title}">
<meta name="twitter:description" content="{desc}">
<meta name="twitter:image" content="{site}/submissions/{og}">
"""

def build(rel, meta):
    p = ROOT / rel; html = p.read_text(encoding="utf-8")
    body = re.sub(r"^\s*<!doctype html>.*?<head>.*?(?=<title>)", "", html, count=1, flags=re.S | re.I)   # strip a previous build
    body = body.replace("</head>\n<body>\n", "", 1).replace("\n</body>\n</html>\n", "\n", 1)
    # split: <title> + <link> + <style> belong in <head>; everything after </style> is body
    m = re.search(r"</style>\s*", body); head_part, body_part = body[:m.end()], body[m.end():]
    url = f"{SITE}/{rel}"
    out = HEAD.format(url=url, site=SITE, **meta) + head_part.rstrip() + "\n</head>\n<body>\n" + body_part.rstrip() + "\n</body>\n</html>\n"
    p.write_text(out, encoding="utf-8")
    ok = all(k in out for k in ('<!doctype html>', 'name="viewport"', 'charset="utf-8"', 'og:image')) and out.count("<head>") == 1 and out.count("<body>") == 1
    print(f"{rel}: {'ok' if ok else 'BAD'}  ({len(out):,} bytes)")
    return ok

if __name__ == "__main__":
    sys.exit(0 if all(build(r, m) for r, m in PAGES.items()) else 1)
