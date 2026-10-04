# /// script
# requires-python = ">=3.10,<3.13"
# dependencies = ["sacrebleu"]
# ///
"""Scores corpus/runs/pib-bench/*.jsonl (bench/pib-bench.ts).

    uv run bench/score-pib.py [dir = corpus/runs/pib-bench]

For each language: sarvam-30b and Google Translate against PIB's translation,
and, where corpus/runs/vs-google.jsonl has the language, the same two against
IN22's human translation. If Google's lead over sarvam is much larger on PIB
than on IN22, PIB's text writes like a machine and the PIB score favours one.

The sharper test is "copies": sentences where Google's output is within chrF 90
of PIB's. Two independent translations of one sentence almost never come that
close (sarvam and Google: 2 of 200 in Assamese; Google and IN22's human text:
0 of 89), so a copy is a reference made with Google. "sarvam, no copies" is
sarvam's score on the rest.
"""
import json
import pathlib
import sys
from datetime import date

from sacrebleu.metrics import CHRF

RELEASED = date(2026, 3, 3)  # sarvam-30b on Hugging Face
MONTHS = {m: i + 1 for i, m in enumerate("JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC".split())}
chrf, chrfpp = CHRF(), CHRF(word_order=2)


def score(metric, outputs, refs):
    return metric.corpus_score(outputs, [refs]).score if outputs else float("nan")


def posted(d):
    """'28 NOV 2025 6:07PM by PIB Delhi' -> a date, or None."""
    parts = d.split()
    try:
        return date(int(parts[2]), MONTHS[parts[1]], int(parts[0]))
    except (IndexError, KeyError, ValueError):
        return None


in22 = {}
vs = pathlib.Path("corpus/runs/vs-google.jsonl")
if vs.exists():
    for row in map(json.loads, vs.read_text().splitlines()):
        if row["dir"] == "from-en":
            in22.setdefault(row["code"], []).append(row)

print(f"{'lang':5} {'n':>4} | {'PIB: sarvam chrF/++':>20} {'google':>7} {'lead':>5} {'copies':>7} {'sarvam, no copies':>18} | {'IN22: sarvam':>12} {'google':>7} {'lead':>5} | {'before release':>14}")
for path in sorted(pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "corpus/runs/pib-bench").glob("*.jsonl")):
    rows = [json.loads(l) for l in path.read_text().splitlines()]
    refs = [r["reference"] for r in rows]
    s = score(chrf, [r["output"] for r in rows], refs)
    spp = score(chrfpp, [r["output"] for r in rows], refs)
    g_rows = [r for r in rows if r["gt"]]
    g = score(chrf, [r["gt"] for r in g_rows], [r["reference"] for r in g_rows])
    old = sum(1 for r in rows if (p := posted(r["date"])) is None or p < RELEASED)
    copy = [bool(r["gt"]) and chrf.sentence_score(r["gt"], [r["reference"]]).score >= 90 for r in rows]
    rest = [r for r, c in zip(rows, copy) if not c]
    s_rest = score(chrf, [r["output"] for r in rest], [r["reference"] for r in rest])
    copies = f"{sum(copy)}/{len(g_rows)}" if g_rows else "-"
    line = f"{path.stem:5} {len(rows):>4} | {s:9.1f}/{spp:<10.1f} {g:7.1f} {g - s:5.1f} {copies:>7} {s_rest:18.1f} | "
    if path.stem in in22:
        h = in22[path.stem]
        hs = score(chrf, [r["sarvam"] for r in h], [r["ref"] for r in h])
        hg = score(chrf, [r["google"] for r in h], [r["ref"] for r in h])
        line += f"{hs:12.1f} {hg:7.1f} {hg - hs:5.1f} | "
    else:
        line += f"{'':12} {'':7} {'':5} | "
    print(line + f"{old:>14}")
print("\n'before release' counts pairs from releases posted before sarvam-30b was published (or undated):")
print("those may be in its training data, so their scores are an upper bound.")
