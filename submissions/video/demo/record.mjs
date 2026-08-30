// Records a demo page: a real 1080p screen capture, in real time, with the captions and the
// intro/outro cards injected into the DOM.
//
// Nothing is sped up, cut or re-timed. The entity whose lapse the video is about is written with a
// lifetime taken from the narration itself — TTL is the start of the line that announces it — so the
// moment on screen and the moment in the voiceover cannot drift. Both read the SAME clock: the page's
// own start timestamp, the instant the entities were written.
//
// Run:  python submissions/video/demo/narrate.py <spec> && node submissions/video/demo/record.mjs <spec>
// Out:  submissions/video/<OUT>.mp4 (+ .srt/.vtt beside it)

import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir, rm, readdir } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const TAIL = 6;              // seconds of outro card after the last narration line
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".ts": "text/plain", ".json": "application/json" };

const SPECS = {
  layak: {
    page: "/submissions/video/demo/index.html",
    startVar: "__layakStart", narration: "narration.json", subs: "LAYAK-demo", vo: "vo.m4a",
    out: "LAYAK-expiry", lapseCue: "g",
    // the gate stops answering GREEN the moment the certificate leaves the query surface
    lapse: { el: "code", whileLive: "GREEN" },
    focus: { c: ".badge", d: "#card", e: ".panel", f: ".panel:nth-of-type(2)", g: "#card", h: "footer" },
    intro: { kicker: "Arkiv Ideathon &middot; Open lane", h1: "LAYAK",
             p: "Safety certification that cannot be out of date" },
    outro: { kicker: "Nothing deployed &middot; nothing staged", h1: "The row is the deadline",
             p: "Expiry is the storage contract, not a filter someone has to remember." },
  },
  selisih: {
    page: "/submissions/video/demo/selisih.html",
    startVar: "__selisihStart", narration: "narration.selisih.json", subs: "SELISIH-demo", vo: "vo-selisih.m4a",
    out: "SELISIH-divergence", lapseCue: "h",
    // one of the 31 readings stops being served
    lapse: { el: "reporting", whileLive: "31" },
    focus: { b: "#plot", c: "table", d: ".panel", e: "#board tr.out", f: ".panel:nth-of-type(2)",
             g: "#events", h: ".card" },
    intro: { kicker: "Arkiv Ideathon &middot; Challenge 3 &middot; DeFi", h1: "SELISIH",
             p: "A multi-witness flight recorder for DeFi risk state" },
    outro: { kicker: "Nothing deployed &middot; nothing staged", h1: "Never aggregated",
             p: "The median is drawn, never written. There is no canonical number here to trade against." },
  },
};

const NAME = process.argv[2] ?? "layak";
const CFG = SPECS[NAME];
if (!CFG) { console.error(`unknown spec ${NAME}; expected one of ${Object.keys(SPECS).join(", ")}`); process.exit(2); }

const OUT = join(ROOT, "submissions", "video", `${CFG.out}.mp4`);
const RAW = join(HERE, "raw");
const narration = JSON.parse(await readFile(join(HERE, CFG.narration), "utf8"));
const END = narration.total + TAIL;
const lapseCue = narration.cues.find(c => c.id === CFG.lapseCue);
// the lifetime IS the cue: rounded up to the even number of seconds the SDK requires
const TTL = Math.ceil(lapseCue.start / 2) * 2;

const server = createServer(async (req, res) => {
  try {
    const p = join(ROOT, normalize(decodeURIComponent(req.url.split("?")[0])).replace(/^(\.\.[/\\])+/, ""));
    const body = await readFile(p);
    res.writeHead(200, { "content-type": TYPES[extname(p)] ?? "application/octet-stream" });
    res.end(body);
  } catch { res.writeHead(404).end("not found"); }
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

await rm(RAW, { recursive: true, force: true });
await mkdir(RAW, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1,
  recordVideo: { dir: RAW, size: { width: 1920, height: 1080 } },
});
const videoStart = Date.now();
const page = await context.newPage();
const problems = [];
page.on("pageerror", e => problems.push(String(e)));
page.on("console", m => m.type() === "error" && problems.push(m.text()));

await page.goto(`${base}${CFG.page}?ttl=${TTL}`);
await page.waitForFunction(`window.${CFG.startVar} !== undefined`);
const pageStart = await page.evaluate(`window.${CFG.startVar}`);
// how far into the recording the entities were written — the voiceover and subtitles shift by this
const offset = (pageStart - videoStart) / 1000;

await page.addStyleTag({ content: `
  #film{position:fixed;inset:0;pointer-events:none;z-index:9999;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
  #cap{position:absolute;left:50%;bottom:3.2rem;transform:translateX(-50%);max-width:56rem;text-align:center;
       font-size:1.65rem;line-height:1.45;font-weight:500;color:#fff;text-shadow:0 2px 18px rgba(0,0,0,.95);
       background:rgba(9,11,16,.82);border:1px solid #262D38;border-radius:.5rem;padding:.85rem 1.6rem;
       opacity:0;transition:opacity .25s}
  #cap.on{opacity:1}
  #ring{position:absolute;border:2px solid #FF7A45;border-radius:.6rem;box-shadow:0 0 0 9999px rgba(9,11,16,.42);
        opacity:0;transition:opacity .35s,top .45s,left .45s,width .45s,height .45s}
  #ring.on{opacity:1}
  .cardfs{position:absolute;inset:0;background:#0F1219;display:flex;flex-direction:column;align-items:center;
          justify-content:center;gap:1rem;text-align:center;opacity:0;transition:opacity .5s}
  .cardfs.on{opacity:1}
  .cardfs .kicker{font:500 .95rem/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.28em;
                  text-transform:uppercase;color:#8C95A3}
  .cardfs h1{font-size:4.6rem;margin:0;color:#E3E7ED;letter-spacing:-.02em}
  .cardfs p{margin:0;color:#8C95A3;font-size:1.5rem;max-width:44rem}
  .cardfs .url{font:1.05rem ui-monospace,SFMono-Regular,Menlo,monospace;color:#FF7A45;margin-top:1.2rem}
` });

await page.evaluate(({ cues, focus, total, startVar, intro: introCfg, outro: outroCfg }) => {
  const film = document.createElement("div");
  film.id = "film";
  film.innerHTML = `<div id="ring"></div>
    <div class="cardfs on" id="intro">
      <p class="kicker">${introCfg.kicker}</p><h1>${introCfg.h1}</h1><p>${introCfg.p}</p>
    </div>
    <div class="cardfs" id="outro">
      <p class="kicker">${outroCfg.kicker}</p><h1>${outroCfg.h1}</h1><p>${outroCfg.p}</p>
      <p class="url">pugarhuda.github.io/arkiv-ideathon</p>
    </div>
    <div id="cap"></div>`;                       // last, so captions sit ON TOP of the cards
  document.body.append(film);
  const cap = film.querySelector("#cap"), ring = film.querySelector("#ring");
  const intro = film.querySelector("#intro"), outro = film.querySelector("#outro");
  const t0 = window[startVar];

  setInterval(() => {
    const t = (Date.now() - t0) / 1000;
    const cue = cues.find(c => t >= c.start && t < c.end);
    intro.classList.toggle("on", t < cues[1].start - 0.35);
    outro.classList.toggle("on", t > total + 0.4);
    cap.textContent = cue ? cue.text : cap.textContent;
    cap.classList.toggle("on", !!cue);           // including over the intro card — every line is captioned
    const sel = cue && focus[cue.id];
    const el = sel && document.querySelector(sel);
    if (el && t < total + 0.4) {
      const r = el.getBoundingClientRect(), pad = 10;
      Object.assign(ring.style, { top: `${r.top - pad}px`, left: `${r.left - pad}px`,
        width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
      ring.classList.add("on");
    } else ring.classList.remove("on");
  }, 100);
}, { cues: narration.cues, focus: CFG.focus, total: narration.total, startVar: CFG.startVar,
     intro: CFG.intro, outro: CFG.outro });

// let it run, in real time, and record when the entity actually left the query surface
const flipAt = await page.evaluate(({ end, startVar, lapse }) => new Promise(resolve => {
  const t0 = window[startVar];
  let armed = false, flip = null;                // arm only once the page has finished booting
  const iv = setInterval(() => {
    const t = (Date.now() - t0) / 1000;
    const now = document.getElementById(lapse.el).textContent.trim();
    if (!armed) armed = now === lapse.whileLive;
    else if (flip === null && now !== lapse.whileLive) flip = t;
    if (t >= end) { clearInterval(iv); resolve(flip); }
  }, 100);
}), { end: END, startVar: CFG.startVar, lapse: CFG.lapse });

await context.close();
await browser.close();
server.close();

console.log(`[${NAME}] ttl ${TTL}s; entity lapsed at t=${flipAt?.toFixed(2)}s; the "${CFG.lapseCue}" line starts at ${lapseCue.start}s`);
if (problems.length) console.log("page problems:", problems);
console.log(`voiceover and captions start ${offset.toFixed(3)}s into the recording`);

// The subtitles are shifted HERE rather than with ffmpeg's -itsoffset: muxing a text stream with an input
// offset (and -shortest) makes ffmpeg spin without ever finishing. Shifted sidecars first, then a plain
// two-step encode — video+audio, then the subtitle track by stream copy.
const shift = s => {
  const [h, m, rest] = s.split(":");
  const t = Number(h) * 3600 + Number(m) * 60 + Number(rest.replace(",", ".")) + offset;
  const ss = t % 60, frac = String(Math.round((ss % 1) * 1000)).padStart(3, "0");
  return `${String(Math.floor(t / 3600)).padStart(2, "0")}:${String(Math.floor((t % 3600) / 60)).padStart(2, "0")}` +
         `:${String(Math.floor(ss)).padStart(2, "0")}${s.includes(",") ? "," : "."}${frac}`;
};
const sidecar = {};
for (const ext of ["srt", "vtt"]) {
  const text = await readFile(join(HERE, `${CFG.subs}.${ext}`), "utf8");
  sidecar[ext] = join(ROOT, "submissions", "video", `${CFG.out}.${ext}`);
  await writeFile(sidecar[ext], text.replace(/\d{2}:\d{2}:\d{2}[.,]\d{3}/g, shift), "utf8");
}

const raw = join(RAW, (await readdir(RAW)).find(f => f.endsWith(".webm")));
const tmp = join(RAW, "av.mp4");
const run = (...args) => {
  const r = spawnSync("ffmpeg", ["-y", "-v", "error", ...args], { stdio: "inherit" });
  if (r.status !== 0) { console.error("ffmpeg failed"); process.exit(r.status ?? 1); }
};
run("-i", raw, "-itsoffset", offset.toFixed(3), "-i", join(HERE, CFG.vo),
    "-map", "0:v", "-map", "1:a",
    "-c:v", "libx264", "-preset", "medium", "-crf", "21", "-pix_fmt", "yuv420p", "-r", "30",
    "-c:a", "aac", "-b:a", "160k", tmp);
run("-i", tmp, "-i", sidecar.srt, "-map", "0", "-map", "1",
    "-c", "copy", "-c:s", "mov_text", "-metadata:s:s:0", "language=eng", OUT);

await rm(RAW, { recursive: true, force: true });
console.log(`wrote ${OUT}`);
