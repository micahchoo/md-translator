# /// script
# requires-python = ">=3.10,<3.13"
# dependencies = ["fasttext-wheel", "numpy<2"]
# ///
"""Scores bench/realdocs.ts: per language, how many blocks were flagged, by
kind, and how many of the unflagged blocks of five words or more GlotLID reads
as another language. Those are the silent failures worth reading by hand.

    uv run bench/score-realdocs.py
"""
import json
from collections import Counter, defaultdict

import fasttext

GLOT = {"as": "asm_Beng", "en": "eng_Latn", "hi": "hin_Deva", "kn": "kan_Knda", "ml": "mal_Mlym",
        "mr": "mar_Deva", "ne": "npi_Deva", "ta": "tam_Taml", "te": "tel_Telu"}
lid = fasttext.load_model("corpus/glotlid/model.bin")

by = defaultdict(list)
for line in open("corpus/runs/realdocs.jsonl"):
    r = json.loads(line)
    by[r["code"]].append(r)

print(f"{'lang':<5} {'blocks':>6} {'flagged':>8}  {'silent, other language':>22}  flags")
for code, rows in by.items():
    flagged = [r for r in rows if r["flags"]]
    long_clean = [r for r in rows if not r["flags"] and len(r["output"].split()) >= 5]
    labels = lid.predict([r["output"].replace("\n", " ") for r in long_clean])[0] if long_clean else []
    silent = [r for r, l in zip(long_clean, labels) if l[0].removeprefix("__label__") != GLOT[code]]
    kinds = Counter(f for r in flagged for f in r["flags"])
    print(f"{code:<5} {len(rows):>6} {len(flagged):>8}  {len(silent):>10} of {len(long_clean):<9}  {dict(kinds)}")
    for r in silent[:3]:
        print(f"        {r['source'][:50]!r} -> {r['output'][:60]!r}")
