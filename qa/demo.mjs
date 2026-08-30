// The one check behind the LAYAK demo page: a certificate written with a short lifetime is GREEN,
// and is RED once that lifetime lapses — with nothing run in between but the same read.
// Run: node qa/demo.mjs   (serves the repo itself; no network, no deployment)
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const TTL = 8; // seconds — the invariants cover the statutory lifetimes; this covers the page wiring
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".ts": "text/plain", ".json": "application/json" };

const server = createServer(async (req, res) => {
  try {
    const p = join(ROOT, normalize(decodeURIComponent(req.url.split("?")[0])).replace(/^(\.\.[/\\])+/, ""));
    const body = await readFile(p);                      // read BEFORE the header — a 404 must still be a 404
    res.writeHead(200, { "content-type": TYPES[extname(p)] ?? "application/octet-stream" });
    res.end(body);
  } catch { res.writeHead(404).end("not found"); }
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("console", m => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", e => errors.push(String(e)));

await page.goto(`${base}/submissions/video/demo/index.html?ttl=${TTL}`);
const state = async () => ({ code: await page.textContent("#code"), block: Number(await page.textContent("#block")) });

const fails = [];
const check = (ok, msg) => { console.log(`  ${ok ? "ok " : "FAIL"}  ${msg}`); if (!ok) fails.push(msg); };

await page.waitForTimeout(1500);
const before = await state();
check(before.code === "GREEN", `certificate is live at start (got ${before.code})`);
check(/0x1111/.test(await page.textContent("#certBody")), "the gate names the issuing inspector");

await page.waitForTimeout((TTL + 3) * 1000);
const after = await state();
check(after.code === "RED_NO_CERT", `lifetime lapsed → the row is not returned (got ${after.code})`);
check(after.block > before.block, `blocks advanced on the wall clock (${before.block} → ${after.block})`);
check(/ArkivEntityExpired/.test(await page.textContent("#events")), "expiry surfaced as an on-chain event");
check(errors.length === 0, `no console errors${errors.length ? ": " + errors.join(" | ") : ""}`);

await browser.close();
server.close();
console.log(fails.length ? `\n${fails.length} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
process.exit(fails.length ? 1 : 0);
