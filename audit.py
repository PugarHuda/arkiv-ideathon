import re, sys

CHECKS = [
    ("typed attributes: string vs numeric", r"numeric|integer"),
    ("integers only / fixed point scaling", r"fixed point|basis points|Bps|E6|E8"),
    ("relationships = shared attribute keys", r"shared attribute key"),
    ("$creator (immutable)",                 r"\$creator"),
    ("$owner (transferable)",                r"\$owner"),
    ("changeOwnership",                      r"changeOwnership"),
    ("tx hash / verifiable writes",          r"tx hash|transaction hash"),
    ("eq() predicates",                      r"eq\("),
    ("range predicates on numerics",         r"(gte|lte|gt|lt)\("),
    ("counts instead of fetches",            r"\bcount\b"),
    ("cursor pagination",                    r"cursor"),
    ("no server-side ORDER BY",              r"ORDER BY|no server-side ordering|client-side sort|no ordering"),
    ("newest-first only",                    r"newest-first"),
    ("expiresIn (seconds, even)",            r"expiresIn"),
    ("extendEntity / Lifetime Extension",    r"extendEntity|Lifetime Extension"),
    ("mutateEntities + 1000-op cap",         r"mutateEntities"),
    ("updateEntity full-replace trap",       r"updateEntity"),
    ("deleteEntity",                         r"deleteEntity"),
    ("expiry = leaves query surface",        r"query surface"),
    ("Arkiv never executes logic",           r"never executes logic"),
    ("events are polled, not pushed",        r"polled"),
    ("no glob / wildcard / prefix search",   r"glob|wildcard|prefix match|no wildcard"),
    ("differentiated lifetimes",             r"lifetime"),
    ("what stays OFF Arkiv",                 r"stays OFF|stays off"),
    ("no private data / hash pointers",      r"Hash\b|hash of"),
]

for path in sys.argv[1:]:
    text = open(path, encoding="utf-8").read()
    print("=" * 62)
    print(path)
    print("=" * 62)
    for label, pat in CHECKS:
        n = len(re.findall(pat, text, re.I))
        mark = "OK " if n else "-- "
        print(f"  {mark} {label:<40} {n}")
    print()
