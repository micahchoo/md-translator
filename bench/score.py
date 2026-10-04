# /// script
# requires-python = ">=3.10,<3.13"
# dependencies = ["sacrebleu", "fasttext-wheel", "numpy<2"]
# ///
"""Scores corpus/runs/pairs/*.jsonl and applies the pass rule.

    uv run bench/score.py [dir = corpus/runs/pairs]

The floors are Kannada's chrF into English and Hindi's from English, less 10:
the weaker shipped language in each direction. Language ID is measured against
the references too, because GlotLID confuses close languages on its own.
"""
import json
import pathlib
import sys

import fasttext
from sacrebleu.metrics import CHRF

INTO_FLOOR, FROM_FLOOR = 48.0, 35.0
WRONG = {"untranslated", "script", "partial", "empty"}
lid = fasttext.load_model("corpus/glotlid/model.bin")
chrf, chrfpp = CHRF(), CHRF(word_order=2)


def label(texts):
    return [l[0].removeprefix("__label__") for l in lid.predict([t.replace("\n", " ") for t in texts])[0]]


def corpus(metric, rows):
    return metric.corpus_score([r["output"] for r in rows], [[r["reference"] for r in rows]]).score


def same(a, b):
    return "".join(a.split()) == "".join(b.split())


def wrong(rows):
    """Flagged in the wrong language, or returned unchanged: a copied block
    counts even when no flag fired (short headings slipped past until 2026-10-04)."""
    return sum(1 for r in rows if WRONG & set(r["flags"]) or same(r["output"], r["source"]))


print(f"{'column':<9} {'into chrF/++':>13} {'lid':>4} {'wr':>3} | {'from chrF/++':>13} {'lid':>4} {'ref':>4} {'wr':>3} | {'mk':>2} {'wr':>2} | verdict")
for path in sorted(pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "corpus/runs/pairs").glob("*.jsonl")):
    col = path.stem
    rows = [json.loads(l) for l in path.read_text().splitlines()]
    into = [r for r in rows if r["dir"] == "into-en"]
    frm = [r for r in rows if r["dir"] == "from-en"]
    probe = [r for r in rows if r["dir"] == "probe"]

    into_lid = sum(l == "eng_Latn" for l in label([r["output"] for r in into]))
    from_lid = sum(l == col for l in label([r["output"] for r in frm]))
    ref_lid = sum(l == col for l in label([r["reference"] for r in frm]))
    probe_markup = sum(1 for r in probe if "markup" in r["flags"])

    fails = []
    if corpus(chrf, into) < INTO_FLOOR: fails.append("into chrF")
    if corpus(chrf, frm) < FROM_FLOOR: fails.append("from chrF")
    if wrong(into) > 1: fails.append("into wrong")
    if wrong(frm) > 1: fails.append("from wrong")
    if into_lid < len(into) - 1: fails.append("into lid")
    if from_lid < ref_lid - 2: fails.append("from lid")
    if probe_markup > 1: fails.append("probe markup")
    if wrong(probe) > 1: fails.append("probe wrong")

    print(
        f"{col:<9} {corpus(chrf, into):6.1f}/{corpus(chrfpp, into):<6.1f} {into_lid:>4} {wrong(into):>3} | "
        f"{corpus(chrf, frm):6.1f}/{corpus(chrfpp, frm):<6.1f} {from_lid:>4} {ref_lid:>4} {wrong(frm):>3} | "
        f"{probe_markup:>2} {wrong(probe):>2} | {'PASS' if not fails else 'fail: ' + ', '.join(fails)}"
    )
