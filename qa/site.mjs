// qa/site.mjs — the page QA that used to be done by hand, as a script: real Chromium via Playwright.
//   node qa/site.mjs                       serves the repo locally and tests it
//   node qa/site.mjs --base https://…      tests the published site
// Checks per page × viewport: standards mode (doctype), no horizontal overflow, fonts loaded, no console errors,
// SVG label overlaps / text straddling boxes / out-of-viewBox text, dark-mode contrast, embedded code present,
// and every internal link/asset resolving. Exits 1 on any failure.
import { chromium, devices } from "playwright";
import http from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const argBase = process.argv.indexOf("--base") > -1 ? process.argv[process.argv.indexOf("--base") + 1] : null;
const ROOT = fileURLToPath(new URL("..", import.meta.url));   // fileURLToPath: the repo path contains a space
const MIME = { ".html": "text/html; charset=utf-8", ".png": "image/png", ".mp4": "video/mp4", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".vtt": "text/vtt", ".srt": "text/plain", ".ts": "text/plain", ".py": "text/plain", ".json": "application/json", ".txt": "text/plain", ".md": "text/markdown" };

let server, base = argBase;
if (!base) {
  server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0]); if (p.endsWith("/")) p += "index.html";
    const f = normalize(join(ROOT, p));
    if (!f.startsWith(normalize(ROOT)) || !existsSync(f) || statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "content-type": MIME[extname(f)] ?? "application/octet-stream" }); createReadStream(f).pipe(res);
  }).listen(0);
  await new Promise(r => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
}

const PAGES = ["/index.html", "/submissions/selisih.html", "/submissions/layak.html", "/submissions/video/index.html", "/submissions/video/demo/index.html", "/submissions/video/demo/selisih.html", "/submissions/evidence/index.html"];
const VIEWPORTS = [{ name: "iphone13", device: devices["iPhone 13"] }, { name: "929", viewport: { width: 929, height: 909 } }, { name: "1440", viewport: { width: 1440, height: 900 } }];
const fails = []; const note = (ok, msg) => { console.log(`${ok ? "  ok " : "FAIL "} ${msg}`); if (!ok) fails.push(msg); };

const browser = await chromium.launch();
for (const path of PAGES) {
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext(vp.device ?? { viewport: vp.viewport });
    const page = await ctx.newPage(); const errors = [];
    page.on("console", m => { if (m.type() === "error" && !/favicon/.test(m.text())) errors.push(m.text()); });
    page.on("pageerror", e => errors.push(String(e)));
    const resp = await page.goto(base + path, { waitUntil: "networkidle" });
    const tag = `${path} @${vp.name}`;
    note(resp?.ok(), `${tag}: HTTP ${resp?.status()}`);
    const r = await page.evaluate(() => {
      const de = document.documentElement, b = document.body;
      const hOverflow = Math.max(de.scrollWidth, b.scrollWidth) > window.innerWidth + 1;
      const offenders = [...document.querySelectorAll("body *")].filter(e => { const r = e.getBoundingClientRect(); return r.right > window.innerWidth + 1 && getComputedStyle(e.closest(".tbl, figure, pre, details, table") || e).overflowX !== "auto"; }).map(e => e.tagName + "." + String(e.className).slice(0, 20)).slice(0, 5);
      const svgs = [...document.querySelectorAll('svg[role="img"]')].map(svg => {
        const vb = svg.viewBox.baseVal;
        const texts = [...svg.querySelectorAll("text")].map(t => { const bb = t.getBBox(); return { s: t.textContent.slice(0, 20), x: bb.x, y: bb.y, w: bb.width, h: bb.height }; });
        const rects = [...svg.querySelectorAll("rect")].map(r => ({ x: +r.getAttribute("x"), y: +r.getAttribute("y"), w: +r.getAttribute("width"), h: +r.getAttribute("height") }));
        const overlaps = [], straddles = [];
        for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) { const a = texts[i], c = texts[j]; if (a.x < c.x + c.w && c.x < a.x + a.w && a.y < c.y + c.h && c.y < a.y + a.h) overlaps.push(a.s + " × " + c.s); }
        for (const t of texts) for (const q of rects) { const inX = t.x < q.x + q.w && q.x < t.x + t.w, inY = t.y < q.y + q.h && q.y < t.y + t.h; if (inX && inY) { const fully = t.x >= q.x - 1 && t.x + t.w <= q.x + q.w + 1 && t.y >= q.y - 1 && t.y + t.h <= q.y + q.h + 1; if (!fully) straddles.push(t.s); } }
        const oob = texts.filter(t => t.x < 0 || t.x + t.w > vb.width || t.y < 0 || t.y + t.h > vb.height).map(t => t.s);
        return { label: (svg.getAttribute("aria-label") || "").slice(0, 30), overlaps, straddles, oob };
      });
      const fonts = document.fonts ? [...document.fonts].filter(f => f.status === "loaded").length : -1;
      const lum = c => { const m = c.match(/\d+/g).map(Number); const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]); };
      const cr = (a, c) => { const [x, y] = [lum(a), lum(c)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
      const read = () => { const s = getComputedStyle(b); return cr(s.backgroundColor, s.color); };
      const light = read(); de.setAttribute("data-theme", "dark"); const dark = read(); de.removeAttribute("data-theme");
      const links = [...document.querySelectorAll("a[href], video source[src], track[src], img[src], link[rel=stylesheet][href]")].map(e => e.getAttribute("href") || e.getAttribute("src")).filter(h => h && !h.startsWith("http") && !h.startsWith("data:") && !h.startsWith("#") && !h.startsWith("mailto:"));
      return { standardsMode: document.compatMode === "CSS1Compat", viewportMeta: !!document.querySelector('meta[name="viewport"]'), hOverflow, offenders, svgs, fonts, contrastLight: light, contrastDark: dark, details: document.querySelectorAll("details pre").length, links, title: document.title };
    });
    note(r.standardsMode && r.viewportMeta, `${tag}: standards mode + viewport meta`);
    note(!r.hOverflow, `${tag}: no horizontal overflow${r.offenders.length ? " — " + r.offenders.join(", ") : ""}`);
    note(errors.length === 0, `${tag}: no console errors${errors.length ? " — " + errors[0].slice(0, 80) : ""}`);
    if (/selisih|layak/.test(path) && !/video|evidence/.test(path)) {
      note(r.fonts >= 3, `${tag}: web fonts loaded (${r.fonts})`);
      note(r.contrastLight >= 7 && r.contrastDark >= 7, `${tag}: body contrast light ${r.contrastLight.toFixed(1)} / dark ${r.contrastDark.toFixed(1)}`);
      note(r.details >= 3, `${tag}: embedded code blocks (${r.details})`);
      for (const s of r.svgs) note(!s.overlaps.length && !s.straddles.length && !s.oob.length, `${tag}: figure "${s.label}" clean${s.overlaps.length ? " — overlap " + s.overlaps[0] : ""}${s.straddles.length ? " — straddle " + s.straddles[0] : ""}${s.oob.length ? " — out of bounds " + s.oob[0] : ""}`);
    }
    if (vp.name === "929") {   // link check once per page
      const dir = path.slice(0, path.lastIndexOf("/") + 1);
      for (const h of new Set(r.links)) {
        const abs = new URL(h, base + dir).href.replace(base, "");
        const res = await page.request.fetch(base + abs, { method: "HEAD" }).catch(() => null);
        note(res && res.ok(), `${tag}: link ${abs} → ${res ? res.status() : "ERR"}`);
      }
    }
    await ctx.close();
  }
}
await browser.close(); server?.close();
console.log(`\n${fails.length === 0 ? "ALL CHECKS PASSED" : fails.length + " FAILURES"}`);
process.exit(fails.length ? 1 : 0);
