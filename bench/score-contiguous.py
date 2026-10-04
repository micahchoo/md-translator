# /// script
# requires-python = ">=3.10"
# dependencies = ["sacrebleu"]
# ///
"""Scores bench/contiguous.ts: chrF against FLORES+ references, with and
without look-ahead, and how often each arm was flagged.

    uv run bench/score-contiguous.py
"""
import json
from collections import defaultdict

from sacrebleu.metrics import CHRF

chrf = CHRF()
by = defaultdict(lambda: defaultdict(list))
for line in open("corpus/runs/contiguous.jsonl"):
    r = json.loads(line)
    by[r["code"]][r["ahead"]].append(r)

print(f"{'lang':<5} {'blocks':>6} {'chrF without':>13} {'chrF with':>10} {'flagged without':>16} {'with':>5}")
for code, arms in by.items():
    s = {k: chrf.corpus_score([r["output"] for r in v], [[r["reference"] for r in v]]).score for k, v in arms.items()}
    f = {k: sum(1 for r in v if r["flags"]) for k, v in arms.items()}
    print(f"{code:<5} {len(arms[False]):>6} {s[False]:>13.1f} {s[True]:>10.1f} {f[False]:>16} {f[True]:>5}")
