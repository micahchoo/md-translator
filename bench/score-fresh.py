# /// script
# requires-python = ">=3.10"
# dependencies = ["sacrebleu"]
# ///
"""Scores bench/fresh.ts: chrF into English from the human source and from
Google Translate's source, per language. A human score well above the other
would mean memory of IN22 inflates it.

    uv run bench/score-fresh.py
"""
import json
from collections import defaultdict

from sacrebleu.metrics import CHRF

chrf = CHRF()
by = defaultdict(lambda: defaultdict(list))
for line in open("corpus/runs/fresh.jsonl"):
    r = json.loads(line)
    by[r["code"]][r["from"]].append(r)

print(f"{'lang':<5} {'from human':>11} {'from Google':>12} {'gap':>6}")
for code, arms in by.items():
    score = {k: chrf.corpus_score([r["output"] for r in v], [[r["reference"] for r in v]]).score for k, v in arms.items()}
    print(f"{code:<5} {score['human']:>11.1f} {score['google']:>12.1f} {score['human'] - score['google']:>6.1f}")
