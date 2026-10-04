# /// script
# requires-python = ">=3.10"
# dependencies = ["sacrebleu"]
# ///
"""Scores bench/starts.ts runs: per language, how many short blocks went wrong
without a flag. A block is silently wrong when no flag fired and its chrF
against Google Translate's answer is under 20, or it is the source unchanged.
Flagged blocks are counted apart: the reader sees those.

    uv run bench/score-starts.py corpus/runs/starts-own.jsonl corpus/runs/starts-hindi.jsonl
"""
import json
import sys
from collections import defaultdict

from sacrebleu.metrics import CHRF

chrf = CHRF()


def same(a, b):
    return "".join(a.split()) == "".join(b.split())


for path in sys.argv[1:]:
    by = defaultdict(list)
    for line in open(path):
        r = json.loads(line)
        by[r["code"]].append(r)
    print(f"== {path}\nlang  blocks  silent  flagged  chrF vs GT")
    for code, rows in by.items():
        scores = [chrf.sentence_score(r["output"], [r["gt"]]).score for r in rows]
        silent = sum(1 for r, s in zip(rows, scores) if not r["flags"] and (s < 20 or same(r["output"], r["source"])))
        flagged = sum(1 for r in rows if r["flags"])
        print(f"{code:<5} {len(rows):>6} {silent:>7} {flagged:>8} {sum(scores) / len(scores):>11.1f}")
