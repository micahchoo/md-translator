# How languages are chosen and the checks are tested

The translator offers a language only if it passed a test in both directions. This folder holds that test. It also holds a second test, which measures how well the translator's warning flags catch real errors. All results below are from sarvam-30b, 2026-10-04.

## The language test

Each language was translated both ways on 10 sentences from IN22-Gen. IN22-Gen is a collection of 1,024 sentences, each translated into 22 Indian languages by professional translators. From English, each language also translated a short Markdown document with a heading, a question, a bold label, code, links and numbers. New languages were given no worked examples.

A language passed if all of these held:

- **Close to the professional translation.** We score with chrF, which counts how much of the professional version the model's version matches, letter by letter, from 0 to 100. The floor was 10 points below the weaker of Hindi and Kannada, the two languages already offered: 48 into English, 35 from English.
- **The right language.** GlotLID, a program that identifies languages, read every answer. From English, it had to name the target language nearly as often as it does for the professional versions.
- **The formatting survived,** and no more than one piece in ten came back in the wrong language. A block copied back unchanged counts as wrong whether or not a flag fired; until 2026-10-04 only flagged blocks counted, and Urdu passed by copying two of five short blocks.

| Language | Result |
| --- | --- |
| Assamese, Hindi, Kannada, Malayalam, Marathi, Nepali, Tamil, Telugu | Passed |
| Bengali, Dogri, Gujarati, Konkani, Maithili, Odia, Punjabi, Sanskrit, Urdu | Passed with worked examples (see below), after failing without them; Sanskrit by the narrowest margin (48.3 and 35.0 against floors of 48 and 35) |
| Bodo, Kashmiri, Sindhi | Passed with examples taken from IN22's own human rows; Kashmiri and Sindhi near the floor (35.2, 35.8 from English) |
| Manipuri, Santali | Wrong script without examples; with IN22's rows the right script, but under the floor (28.1 and 30.8 from English) |

Ten sentences is a screen, not a precise measurement. Sanskrit's margin is within the noise.

**Has the model memorised the test?** IN22-Gen and FLORES+ are well known, so the model may have seen them in training. A model that had memorised them would copy the professional versions. Of 440 translated sentences, 2 matched exactly, both the same short line, "This can be positive as well as negative." Only 8 came within chrF 80. The median was 48.

A second test: each of 10 IN22 sentences per language went into English twice, from its human translation, which the model may have seen, and from Google Translate's version of the same English, which it cannot have. If memory helped, the first would score higher. It scored lower in all six languages, by 1.4 to 8.3 chrF (`fresh.ts`). That test leans the other way, since Google's text keeps close to the English and so turns back into it easily, so it shows only that any help from memory is smaller than that lean. Together the two say memory does not change a verdict.

## The test of the checks

We took correct translations, damaged each one in one known way, and counted how often the checks noticed.

**Damage made by a program**, from the professional pairs: all 1,024 sentences, 11 languages, both directions. The damage is crude, but we know exactly what is wrong.

| Damage | Caught, from English | Caught, into English |
| --- | --- | --- |
| Source returned unchanged | 100% | 100% |
| Another script | 100% | 100% |
| Related language, same script | 20%: only Bengali, by the letter ৰ | — |
| Half left untranslated | 79% | 93% |
| Cut short | 97% | 98% |
| Formatting lost | 100% | 100% |
| Text added | 90% | 91% |
| A number changed | 100% | 100% |
| *Correct translation, no flag* | *97%* | *97%* |

**Damage that reads naturally**, made with Google Translate. We changed the English in one way, for example by deleting a "not", and translated both versions. The two results differ only by the change. A pair was kept only if the change survived translation and stayed in one place; for a lost "not", a translation back into English had to confirm it. The rate kept shows where Google Translate itself is weaker.

| Damage | Pairs kept | Caught |
| --- | --- | --- |
| A number changed | 172 of 220 | 100% |
| A "not" lost | 149 of 220 | 2% |
| A clause dropped | 204 of 220 | 87% |
| Half left untranslated | 220 of 220 | 85% |
| A "not" lost, into English | 220 of 220 | 10% |
| A clause dropped, into English | 220 of 220 | 56% |
| *Correct translation, no flag* | 220 of 220 | *95%* |

The rules cannot see meaning, so a lost "not" goes through. A related language in the same script also goes through. These errors are accepted for now, and a reader who knows the language checks for them.

## Tried and rejected

**A line in the prompt against related languages.** We added "Each translation is written in {L}, not in another language that shares its script" and ran the old and the new prompt on the same 20 rows per language, both directions. The old prompt already wrote the right language 20 times in 20 for all eleven, so there was nothing to fix. Scores moved by noise only (mean 48.2 → 47.8 from English), and Telugu returned the whole Markdown test in English (0 → 4 of 5 blocks). Rejected.

**Self-critique of a flagged block** (translation-agent's translate, reflect, improve). It needs the model to follow an instruction, which means chat mode, where sarvam-30b reasons before it answers. Asked to fix a Telugu sentence that dropped "if it freezes", it spent 800 tokens reasoning and gave no answer; given 4,000 tokens and 48 seconds, 14,895 characters of reasoning and still no answer. A translation takes about a second. Retrying by sampling the same parallel-text prompt stays the method.

**Looking ahead** (translation-agent shows each chunk inside the whole source). Short headings are where failures clustered, and a heading's meaning is often settled by the paragraph under it, so each block was shown the source block after it, in a line after the preamble. On the short documents, six languages, both arms on the same code: no fewer silent failures, chrF lower in four (Telugu 79.1 to 74.9), and the headings it was meant for ("Changelog", "Contributing") already right without it, since the examples arrived. Short documents were the wrong ground for it, so it was tested again on contiguous prose: FLORES+ articles, one sentence per block, four languages, 56 sentences each, scored against the professional translations. chrF moved by about a point either way (Hindi 56.8 to 56.4, Marathi 49.2 to 50.2) and no flag changed. Removed; the code and both tests are in commit f38643f.

**Terms kept unchanged by showing them as inline code** (adapted from the glossaries in Co-op Translator and translation-agent, without an instruction to the model). In Hindi it worked. In Tamil, two runs each way, the wrapping made the model treat the text as technical: it put English verbs in backticks and left a short block in English both times, where without it both blocks were translated. And sarvam-30b already keeps names such as GitHub and Obsidian Sync unchanged without help. Removed.

**A list of negation words.** For each language, `negation.ts` learns the letter sequences that mark "not" from the human translations, and flags an answer that has none while its English source denies something. It works where "not" is its own word: Hindi, Urdu, Marathi, Odia and Malayalam catch 81–100% of lost negations at 5–13% false alarms. It fails where "not" is fused into the verb: Bengali, Kannada, Nepali, Tamil and Telugu reach 16–40% false alarms. Not adopted yet; the samples are small (14–16 pairs per language).

## The model as its own judge

The rules cannot see meaning or tell related languages apart. `judge.ts` tests whether sarvam-30b can. It asks how likely the model finds an answer under the app's prompt, and under the same prompt with one thing swapped. An answer that is likelier under the swapped prompt is flagged. `likelihood.ts` reads the probabilities one token at a time, from the model's own top candidates. Forcing the text with a grammar was tried first and rejected: the model spelled unlikely text letter by letter, so the score measured the spelling.

**Related language, same script.** The label is swapped: Hindi against Marathi and Nepali, Assamese against Bengali, Urdu against Kashmiri. The answers are IN22's human translations, 15 rows per language. The prompt shows no worked examples, because relabelled examples put Hindi under "Marathi:" and taught the model that it belongs there (9 of 15 correct Hindi answers were flagged that way).

| Language | Right answer flagged | Wrong language caught |
| --- | --- | --- |
| Hindi, Marathi, Nepali | 1 of 45 | 90 of 90 |
| Assamese, Bengali | 2 of 30 | 28 of 30 |
| Urdu | 3 of 15 | not measured |

Urdu is not measured: 14 of the 15 Kashmiri texts could not be scored, because the server refuses one of the tokens their letters produce.

**A lost "not".** The English source is swapped for the same sentence without its "not". The answers are the Google Translate pairs. Across all 11 languages, 157 of 166 lost negations were caught (95%), and 9 of 166 correct answers were flagged (5%). That includes Kannada, Tamil and Telugu, where the list of negation words failed. Tamil was the weakest: 12 of 13 caught, 2 of 13 flagged.

**On the model's own answers** (`judge-own.ts`), since a model may find its own phrasing likelier and excuse its own errors. For negation it translated each sentence with and without its "not", and Google Translate read each answer back to say whether the "not" survived; only answers whose reading agreed with what was asked were scored, because a back-translation misses a negation carried by a word ("inadmissible", "without"). Of the first four disagreements read by hand, none was a dropped "not". Result: 8 of 105 correct answers flagged and 103 of 109 lost negations caught. Assamese, Hindi, Marathi, Nepali and Tamil were near-flawless; Kannada and Malayalam had 3 false alarms in 14 each. For the related language, 1 of 58 right answers was flagged and 103 of 105 wrong ones caught. No sign that the model excuses itself.

**In the app** (`src/judge.ts`), since 2026-10-04: the negation check on every block whose English holds "not", "never" or "n't", except in Kannada and Malayalam; the related-language check on a document's first three blocks of five words or more, for the measured pairs only (Hindi, Marathi, Nepali; Assamese, Bengali). It runs only where the server can score text (llama.cpp), and only on blocks the rules passed. On the first 25 blocks of this README into Hindi it raised no false alarm and took 54 seconds against 17 without it.

## Against Google Translate

The same IN22 sentences, scored against the professional translation: sarvam-30b's answers, and Google Translate's. Google scored higher in every one of 12 language and direction pairs, by chrF, chrF++ and COMET-22 alike (COMET 0.01 to 0.10 higher), and COMET preferred it sentence by sentence about 85% of the time; Tamil into English was a tie. Four of the from-English rows were made before those languages had examples, which later added 7 to 10 points, so the gap is smaller than these rows show, but Hindi and Kannada, which had examples throughout, still trailed by 6 to 8 chrF. The app uses sarvam-30b for privacy, cost and control, not for quality.

## Being measured

**sarvam-30b against PIB's own translations.** English press releases and the official translations PIB publishes beside them, aligned into sentences (`pib-align.py`), give a test set far larger than IN22 for the languages PIB covers. Only the safest pairs are used, at most five from one release. Google Translate runs on the same English, because PIB loads a machine-translation plugin: if Google agrees with PIB's text much more than with IN22's human translations, the references are themselves machine output. The first run uses November 2025, before sarvam-30b was published, so it may have seen those releases.

## Short blocks at the start of a document

In the browser on 2026-10-04, Urdu returned a heading unchanged and Telugu turned "How it works" into the word "Telugu", with no flag. The Markdown test above is one document per language and missed both. `starts.ts` runs ten small documents, each beginning with a short heading, through the app's own code. `score-starts.py` counts the blocks that went wrong with no flag, against Google Translate's answer for the same block, and every such block was then read by hand: many were good translations worded differently.

The real failures led to five new checks, each tested on the failure that showed it: a one-word heading returned unchanged; a short block in another script; an answer with no letters; the language's own name, or an earlier block's answer repeated, given as the translation; and letters a language never writes (Assamese ৰ in Bengali, Sindhi ॾ in Nepali, each confirmed on IN22's human text first; the belief that Assamese never writes র was wrong, 704 of 1,024 rows). A flagged block is retried, so the checks also raised quality: chrF against Google Translate rose from 56 to 68 in Telugu and from 56 to 69 in Nepali.

After them, blocks in the wrong language, out of 30:

| Language | Wrong language |
| --- | --- |
| Hindi, Kannada (their own examples) | 0 |
| Assamese, Marathi, Nepali | 0 |
| Tamil | 1 |
| Malayalam, Telugu | 3 |
| Bengali | 7, withdrawn |
| Odia | 5, withdrawn |

**Examples written for the languages that lacked them.** Urdu, Bengali, Odia, Gujarati, Maithili and Punjabi failed on short blocks or the Markdown test without examples: Bengali put 7 of 30 short blocks in Assamese, Odia 5 in English, Urdu copied or romanised them. `examples.ts` checks the five examples Claude wrote for each against Google Translate both ways, its own translation and Claude's line read back into English; all 30 kept their meaning, numbers, code and links. With them, all six passed the screen and put 0 of 30 short blocks in the wrong language. chrF against Google Translate on those blocks rose from 50 to 81 in Bengali and from 54 to 74 in Odia. The text that ships is Claude's, never Google's.

The six that had passed without examples (Assamese, Malayalam, Marathi, Nepali, Tamil, Telugu) were then given them too, in an A/B on the same short documents (`starts.ts staged`, examples staged in `examples.ts` until they win). Blocks in the wrong language fell from 7 of 180 to 0, and chrF against Google Translate rose in every one, by 7 to 10 points: Nepali 69 to 79, Telugu 68 to 77. They shipped.

Sanskrit, Konkani and Dogri, which had failed the first screen outright (Dogri wrote Punjabi in Gurmukhi, chrF 0.5 from English), were given examples the same way, after a Dogri line that read back as "breathed in" was rewritten. All three passed the screen (Dogri 50.0 from English) and put 0 of 30 short blocks in the wrong language. They shipped.

**The owner's own documents.** `realdocs.ts` ran the first 25 blocks of three of the owner's Markdown files, which no model has seen (a policy digest, a plugin README and this README), into Hindi, Tamil, Bengali, Urdu and Maithili: 74 blocks each. 1 to 5 blocks per language were flagged. Of the unflagged blocks GlotLID read as another language, every one read by hand was a line of acronyms kept in English as it should be (`FDA MDR (21 CFR 803) + MedWatch`), or Maithili that GlotLID took for its close relatives Bhojpuri and Magahi. One real fault: Hindi translated a command name set in bold ("Run **Draw a question**"), which a reader needs in English to find it in the app; the README now says to write such names as code.

**Examples from IN22's own human rows, for languages Claude cannot write** (the owner asked for a reliable human source, such as a Bible). IN22 was better than a Bible on three counts: modern register, the same scripts the app uses, and a CC BY 4.0 licence. Five rows no test sample contains, the Markdown wrapped around whole sentences. From English, Bodo went from 0.4 to 42.3, Sindhi 0.5 to 35.8, Kashmiri to 35.2, Manipuri 0.3 to 28.1 and Santali 0.2 to 30.8: all five now write their own language and script. Bodo, Sindhi and Kashmiri passed the screen and put 0 of 30 short blocks in the wrong language. Google Translate has no Bodo and writes Sindhi in Arabic script, so GlotLID checked those blocks instead; of the five Sindhi blocks it called Hindi, every one was Sindhi on reading (थी वेंदो, करणु, ॾसो). Manipuri and Santali stay out: right language, under the floor.

**A second length limit for short blocks.** The normal lengths were measured on IN22's long sentences, and short blocks vary more: with examples, Nepali had 8 of 30 short blocks flagged "may have added text", every one a complete translation. Of 125 such flags on sources under 40 characters, the 11 above twice the normal length held every real addition seen (a leaked label line, the English repeated: 3.3 to 40 times). So under 40 characters the limit is 2, not 1.4. The cost: a short sentence added to a short block now goes unflagged.

**Tried and rejected: Hindi's examples lent to languages without their own,** under their Hindi label. Bengali, Odia and Tamil improved; Assamese, Marathi and Nepali, the languages closest to Hindi, got worse (Assamese chrF 63 → 33). `starts.ts hindi` reproduces it.

## Limits of these methods

- **Small samples.** 10 to 20 rows per language is a screen. A margin of a point or two, as Sanskrit's, is noise.
- **Damage made by a program is cruder than real errors.** A pasted run of English is easier to see than a model's half-translation. The Google Translate pairs exist to narrow that gap, and they keep only the pairs whose change survived, so they lean toward easy sentences. How many each language lost is in the table above.
- **The length limits were chosen on the same IN22 rows that then tested them,** so their 90% is somewhat optimistic.
- **Google Translate is a yardstick, not the truth.** It translated "License" as "museum" in Tamil. Every block `score-starts.py` called wrong was read by hand before it counted.
- **A back-translation misses a negation carried by a word** ("inadmissible", "without"), so `judge-own.ts` trusts only the labels a back-translation agrees with and leaves the rest to be read.
- **Nothing here measures meaning in full.** A Telugu answer turned Tuesday into Wednesday with no flag. Only a reader who knows the language can say a translation is right.

## Run it again

The data is gated. Accept the terms on the [IN22-Gen](https://huggingface.co/datasets/ai4bharat/IN22-Gen) page, then log in and download it, with GlotLID, into the git-ignored `corpus/` folder:

```sh
uvx --from huggingface_hub hf auth login
uvx --from huggingface_hub hf download ai4bharat/IN22-Gen --repo-type dataset --local-dir corpus/in22-gen
uvx --from huggingface_hub hf download cis-lmu/glotlid model.bin --local-dir corpus/glotlid
```

| Command | What it does |
| --- | --- |
| `bun bench/pairs.ts 10` | Translates every candidate both ways with the model at `localhost:8086`. Skips languages already saved. |
| `uv run bench/score.py` | Scores the saved runs, with chrF, chrF++ and GlotLID, and prints each verdict. |
| `bun bench/contrast.ts` | Tests the checks on damage made by a program. Needs no model; takes seconds. |
| `bun bench/contrast-gt.ts 20` | Tests the checks on damage made with Google Translate. |
| `bun bench/negation.ts` | Learns each language's negation words and measures the rule. Needs no model. |
| `bun bench/starts.ts own` (or `hindi`) | Short blocks at the start of a document; `hindi` lends Hindi's examples. Score with `uv run bench/score-starts.py corpus/runs/starts-*.jsonl`. |
| `bun bench/judge-own.ts 15` | The judge on the model's own answers. Resumes; answers kept in `corpus/runs/judge-own-answers.jsonl`. |
| `bun bench/realdocs.ts 25 hi,ta <file.md>...` | The owner's own documents, first 25 blocks each. Score with `uv run bench/score-realdocs.py`. |
| `bun bench/fresh.ts 10` | Into English from human text and from text the model cannot have seen. Score with `uv run bench/score-fresh.py`. |
| `bun bench/packet.ts 25` | A review packet per language for a native reader: one offline HTML file each in `corpus/review/`, made from this README, with right / wrong / unsure per block and a button that saves the answers. |
| `bun bench/judge.ts 15 20` | Measures the model as its own judge, on language and on negation. Resumes: a language already in `corpus/runs/judge.jsonl` is skipped. |
| `uv run bench/pib-align.py <pairs.jsonl>...` | Sentence pairs from `pib.ts` release groups: LaBSE embeddings, in-order alignment with 1-1, 1-2 and 2-1 matches, kept above a similarity of 0.70, each pair with its release ID and whether its numbers agree (lakh, crore, million and billion read as values). Sentences split at the marks of every script, but not after a title (Dr., डॉ., திரு.) or an initial written as an English letter name (एल., ಎಲ್.), which split 4,512 pilot sentences in two. Each sentence is embedded once, ever: vectors are cached on disk (`PIB_EMBEDDINGS`), so rescoring the pilot takes seconds (9 s against 133 s for 60 releases). On an AMD GPU it runs in half precision, eight times faster than the CPU with the same pairs: make a ROCm environment once (`uv venv corpus/venv-rocm`, then `uv pip install -p corpus/venv-rocm torch --index-url https://download.pytorch.org/whl/rocm7.2` and `sentence-transformers numpy`) and run the script with `corpus/venv-rocm/bin/python`. `uv run --index` does not do it: it still takes PyPI's torch. Tested in `test/pib_align_test.py`. Manipuri, Mizo, Khasi, Tenyidei and Konkani, which LaBSE does not know, are marked low confidence. |
| `bun bench/pib-bench.ts <sentences.jsonl> 200` | sarvam-30b and Google Translate on PIB sentence pairs, English into each language: LaBSE similarity at least 0.85, numbers agreeing, at most 5 pairs from one release. `GT_BUDGET` caps the characters sent to Google. Score with `uv run bench/score-pib.py`, which sets the PIB scores beside IN22's and counts pairs older than sarvam-30b. |
| `bun bench/pib.ts 40` | Fetches PIB releases and their official translations as a parallel corpus. `--month 2025-09` takes a whole month, `--reg 6 --lang 11` a regional office's Tamil feed. One request at a time, cached. |

`pib.ts` reaches all 29 offices in PIB's own region list. Each office publishes in English and its own languages, read from the office's language list on `Allrel.aspx` (2026-10-04), office code then language codes:

| Office | Languages (feed number) |
| --- | --- |
| 3 Delhi, 48 National | English 1, Hindi 2, Urdu 3 (Delhi only) |
| 1 Mumbai | Marathi 9, Konkani 42 |
| 5 Hyderabad, 45 Vijayawada | Telugu 16, Telugu 46 |
| 6 Chennai | Tamil 11, Hindi 2 |
| 17 Chandigarh | Punjabi 6 |
| 19 Kolkata, 32 Agartala | Bengali 4, Bengali 37 |
| 20 Bengaluru | Kannada 8 |
| 21 Bhubaneswar | Odia 18 |
| 22 Ahmedabad | Gujarati 13 |
| 23 Guwahati | Assamese 10 |
| 24 Thiruvananthapuram | Malayalam 15 |
| 30 Imphal | Manipuri 14 |
| 33 Gangtok | Nepali 29 |
| 31 Mizoram, 35 Shillong, 34 Kohima | Mizo 32, Khasi 30, Tenyidei 31 |
| 37 Lucknow, 38 Bhopal, 39 Jaipur, 40 Patna, 41 Ranchi, 42 Shimla, 43 Raipur, 46 Dehradun, 36 Itanagar | each its own Hindi (34, 35, 33, 38, 39, 40, 41, 45, 36) |
| 44 Jammu and Kashmir | Urdu 44, Hindi 43 |

So PIB covers 15 of the 22 scheduled languages, and three more (Mizo, Khasi, Tenyidei) that no other corpus here has. No office publishes Bodo, Dogri, Kashmiri, Maithili, Sanskrit, Santali or Sindhi. Regional offices also write original releases in their own language, which may have no English version. Mizo, Khasi and Tenyidei are written in Latin script, so their language comes from the feed, never the script.

The packet's text is this project's public README, never the owner's documents. Shared by these: `candidates.ts` (every language as a target), `examples.ts` (examples for the withdrawn languages), `in22.ts` (reads IN22-Gen once and keeps it as JSON), `gt.ts` (the Google Translate client and its cache), `likelihood.ts` (the model's probability of a given text).

`contrast-gt.ts` needs `GOOGLE_TRANSLATE_API_KEY` in a git-ignored `.env.local`. It saves every answer in `corpus/gt-cache.json`, so it never pays for the same sentence twice. It refuses to start if a run would send more new characters than its budget (300,000 by default). The first full run sent about 331,000.

## Data

[IN22-Gen](https://huggingface.co/datasets/ai4bharat/IN22-Gen) (AI4Bharat, CC BY 4.0), [GlotLID](https://huggingface.co/cis-lmu/glotlid). [FLORES+](https://huggingface.co/datasets/openlanguagedata/flores_plus) (CC BY-SA 4.0) was used in the first trial only. Its terms forbid re-hosting it where web crawlers can reach it, so no part of it is in this repository.

`pib.ts` takes PIB releases and their official translations. These are Government of India works, so no open licence covers them. PIB's [Copyright Policy](https://www.pib.gov.in/content/3604_2_CopyrightPolicy.aspx) permits reproduction free of charge. The text must stay accurate, must not mislead, and must name the source. The permission does not cover third-party material inside a release.
