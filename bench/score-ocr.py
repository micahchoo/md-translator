# /// script
# requires-python = ">=3.10,<3.13"
# dependencies = ["sacrebleu"]
# ///
"""Scores corpus/runs/ocr/*.jsonl with chrF and decides which languages are offered.

    uv run bench/score-ocr.py [variant]

The floors are chrF 85 on synthetic scans and 80 on real pages, fixed before
any real page was read. Twelve pages cannot place a score near 80 on either
side of it, so the rule decided after the results is: a language is offered
unless the 90% bootstrap range of a score lies wholly below its floor. A
language whose model has no pages is not offered.
"""
import collections
import json
import pathlib
import random
import sys

from sacrebleu.metrics import CHRF

SCAN_FLOOR, PAGE_FLOOR = 85.0, 80.0
chrf = CHRF()
runs = pathlib.Path("corpus/runs/ocr")
score = collections.defaultdict(dict)
high = collections.defaultdict(dict)  # top of the 90% bootstrap range
random.seed(0)


def corpus(rows):
    return chrf.corpus_score([r["output"] for r in rows], [[r["reference"] for r in rows]]).score


def upper(rows, n=200):
    scores = sorted(corpus([random.choice(rows) for _ in rows]) for _ in range(n))
    return scores[int(n * 0.95) - 1]


pages = {}
suffix = f"-{sys.argv[1]}" if len(sys.argv) > 1 and sys.argv[1] != "base" else ""
for name in ("synthetic", "pages"):
    path = runs / f"{name}{suffix}.jsonl"
    if not path.exists():
        continue
    groups = collections.defaultdict(list)
    for line in path.read_text().splitlines():
        r = json.loads(line)
        groups[(r["code"], r["cond"])].append(r)
        if r["cond"] == "page":
            pages[r["code"]] = r["pages"].split("/")[-1]
    for (code, cond), rows in groups.items():
        score[code][cond] = corpus(rows)
        if cond in ("scan", "page"):
            high[code][cond] = upper(rows)

print(f"{'lang':<5} {'clean':>6} {'scan':>12} {'page':>12} {'pages':>6} | verdict")
for code in sorted(score):
    s, h = score[code], high[code]
    fmt = lambda k: f"{s[k]:5.1f} (≤{h[k]:4.1f})" if k in h else (f"{s[k]:12.1f}" if k in s else f"{'-':>12}")
    below = [k for k, f in (("scan", SCAN_FLOOR), ("page", PAGE_FLOOR)) if k in h and h[k] < f]
    verdict = "not offered: no pages" if "page" not in s else f"not offered: {' and '.join(below)}" if below else "offered"
    print(f"{code:<5} {s.get('clean', float('nan')):6.1f} {fmt('scan')} {fmt('page')} {pages.get(code, '-'):>6} | {verdict}")
