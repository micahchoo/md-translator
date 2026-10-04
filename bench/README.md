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
| Bengali, Gujarati, Maithili, Odia, Punjabi, Urdu | Passed with worked examples (see below), after failing without them |
| Bodo, Dogri | Wrote another language: Assamese for Bodo, Punjabi for Dogri |
| Konkani, Manipuri, Santali, Sindhi | Wrong language or script, from English |
| Kashmiri | chrF too low |
| Sanskrit | chrF 1.1 points under the floor, into English |

Ten sentences is a screen, not a precise measurement. Sanskrit's margin is within the noise.

**Has the model memorised the test?** IN22-Gen and FLORES+ are well known, so the model may have seen them in training. A model that had memorised them would copy the professional versions. Of 440 translated sentences, 2 matched exactly, both the same short line, "This can be positive as well as negative." Only 8 came within chrF 80. The median was 48.

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

**What is not yet known.** These answers are human or Google Translate text. The model may judge its own translations more kindly, so the check must be measured again on sarvam-30b's own answers before the app uses it. Scoring takes about one request per token, so each check adds a second or two to a block.

## Being measured

**Looking ahead.** Short headings are where failures cluster, and a heading's meaning is often settled by the paragraph under it: Odia translated "Changelog" as "checklist". `starts.ts ahead` shows each block the source block after it, in a line after the preamble, and is compared with `starts.ts own` on the same code. The risk: a line outside the pattern may be read as an instruction, or translated too.

**Text the model cannot have seen.** `fresh.ts` turns each IN22 sentence into English twice, from its human translation and from Google Translate's version of the same English, and `score-fresh.py` compares the two. A human score well above the other would mean memory of IN22 inflates the screen.

**The judge on the model's own answers.** `judge-own.ts` repeats both judge tests with sarvam-30b's own translations, since a model may find its own phrasing likelier. For negation, Google Translate reads each answer back into English to say whether its "not" really survived, so the test also asks whether the judge catches a "not" the model dropped by itself.

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

**The owner's own documents.** `realdocs.ts` ran the first 25 blocks of three of the owner's Markdown files, which no model has seen (a policy digest, a plugin README and this README), into Hindi, Tamil, Bengali, Urdu and Maithili: 74 blocks each. 1 to 5 blocks per language were flagged. Of the unflagged blocks GlotLID read as another language, every one read by hand was a line of acronyms kept in English as it should be (`FDA MDR (21 CFR 803) + MedWatch`), or Maithili that GlotLID took for its close relatives Bhojpuri and Magahi. One real fault: Hindi translated a command name set in bold ("Run **Draw a question**"), which a reader needs in English to find it in the app; the README now says to write such names as code.

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
| `bun bench/judge.ts 15 20` | Measures the model as its own judge, on language and on negation. Resumes: a language already in `corpus/runs/judge.jsonl` is skipped. |

Shared by these: `candidates.ts` (every language as a target), `examples.ts` (examples for the withdrawn languages), `in22.ts` (reads IN22-Gen once and keeps it as JSON), `gt.ts` (the Google Translate client and its cache), `likelihood.ts` (the model's probability of a given text).

`contrast-gt.ts` needs `GOOGLE_TRANSLATE_API_KEY` in a git-ignored `.env.local`. It saves every answer in `corpus/gt-cache.json`, so it never pays for the same sentence twice. It refuses to start if a run would send more new characters than its budget (300,000 by default). The first full run sent about 331,000.

## Data

[IN22-Gen](https://huggingface.co/datasets/ai4bharat/IN22-Gen) (AI4Bharat, CC BY 4.0), [GlotLID](https://huggingface.co/cis-lmu/glotlid). [FLORES+](https://huggingface.co/datasets/openlanguagedata/flores_plus) (CC BY-SA 4.0) was used in the first trial only. Its terms forbid re-hosting it where web crawlers can reach it, so no part of it is in this repository.
