# Narration for the LAYAK expiry demo: one neural TTS clip per line, measured, then concatenated.
# The measured length of each line is what drives the on-screen timing in record.mjs — captions and
# voice cannot drift apart, because both read the same narration.json.
#
# Run:  python submissions/video/demo/narrate.py [layak|selisih]
# Needs: edge-tts, ffmpeg/ffprobe on PATH.  Writes per spec: vo-<spec>/*.mp3, vo-<spec>.m4a,
#        the narration JSON and the .srt/.vtt named in SPECS.

import asyncio, json, pathlib, subprocess, sys

VOICE = "en-US-AndrewNeural"      # neural, conversational; same register as the two walkthrough videos
RATE = "+4%"
GAP = 0.45                        # seconds of silence between lines — room to read the screen
HERE = pathlib.Path(__file__).parent

# LAYAK's names are the ones its finished video was cut against, so they are left exactly as they were.
SPECS = {
    "layak":   {"narration": "narration.json",         "subs": "LAYAK-demo",   "vo": "vo"},
    "selisih": {"narration": "narration.selisih.json", "subs": "SELISIH-demo", "vo": "vo-selisih"},
}
SPEC = sys.argv[1] if len(sys.argv) > 1 else "layak"
if SPEC not in SPECS:
    sys.exit(f"unknown spec {SPEC!r}; expected one of {', '.join(SPECS)}")
CFG = SPECS[SPEC]
VO = HERE / CFG["vo"]

# (id, text) — written to be understood with the sound off; the captions are these lines verbatim.
LAYAK_LINES = [
    ("a", "Under Indonesian law every crane carries a fitness certificate. In software that certificate is usually a row with a valid-until column."),
    ("b", "LAYAK writes it differently. The certificate's lifetime is its validity period."),
    ("c", "This is a real gate check: the same function the invariants run, against the executable spec. Only the lifetime is shortened, so you can watch it."),
    ("d", "Green. The crane is cleared, and the card names the inspector who signed it and the block it was written in."),
    ("e", "Now watch the query. It never changes, and there is no date in it. Nothing is scheduled. Nothing is going to run."),
    ("f", "The blocks tick. The lifetime runs out."),
    ("g", "Red. Not a stale row — an empty set. The certificate no longer exists to be returned, and the chain said so, under the inspector's own key."),
    ("h", "No cron. No update. No date comparison. That is the whole idea."),
]

SELISIH_LINES = [
    ("a", "On the fifth of August 2024, mid-cascade, Chainlink's ETH/USD feed published a single number for the whole market to act on."),
    ("b", "Underneath it, thirty-one nodes had each reported their own, decoded here from the NewTransmission log at block 20,458,998."),
    ("c", "They spread 868 basis points. Six were more than 200 from the median. The feed keeps the median and throws the rest away."),
    ("d", "SELISIH writes every reading as its own entity, under its own key. The same query now returns the disagreement itself."),
    ("e", "The outlier is not flagged by us. It is named by its creator, which cannot be edited or handed to anyone else."),
    ("f", "The median is drawn on this screen and never written, so there is no canonical number here for anyone to trade against."),
    ("g", "And a reading cannot be quietly withdrawn. A disputant already tried to extend this one and was refused, so it paid to pin its own copy instead."),
    ("h", "Now the outlier's lifetime runs out. Thirty of thirty-one. Nothing was deleted, the chain simply stopped serving it, and the copy someone else paid for is still here."),
]

LINES = {"layak": LAYAK_LINES, "selisih": SELISIH_LINES}[SPEC]


def dur(path: pathlib.Path) -> float:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                          "-of", "default=nw=1:nk=1", str(path)], capture_output=True, text=True, check=True)
    return float(out.stdout.strip())


def ts(t: float, sep: str) -> str:
    h, rem = divmod(t, 3600); m, s = divmod(rem, 60)
    return f"{int(h):02d}:{int(m):02d}:{int(s):02d}{sep}{int(round((s % 1) * 1000)):03d}"


async def synth() -> None:
    import edge_tts
    VO.mkdir(exist_ok=True)
    for key, text in LINES:
        await edge_tts.Communicate(text, VOICE, rate=RATE).save(str(VO / f"{key}.mp3"))
        print(f"  {key}  {dur(VO / f'{key}.mp3'):5.2f}s  {text[:58]}...")


def main() -> None:
    asyncio.run(synth())

    cues, t = [], 0.0
    for key, text in LINES:
        d = dur(VO / f"{key}.mp3")
        cues.append({"id": key, "text": text, "start": round(t, 3), "end": round(t + d, 3)})
        t += d + GAP
    total = t - GAP

    # one voiceover track: each clip padded to its slot, so audio and captions share one clock
    listing = VO / "concat.txt"
    silence = VO / "gap.mp3"
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono",
                    "-t", str(GAP), str(silence)], check=True)
    listing.write_text("".join(f"file '{k}.mp3'\nfile 'gap.mp3'\n" for k, _ in LINES), encoding="utf-8")
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", str(listing),
                    "-c:a", "aac", "-b:a", "128k", str(HERE / (CFG["vo"] + ".m4a"))], check=True)

    (HERE / CFG["narration"]).write_text(json.dumps({"voice": VOICE, "rate": RATE, "gap": GAP,
                                                     "total": round(total, 3), "cues": cues}, indent=1), encoding="utf-8")

    srt = "\n".join(f"{i}\n{ts(c['start'], ',')} --> {ts(c['end'], ',')}\n{c['text']}\n"
                    for i, c in enumerate(cues, 1))
    (HERE / (CFG["subs"] + ".srt")).write_text(srt, encoding="utf-8")
    vtt = "WEBVTT\n\n" + "\n".join(f"{ts(c['start'], '.')} --> {ts(c['end'], '.')}\n{c['text']}\n" for c in cues)
    (HERE / (CFG["subs"] + ".vtt")).write_text(vtt, encoding="utf-8")

    print()
    print(f"[{SPEC}] narration {total:.2f}s over {len(cues)} lines -> "
          f"{CFG['narration']}, {CFG['vo']}.m4a, {CFG['subs']}.srt/.vtt")
    if total > 90:
        print("WARNING: narration is long even for a dense demo", file=sys.stderr)


if __name__ == "__main__":
    main()
