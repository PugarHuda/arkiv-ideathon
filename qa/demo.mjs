// The checks behind the two demo pages — the ones that are filmed, so a silent regression would
// otherwise only show up in a video nobody re-watches.
//   LAYAK:   a certificate is GREEN, then RED once its lifetime lapses, with nothing run in between.
//   SELISIH: 31 decoded observations become 31 attributable readings; the outlier lapses and cannot be
//            extended by anyone else, while the pin a disputant paid for survives.
// Run: node qa/demo.mjs   (serves the repo itself; no network, no deployment)
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const TTL = 8;  // seconds — the invariants cover the statutory lifetimes; this covers the page wiring
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
const fails = [];
const check = (ok, msg) => { console.log(`  ${ok ? "ok " : "FAIL"}  ${msg}`); if (!ok) fails.push(msg); };

async function open(path) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("console", m => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", e => errors.push(String(e)));
  await page.goto(`${base}${path}?ttl=${TTL}`);
  return { page, errors };
}

// ------------------------------------------------------------------ LAYAK
console.log("\nLAYAK — an expired certificate leaves the query surface");
{
  const { page, errors } = await open("/submissions/video/demo/index.html");
  await page.waitForTimeout(1500);
  const before = { code: await page.textContent("#code"), block: Number(await page.textContent("#block")) };
  check(before.code === "GREEN", `certificate is live at start (got ${before.code})`);
  check(/0x1111/.test(await page.textContent("#certBody")), "the gate names the issuing inspector");

  await page.waitForTimeout((TTL + 3) * 1000);
  const after = { code: await page.textContent("#code"), block: Number(await page.textContent("#block")) };
  check(after.code === "RED_NO_CERT", `lifetime lapsed → the row is not returned (got ${after.code})`);
  check(after.block > before.block, `blocks advanced on the wall clock (${before.block} → ${after.block})`);
  check(/ArkivEntityExpired/.test(await page.textContent("#events")), "expiry surfaced as an on-chain event");
  check(errors.length === 0, `no console errors${errors.length ? ": " + errors.join(" | ") : ""}`);
  await page.close();
}

// ------------------------------------------------------------------ SELISIH
console.log("\nSELISIH — the disagreement is the product, and it is attributable");
{
  const { page, errors } = await open("/submissions/video/demo/selisih.html");
  await page.waitForSelector("#board tr", { timeout: 15000 });
  await page.waitForTimeout(1200);

  const reporting = Number(await page.textContent("#reporting"));
  const spread = Number(await page.textContent("#spread"));
  const medianHf = Number(await page.textContent("#medianHf"));
  check(reporting === 31, `all 31 decoded observations became readings (got ${reporting})`);
  check(spread === 868, `the spread is the one in the evidence file, 868 bps (got ${spread})`);
  check(medianHf === 12286, `median health factor is drawn from the published median price (got ${medianHf})`);
  check(/\$2,233\.80/.test(await page.textContent("#feedPrice")), "the feed's single published number is shown");
  check(/NotOwnerError/.test(await page.textContent("#events")),
        "a disputant's extendEntity on someone else's reading is refused");
  check(Number(await page.textContent("#pins")) === 1, "the disputant preserved it with a pin of its own instead");
  const outlierRow = await page.textContent("#board tr.out");
  check(/\+454/.test(outlierRow), `the outlier is on the board, named by its creator (row: ${outlierRow?.replace(/\s+/g, " ").trim()})`);

  await page.waitForTimeout((TTL + 4) * 1000);
  const left = Number(await page.textContent("#reporting"));
  check(left === 30, `the outlier's reading lapsed out of the query surface (${reporting} → ${left})`);
  check(/lapsed/.test(await page.textContent("#outlierState")), "the board says it lapsed, not that it was deleted");
  check(Number(await page.textContent("#pins")) === 1, "the pin outlived the reading it copied");
  check(/ArkivEntityExpired/.test(await page.textContent("#events")), "lapsing surfaced as an on-chain event");
  check(errors.length === 0, `no console errors${errors.length ? ": " + errors.join(" | ") : ""}`);
  await page.close();
}

await browser.close();
server.close();
console.log(fails.length ? `\n${fails.length} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
process.exit(fails.length ? 1 : 0);
