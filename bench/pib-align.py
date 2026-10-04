# /// script
# requires-python = ">=3.10,<3.13"
# dependencies = ["sentence-transformers", "numpy"]
# ///
"""Sentence pairs from PIB release groups (bench/pib.ts pairs.jsonl).

Each release and its translation are split into sentences, embedded with LaBSE
and aligned in order: 1-1, 1-2 and 2-1 matches and skips, by dynamic
programming over cosine similarity, as Vecalign and Bertalign do. A pair is
kept only above MIN_SIM. Every pair carries the release IDs it came from.

    uv run bench/pib-align.py corpus/pib/pilot/*/pairs.jsonl > corpus/pib/pilot/sentences.jsonl

LaBSE does not know Manipuri, Mizo, Khasi or Tenyidei, and knows Konkani only
through Marathi; their pairs carry a lower confidence and must be checked.
"""
import json
import re
import sys

import numpy as np
from sentence_transformers import SentenceTransformer

MIN_SIM = 0.70
UNSEEN = {"mni", "lus", "kha", "njm", "gom"}
SKIP = -0.3  # the score of leaving a sentence unaligned

model = SentenceTransformer("sentence-transformers/LaBSE")


def sentences(text: str) -> list[str]:
    """Split at sentence marks of every script PIB writes: . ? ! । ॥ ۔ ؟ and line ends."""
    parts = re.split(r"(?<=[.?!।॥۔؟])\s+|\n+", text)
    return [p.strip() for p in parts if len(p.strip()) > 1 and re.search(r"\w", p)]


def align(src: list[str], tgt: list[str]) -> list[tuple[str, str, float]]:
    if not src or not tgt:
        return []
    # Embed each sentence and each pair of neighbours, for 1-2 and 2-1 matches.
    s2 = [src[i] + " " + src[i + 1] for i in range(len(src) - 1)]
    t2 = [tgt[j] + " " + tgt[j + 1] for j in range(len(tgt) - 1)]
    e = model.encode(src + s2 + tgt + t2, normalize_embeddings=True, batch_size=64)
    S1, S2 = e[: len(src)], e[len(src) : len(src) + len(s2)]
    T1, T2 = e[len(src) + len(s2) : len(src) + len(s2) + len(tgt)], e[len(src) + len(s2) + len(tgt) :]
    n, m = len(src), len(tgt)
    best = np.full((n + 1, m + 1), -1e9)
    back = {}
    best[0, 0] = 0
    for i in range(n + 1):
        for j in range(m + 1):
            if best[i, j] <= -1e9:
                continue
            moves = []
            if i < n and j < m:
                moves.append((1, 1, float(S1[i] @ T1[j])))
            if i + 1 < n and j < m:
                moves.append((2, 1, float(S2[i] @ T1[j])))
            if i < n and j + 1 < m:
                moves.append((1, 2, float(S1[i] @ T2[j])))
            if i < n:
                moves.append((1, 0, SKIP))
            if j < m:
                moves.append((0, 1, SKIP))
            for di, dj, score in moves:
                if best[i, j] + score > best[i + di, j + dj]:
                    best[i + di, j + dj] = best[i, j] + score
                    back[(i + di, j + dj)] = (i, j, score)
    pairs, i, j = [], n, m
    while (i, j) != (0, 0):
        pi, pj, score = back[(i, j)]
        if i - pi and j - pj:
            pairs.append((" ".join(src[pi:i]), " ".join(tgt[pj:j]), score))
        i, j = pi, pj
    return pairs[::-1]


for path in sys.argv[1:]:
    office = path.split("/")[-2]
    for line in open(path):
        group = json.loads(line)
        by = group["byLang"]
        # English is the pivot; a group without it has nothing to pair against.
        if "en" not in by:
            continue
        en = sentences(by["en"]["title"] + "\n" + by["en"]["body"])
        for lang, doc in by.items():
            if lang == "en":
                continue
            for s, t, sim in align(en, sentences(doc["title"] + "\n" + doc["body"])):
                if sim >= MIN_SIM:
                    print(json.dumps({"lang": lang, "en": s, "text": t, "sim": round(sim, 3), "confidence": "low" if lang in UNSEEN else "normal",
                                      "prid": group["prid"], "date": group["date"], "office": office}, ensure_ascii=False))
