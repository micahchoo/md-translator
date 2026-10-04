# /// script
# requires-python = ">=3.10,<3.13"
# dependencies = ["sentence-transformers", "numpy"]
# ///
"""Sentence pairs from PIB release groups (bench/pib.ts pairs.jsonl).

Each release and its translation are split into sentences, embedded with LaBSE
and aligned in order: 1-1, 1-2 and 2-1 matches and skips, by dynamic
programming over cosine similarity, as Vecalign and Bertalign do. A pair is
kept only above MIN_SIM. Every pair carries the release IDs it came from, and
`numbers`: whether both sides hold the same numbers (null when neither has any).
The splitter and the number check are tested in test/pib_align_test.py.

    uv run bench/pib-align.py corpus/pib/pilot/*/pairs.jsonl > corpus/pib/pilot/sentences.jsonl

LaBSE does not know Manipuri, Mizo, Khasi or Tenyidei, and knows Konkani only
through Marathi; their pairs carry a lower confidence and must be checked.
"""
import json
import re
import sys

MIN_SIM = 0.70
UNSEEN = {"mni", "lus", "kha", "njm", "gom"}
SKIP = -0.3  # the score of leaving a sentence unaligned


# Words a period follows without ending a sentence. Titles were mined from the
# November 2025 pilot, where "Dr." alone split 996 English sentences in two.
TITLES = {
    "Dr", "Mr", "Mrs", "Ms", "Smt", "Shri", "Sh", "Kum", "Prof", "Sr", "St", "Lt", "Col", "Gen", "Maj", "Capt",
    "Brig", "Cdr", "Adm", "Hon", "Rs", "No", "Nos",
    "डॉ", "प्रो", "श्री", "श्रीमती", "सुश्री", "कु", "रु", "क्र",  # Devanagari
    "ড", "ডা",  # Bengali, Assamese
    "ਡਾ", "ਪ੍ਰੋ", "ਨੰ", "ਸ੍ਰੀ", "ਸ਼੍ਰੀ",  # Gurmukhi
    "ડૉ", "ડો", "પ્રો", "શ્રી", "રૂ",  # Gujarati
    "ଡ", "ଡ଼", "ପ୍ରୋ", "ଶ୍ରୀ", "ଟ",  # Odia
    "திரு", "திருமதி", "செல்வி", "ரூ",  # Tamil
    "డా", "రూ", "శ్రీ", "ప్రొ",  # Telugu
    "ಡಾ", "ಪ್ರೊ", "ರೂ", "ಶೇ", "ಶ್ರೀ", "ಪ್ರೈ", "ಲಿ",  # Kannada
    "ഡോ", "പ്രൊ", "രൂ", "ശ്രീ",  # Malayalam
}

# Initials, which PIB writes as English letter names ("एल. मुरुगन"). Marathi ends
# most sentences with "आहे.", as short as any initial, so a length rule cannot
# tell them apart; only a list can. Written in Devanagari, with and without a
# final virama and with the short e (ऎ) the southern scripts use, then carried
# to the other Brahmic scripts, whose Unicode blocks run parallel to it.
_LETTERS = ("ए बी सी डी ई एफ जी एच आई जे के एल एम एन ओ पी क्यू आर एस टी यू वी डब्ल्यू एक्स वाई जेड ज़ेड "
            "एफ् एच् एल् एम् एन् आर् एस् एक्स् जेड् ऎफ् ऎच् ऎल् ऎम् ऎन् ऎस् ऎक्स् ऎफ ऎच ऎल ऎम ऎन ऎस").split()
_SCRIPTS = (0x0980, 0x0A00, 0x0A80, 0x0B00, 0x0B80, 0x0C00, 0x0C80, 0x0D00)


def _carried(word: str, base: int) -> str | None:
    import unicodedata

    out = "".join(chr(ord(c) - 0x0900 + base) for c in word)
    return out if all(unicodedata.name(c, None) for c in out) else None


INITIALS = set(_LETTERS) | {w for base in _SCRIPTS for x in _LETTERS if (w := _carried(x, base))} | {
    "ਐੱਲ", "ਐੱਮ", "ਐੱਨ", "ਐੱਸ", "ਐੱਫ", "ਐੱਚ", "ਐੱਕਸ",  # Gurmukhi doubles the consonant
    "ஏ", "பி", "சி", "டி", "ஜி", "ஹெச்", "எச்", "ஐ", "ஜே", "கே", "க்யூ", "ஆர்", "யு", "யூ", "வி", "ஒய்", "இசட்", "ஜெட்", "எஃப்",
    "എൽ", "എം", "എൻ", "എസ്", "എഫ്", "എച്ച്", "ആർ", "കെ", "പി", "ജി", "ബി", "സി", "ഡി", "ടി", "വി",  # Malayalam chillu
}


def _ends(before: str, after: str) -> bool:
    """Whether a period between these two texts ends a sentence."""
    words = before.split()
    word = words[-1].lstrip("([\"'“‘") if words else ""
    if word in TITLES or word in INITIALS or re.fullmatch(r"[A-Z]", word):
        return False
    if re.fullmatch(r"[^\s.\d]+(?:\.[^\s.\d]+)+", word):  # कि.मी, H.E, सी.पी; never 17.92 or 29.10.2025
        return False
    # Only Latin has case: "etc. were". A digit proves nothing: many Indic
    # sentences open with the year.
    return not after[:1].islower()


def sentences(text: str) -> list[str]:
    """Split at sentence marks of every script PIB writes: . ? ! । ॥ ۔ ؟ and line ends."""
    out, start = [], 0
    for m in re.finditer(r"([.?!।॥۔؟]+)\s+|\n+", text):
        if m.group(1) == "." and not _ends(text[start : m.start()], text[m.end() :]):
            continue
        out.append(text[start : m.start() + len(m.group(1) or "")])
        start = m.end()
    out.append(text[start:])
    return [p.strip() for p in out if len(p.strip()) > 1 and re.search(r"\w", p)]


# English counts in millions, Indian languages in lakhs and crores: "6.3 million"
# is "63 लाख". Matched as a prefix of the word after the number, which takes
# case endings ("लाखांहून", "ಲಕ್ಷಕ್ಕೂ", "కోట్ల").
SCALES = [
    (10**5, ("lakh", "lac", "लाख", "লাখ", "লক্ষ", "ਲੱਖ", "લાખ", "ଲକ୍ଷ", "லட்ச", "లక్ష", "ಲಕ್ಷ", "ലക്ഷ", "لاکھ")),
    (10**7, ("crore", "करोड़", "करोड", "कोटी", "কোটি", "ਕਰੋੜ", "કરોડ", "କୋଟି", "கோடி", "కోట", "కోటి", "ಕೋಟಿ", "കോടി", "کروڑ")),
    (10**6, ("million", "ದಶಲಕ್ಷ", "मिलियन", "মিলিয়ন", "ਮਿਲੀਅਨ", "મિલિયન", "ମିଲିୟନ", "மில்லியன்", "మిలియన్", "ಮಿಲಿಯನ್", "മില്യ", "ملین")),
    (10**9, ("billion", "बिलियन", "বিলিয়ন", "ਬਿਲੀਅਨ", "બિલિયન", "ବିଲିୟନ", "பில்லியன்", "బిలియన్", "ಬಿಲಿಯನ್", "ബില്യ", "بلین")),
    (10**12, ("trillion",)),
]


def numbers(s: str) -> list[str]:
    """The numbers in a sentence as plain values: ASCII digits from any script, grouping commas
    dropped, and a scale word multiplied in."""
    s = "".join(str(int(c)) if c.isdecimal() else c for c in s)
    out = []
    for m in re.finditer(r"(\d+(?:,\d+)*(?:\.\d+)?)(?=\s*(\S*))", s):
        value = float(m.group(1).replace(",", ""))
        after = m.group(2).lower()
        value *= next((k for k, words in SCALES if after.startswith(words)), 1)
        out.append(str(int(value)) if value == int(value) else str(round(value, 6)))
    return sorted(out)


def numbers_agree(a: str, b: str) -> bool | None:
    """True when both sides hold the same numbers, False when not, None when neither has any."""
    na, nb = set(numbers(a)), set(numbers(b))
    return None if not na and not nb else na == nb


def align(model, src: list[str], tgt: list[str]) -> list[tuple[str, str, float]]:
    import numpy as np

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


if __name__ == "__main__":
    from sentence_transformers import SentenceTransformer

    model = SentenceTransformer("sentence-transformers/LaBSE")
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
                for s, t, sim in align(model, en, sentences(doc["title"] + "\n" + doc["body"])):
                    if sim >= MIN_SIM:
                        # Recorded, not yet a filter: the measuring stick decides that.
                        print(json.dumps({"lang": lang, "en": s, "text": t, "sim": round(sim, 3), "numbers": numbers_agree(s, t),
                                          "confidence": "low" if lang in UNSEEN else "normal",
                                          "prid": group["prid"], "date": group["date"], "office": office}, ensure_ascii=False))
