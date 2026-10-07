# HANDOFF — md-translator (2026-10-01)

Static app: paste/attach Markdown → code segments it → sarvam-30b (raw /v1/completions,
parallel-text prompt, thinking never starts) → streamed Hindi/Kannada → copyable Markdown.
Design record and measurements: `.brainstorm/sessions/0001-md-translator.md`.

## Done (first phases, 2026-10-01)
- Phase 1 `src/segment.ts` — segment / mask / unmask / assemble / splitPassage. Verified on 456 real files.
- Phase 2 `src/checks.ts`, `src/prompt.ts`, `src/languages.ts` — 8 flags; parallel prompt; 5 neutral examples per language.
- Phase 3 `src/llm.ts` (SSE client, `targetAddressSpace: 'local'` for private IPs only), `src/translate.ts` (greedy, then up to 3 sampled retries at T 0.6, keep lowest-weight attempt, only clean pairs become context).

- Phase 4 UI: `index.html`, `src/main.ts`, `src/settings.ts`, `src/style.css` (63 tests pass).
- Phase 5: `vite.config.ts` (base './'), `.github/workflows/pages.yml` (bun test + build + deploy). Verified in headless Chromium against :8086.

- Typography: lang attributes, Indic line height 1.85 / size 1.07em, ZWJ/ZWNJ guard tests.
- Aligned view (`src/blocks.ts`): Source / Blocks / Markdown views, per-block Retry and Edit, follow the running block, show only flagged. `src/store.ts` keeps documents in localStorage; a stopped run resumes.
- Indented code is disabled (pasted text is indented prose); text inside HTML blocks is translated, tags and code/pre/script/style/comments are not.

## OCR — branch `ocr`, NOT pushed (2026-10-04, late) — read first if continuing OCR
Attached images become the source, read in the browser by Tesseract.js (src/ocr.ts). Worktree:
scratchpad/ocr-wt (its corpus/ is a symlink to the main corpus; `/corpus` is in .git/info/exclude).
Commits on `ocr` after main 345305e: 4496652 pure layer + `Language.ocr`; 4ba1365 page (Attach/paste
images, reading bar: Read as, It also has English, Next hard word, Show image); 0b0ed7a line-width
paragraphs; b62f842 automatic layout (psm 3), English on request, graphic paragraphs dropped, Hard to
read flag (blocks.ts HARD_TEXT, not a Flag: no retry fixes a source); c0a0e54 README; 1af5ef0 into
English an image waits for Read; f550249 bench README with psm-3 numbers. 166 tests pass.
Settings: tessdata_fast @87416418, Sauvola, psm 3, language model alone unless the owner ticks English.
Offered (13): en as bn brx doi gu hi kn gom mai mr pa sd. Rule (owner, after results): offered unless
the 90% bootstrap range of a score lies wholly below its floor (scan 85, page 80). bench/ocr.ts,
ocr-pages.ts (Wikisource Validated pages), score-ocr.py. Old one-block runs: corpus/runs/ocr/psm6/.
Waiting on the owner: Nepali (range reaches 80 in some bootstraps, on Hindi pages); when to merge+push.
Known faults: eng model has no ₹ at all (README says so); text over photos / white on colour; the
width rule is a heuristic (first to go if a layout model wins).
PDFs (431bee3 layer, then the page and README): src/pdf.ts uses a page's text layer when sound,
else draws and OCRs it. Unsound = under 20 letters (scan), under half in the expected script
(legacy font: Krutidev), or Indic syllable-rule breaks above 1 per 100 letters (InDesign Tamil
handout: 4-6). Any language for PDFs; no-OCR languages keep a damaged layer with a warning.
Tested: an English PDF, iihs/Tamil-Handout_RWA.pdf, a scan made from a Wikisource page. Not
tested on a real Krutidev PDF (only a unit test with Krutidev-style text).
Hard words removed (owner: no value). Nepali offered (778a846).
Layout: PP-DocLayout-S (public/models, NOTICE.txt) on EVERY page; whole-page reading only when it
finds no region or cannot load. Regions read alone: psm 6, Otsu (Sauvola drops lines on crops),
enlarged to ~36 px lines when short, margin 24 px cut to half the gap to a neighbour region; then
psm 3 Sauvola on the page with regions whited out, keeping paragraphs with mean conf >= 60 that do
not repeat a region; XY-cut at the widest gap. bench/ocr-layout.py: designed 57.0 -> 65.8, books
74.2 -> 74.0. Words kept to their region (half inside); one-line regions stacked < 0.6 line apart joined. Not adopted: masking pictures, relative margins, word filter, egret, CLAHE/edges.
Brochure left column chrF 92.7 (60.5 at the start); all six prices right; ~93% of words right, the
rest Tesseract's Kannada misreads (ಋ as ಖ/ಚ, ಘ as ಥ). A cascade (comma after every word from block 7)
was seen once, not reproduced; the form check (checks.ts#formDrift, flag 'Odd form') now flags it, so it
never becomes context. A context-dependence check in the judge was built and dropped unmeasured by
the owner: revisit only if cascades recur.
After merge: remove the worktree, its corpus link, the exclude line; stop vite preview on :4173.

## State at the end of 2026-10-04 — read this first; dated sections below are the history
Live after the final push: Any language → English, and English → 20 Indian languages (Assamese, Bengali,
Bodo, Dogri, Gujarati, Hindi, Kannada, Kashmiri, Konkani, Maithili, Malayalam, Marathi, Nepali, Odia,
Punjabi, Sanskrit, Sindhi, Tamil, Telugu, Urdu). Every one has 5 examples: Hindi/Kannada first; Bodo,
Sindhi, Kashmiri from IN22 rows (examples.ts#fromIN22); the rest Claude-written, checked both ways against GT.
App features added this session: direction picker; checks (script, echoes, digits, per-language length,
short-source length limit, never-used letters, "Not a translation"); the model as its own judge
(src/judge.ts: lost "not", related language; llama.cpp only; ~3x slower; Settings switch); edit memory;
changed-blocks-only; download note; MIT licence; README test + .claude/rules/translator-readmes.md.
Rejected with evidence (see bench/README "Tried and rejected"): kept terms, self-critique, lent Hindi
examples, look-ahead (short docs and contiguous FLORES prose), a prompt line against related languages.
Measured: no memorisation (two tests); Google Translate beats sarvam-30b on chrF and COMET everywhere.
Owner decisions: no Google option; README opening unchanged; no Sarvam-Translate; native readers yes.

Open:
- Native readers: hand out corpus/review/<code>.html (20 files, offline; "Save my answers" -> JSON).
- Manipuri, Santali: right script with IN22 examples, under the floor (28.1, 30.8 from English).
- Kannada, Malayalam: judge's negation check off (3/14 false alarms each).
- Known gaps: meaning beyond "not" (Tuesday -> Wednesday); bold moved to another word; code-mixed English
  words; translated link text in paths ([بینچ/README.md]); bold interface names (README tip: use code);
  the Settings examples box shows right-to-left lines (Urdu, Kashmiri) left to right.

## PIB corpus — queue after the November 2025 pilot (agreed 2026-10-04)
Pilot: corpus/pib/pilot/; Delhi rerun logs to delhi-500.log, the 19 regional passes to run-regional.sh ->
regional.log and <pass>/run.log. Two fetchers side by side at PIB_DELAY=500: 63 pages/min, no 403/429.
The first Delhi pass crashed at 12:21 (error hidden by run.sh's tail -3); watch delhi-500.log for it.
Status 13:51: steps 1-2 done on branch `pib-parser` (worktree ../translator-parser, fe413b5; merge after
the pilot -- run-regional.sh starts a fresh bun per pass, so pib.ts must not change mid-run). 4b and 4c
done on main (113c1d0). Verified: 403 IS retried (RETRYABLE), five times; the 12:21 crash was a page failing
six times. sarvam-30b public 2026-03-03, no stated cutoff: benchmark months after that. CVIT-PIB's own
tarball now 404s (cdn.iiit.ac.in); slices survive in the Super-NaturalInstructions pib tasks on HF.
Status 14:26: PILOT DONE (Delhi rerun 14:12, clean, 1,971 requests; no 403/429 in any pass). pib-parser
merged (7fde275). Every pass rebuilt with the fixed parser into corpus/pib/pilot-v2/ (2 requests each).
Running: full alignment on CPU -> pilot-v2/sentences.jsonl (fp32 cache key: rerun with `uv run`, not
the ROCm venv, to hit it); sarvam benchmark -> corpus/runs/pib-bench/ (log corpus/runs/pib-bench.log),
11 languages from pilot-v2/bench/sentences.jsonl (80 releases each, GPU-aligned). Konkani has 0 safe
pairs (all low confidence); Hindi/Urdu need the Delhi pairs: rerun pib-bench.ts on the full file for hi ur.
GPU: corpus/venv-rocm (torch 2.14.1+rocm7.2) runs pib-align in fp16, 11x the fp32 rate.
In order, all on the cache, no new requests:
1. Parser: 489 of 3,481 releases have page CSS at the start of `body` and the footer ("Release ID … Visitor
   Counter: N") at the end. Test first, fixture PRID 2190187. Same step: map the office labels the
   translations block uses (Bengali-TR 90 -> bn, Hindi_Cg 5 / Hindi_Ddn 1 -> hi, Telugu_Vw 2 -> te), and
   the 3 blank pages (e.g. 2189023, 56 KB, empty <h2>) -- skip, never emit an empty side.
2. page(): fetch `PressReleaseIframePage.aspx?PRID=N&reg=3&lang=1` directly. The bare URL 302s to it,
   ~25% of each page's time; 15/16 sampled pages parse identically, the 16th differed only in the footer.
3. Rebuild every pass's text from cache (PIB_DELAY=0), then align.
4. Alignment, measured at each step:
   a. Measuring stick: GT-translate the Indic side of 500 sampled pairs, chrF against the English (~$2;
      PIB is public). Later: agreement with CVIT-PIB (jerin/pib, CC BY 4.0) on 2017–2019 releases.
   b. Abbreviation-aware splitter, both sides (Dr. Rs. Mr. Smt. Prof. etc., initials, डॉ. श्री): the
      regex made ~2,500 false splits in 57,916 Delhi English sentences. Compare with Indic NLP Library's.
   c. Number agreement (native digits normalised) as filter and tie-break.
   d. Only if a gap remains: margin scoring instead of raw cosine; LASER3/SONAR for mni and lus
      (verify coverage first).
   e. Name agreement, both ways built and scored on the stick as a RANKING (does each capitalised English
      name have a match in some 1-3 word span of the other sentence?), never a fixed threshold; keep the
      one that separates better. Then offer it to the app as a "changed name" check.
      - Loose key: romanise with Aksharamukha (covers Ol Chiki, Meetei Mayek), fold vowel length,
        aspiration, n/ṇ/ñ, v/w on both sides, compare.
      - IPA: espeak-ng 1.52 (installed; voices for as bn gu hi kn ml mr ne or pa sd ta te ur, en-us) on
        both sides, PanPhon feature_edit_distance_div_maxlen. Spike 2026-10-04, 9 pilot names: right pair
        0.11-0.22, nearest wrong 0.22-0.36 -- right always nearest, but no clean threshold. English G2P
        misreads Indian names ("Murugan" -> mjʊɹɹuɡən). One espeak call per batch, not per word.
5. Before the full crawl: a concurrency setting in pib.ts (2 in flight). Estimate ~12k pages/month,
   ~10 days for 2017–2026 at 2 fetchers + direct URL; older months may be smaller — pilot one 2018 month.
6. A sarvam-30b benchmark from PIB, after step 4. Covers 14 of the 20 offered languages (none for Bodo,
   Dogri, Kashmiri, Maithili, Sanskrit, Sindhi -- they stay on IN22/FLORES); Manipuri can be retested.
   English -> X only: 93% of regional releases translate a Delhi English release posted first, so X -> en
   would start from translated text. 200 high-confidence pairs per language (Nepali has ~21 releases a
   month). First: (a) read sarvam-30b's training cutoff and take a month after it; (b) score GT against
   the PIB references on a sample -- unusually high agreement means the references are machine output
   (PIB loads Bhashini's translation plugin).
Prior art checked (all 152 HF "pib" results): only CVIT-PIB (to ~2019) and the 2022–23 dump. CVIT
matched documents by MT + tf-idf (threshold 0.51) and sentences by Bleualign; ours are linked by PIB.

## PIB Manipuri regional, overnight from 2026-10-06 23:40
- Running (systemd --user): pib-regional-mni-a (2019-01..2022-12), -b (2023-01..2026-09), -c (2025-01..2026-09,
  stopped by pib-stop-mni-c-when-b-done once b is done), pib-publish-mni (waits for a and b, then
  ./publish.sh regional/mni: LASER on the CPU for every month, several hours). Logs ../pib-parallel/data/
  regional-mni-{a,b,c}.log, publish-mni.log, publish-regional-mni.log.
- Check: grep -E "FAILED|exit [1-9]" those logs; an audit block means a new contact form (test, fix
  fetch.ts, rerun ./publish.sh regional/mni).
- Decided: LaBSE stays for Nepali and Assamese (it beat LASER3 on gold titles: 97.9/94.5, 93.0/91.5).

## PIB state, 2026-10-06 23:25 — all done (Manipuri regional since started, above)
- Hugging Face micahchoo/pib-parallel: configs sentences/documents (splits jul2019, may2021, aug2023,
  nov2025) and regional/regional_documents (splits ne, kha, gom). Every upload passed audit.py.
  Manipuri through LASER3 in may2021/aug2023/nov2025: 2,171 / 5,252 / 4,702 pairs (was ~330 a month).
- pib-parallel at a491f30, pushed. No services running.
- Open: Manipuri into `regional` (Imphal publishes ~250 a month since 2019; LASER3 now handles it);
  test LASER3 against LaBSE for Nepali and Assamese on gold titles; linguistic-utilities' data README
  still names the old single-file layout.
- Lesson: pre-encode only if it finishes before the job that needs it starts; two LASER runs on the same
  sentences halved each other (2026-10-06, ~40 min lost).

## PIB `regional` config — tasklist (agreed 2026-10-06; DONE except Manipuri regional)
Why: Nepali, Khasi, Konkani publish little per month; take every month they have, as a second config
(`regional`, one split per language), excluding the published months so no pair appears twice.
Probed: Mizo and Tenyidei publish nothing (drop); Konkani only around IFFI (Novembers); Manipuri plenty
but LaBSE cannot read it.
Spike (2026-10-06, gold = PIB-linked titles, 509 mni / 431 bn pairs; scratch spike.py, Python 3.10,
laser_encoders + requests, torch add_safe_globals([argparse.Namespace])):
  P@1 bn LaBSE .951 / LASER3 .898; mni LaBSE .554 / LASER3 .774. Median gold sim mni: LaBSE .543 (below
  the 0.70 cut: why mni had 330 pairs), LASER3 .820. LASER3 margins are small (bn .073 vs LaBSE .192):
  never reuse LaBSE's 0.70 for it. LASER3 covers mni_Beng, npi_Deva, asm_Beng, lus_Latn; NOT kha, gom.
1. crawl.sh reads passes.tsv (one office list). Never edit crawl.sh while a crawl runs.
2. regional.sh: months x offices, regional passes only (columns en), one fetcher:
   gangtok-ne and shillong-kha 2023-01..2026-09; mumbai-gom 2023-11 and 2024-11; skip jul2019, may2021,
   aug2023, nov2025. ~8k pages, ~1.5 h. Manipuri only after step 3.
3. align.py: encoder per language (LASER3 for mni; test npi/asm against LaBSE on gold titles first),
   cache key per model, and a per-model cut set on gold titles or margin scoring. Test first.
4. Packaging pools a language's months: data/regional/<lang>/<pass>-<month>/pairs.jsonl, then
   package.py and audit.py unchanged.
5. card.py + upload.py: config `regional`, splits ne/kha/gom(/mni); paths regional-sentences/<lang>.parquet.
   Card prose: what regional is, that it excludes the month splits.
6. copies.ts on regional (Google: Nepali yes; Khasi and Konkani check support; mni excluded). ~$2.
   Google spend so far by our caches: $20.43 before the months; months add up to ~$6 each.
7. Tests for each, README, push.

## PIB months, 2026-10-06 — read this first
- Crawling (systemd user units): pib-crawl-a (2019-07 then 2021-05), pib-crawl-b (2023-08), PIB_DELAY=500,
  logs ../pib-parallel/data/crawl-<month>.log. pib-publish runs ./publish.sh per month as its crawl logs
  "== done" (logs data/publish-<month>.log): rebuild, align (GPU), copies, package, audit, card, upload.
- HF account is now micahchoo (micaha redirects). Dataset: one split per month (nov2025 live).
- After the crawls finish: make crawl.sh read passes.tsv (do NOT edit crawl.sh while it runs; bash reads it
  as it goes). Then check each month's copy rates in the card's table.
- Google spend before this: ~$24 of $50; each month's copy check adds up to ~$6 (GT_BUDGET 300k chars).

## PIB published PRIVATE, 2026-10-04 evening (now public)
- Code: github.com/micahchoo/pib-parallel (PRIVATE), local at ../pib-parallel. fetch.ts, align.py, copies.ts,
  gt.ts, crawl.sh, package.py, card/README.md; 35 bun + 24 pytest tests. md-translator's copies are deleted
  (27ee848); bench/pib-bench.ts and score-pib.py stay here and read pib-parallel's sentences.jsonl.
- Data: huggingface.co/datasets/micahchoo/pib-parallel (PRIVATE): sentences (182,144) and documents (8,296)
  Parquet + the card. load_dataset verified. Built from corpus/pib/pilot-v2/ with pib-parallel's tools.
- Owner's remaining step: make both public (GitHub visibility; HF settings). THEN push md-translator: its
  bench README now links both, and pushing first would publish links that 404.
- Audits passed on the packaged files: no email or phone form (independent search, every script's digits);
  every pair mostly in its own script. Fixed on the way: "+ 91" and RTL phone forms, spaced/obfuscated
  emails, the danda mislabelling Punjabi as Hindi, 22,673 links/hashtags/initials/English-line pairs.

## PIB state, 2026-10-04 15:30 (superseded by the section above where they differ)
- Pilot aligned: corpus/pib/pilot-v2/sentences.jsonl, 232,948 pairs, 4,227 releases, 15 offices, 16 languages;
  release groups (every side with its PRID) in pilot-v2/<pass>/pairs.jsonl. Parser strips embedded posts
  (7,908) and contact details (<email>, <phone>); 8 pages with tweets pasted as plain paragraphs remain.
- Rebuild + realign from cache: corpus/pib/pilot-v2/rebuild.sh (~6 min). Embedding cache on the SSD:
  ~/.cache/pib-parallel/embeddings.sqlite (fp16 key; run pib-align with corpus/venv-rocm/bin/python).
- Benchmark (pib-bench.ts / score-pib.py): 11 languages, sarvam trails Google by 9-23 chrF; results in
  corpus/runs/pib-bench/. Google copies per office (pib-copies.ts): 2018 0-7%, 2025 up to 33% (Ahmedabad);
  tables in corpus/pib/y2018/copies.jsonl and pilot-v2/bench/copies.jsonl. Not yet in bench/README.
- Link survey 2017-2024: corpus/pib/links/summary.txt. All offices link translations from 2020; 2017-2019
  patchy (Bhubaneswar none until 2020); early links run regional -> English only.
- Next: package (dedupe exact pairs with an `occurrences` count; documents part with PRIDs; card with the
  copy and link tables), then the repo move as its own phase, then ask before creating anything public.
- No Claude attribution in commits, PRs, READMEs or cards (owner, 2026-10-04).

## Publishing the PIB pipeline (owner decisions 2026-10-04)
- Names: GitHub repo `micahchoo/pib-parallel` (code, MIT) and HF dataset `pib-parallel` (pilot data).
- Licence: PIB's own terms for the text (reproduction free with attribution and accuracy; no third-party
  material); CC BY 4.0 for our annotations (alignment, flags).
- Only the pilot is published; the full crawl is left for others to run with the pipeline.
- Timing: after the benchmark and the 2018 copy-rate check, both reported on the card.
- Before publishing: no Google Translate text (the `google_copy` flag only); strip phone numbers, emails
  and embedded third-party posts; move (not copy) pib.ts / pib-align.py into the new repo and point
  md-translator at it, as its own phase.

## Next
- Live: https://micahchoo.github.io/md-translator/ (deployed 2026-10-01, repo micahchoo/md-translator). Pages workflow deploys on push to main.

- Other tailnet devices: endpoint `https://micah-framework.tail7044c.ts.net:8443` (`tailscale serve --bg --https=8443 8086`, 2026-10-02). Plain `http://100.x:8086` is blocked by Firefox as mixed content (only localhost is exempt). Not :443 — nginx-proxy-manager holds 0.0.0.0:443, so Serve on 443 answers only over IPv6.

- Known gap: code-mixed output (English words inside Kannada/Hindi sentences) is not flagged.
- Parked: user glossary (first try made the model bold every glossary term).

## 2026-10-04 — both directions, eleven languages (uncommitted)
- English is a target. Each `Language` has `from`, its source line's label: `English` into Indian languages
  (the measured prompt, unchanged), `Original` into English, so sarvam-30b recognises the language itself.
  Preamble takes `{S}`; a saved copy of the old default is swapped for the new one on load.
- Checks: native digits count as 0-9 (`೨೦೨೦` = `2020`); new `script` flag — the on-target share is
  measured against every letter, so an answer in a third script (Assamese asked for Bodo) is caught.
- Screen (`bench/pairs.ts` translates, `uv run bench/score.py` scores: chrF, chrF++, GlotLID, pass rule),
  10 IN22-Gen rows each way + a Markdown probe. Admitted with no examples: Assamese, Bengali, Malayalam,
  Marathi, Nepali, Odia, Tamil, Telugu, Urdu (RTL: `dir` set from `Language.dir`).
  Out: Gujarati, Maithili, Punjabi (probe only — echo English headings without examples);
  Bodo, Dogri, Konkani, Manipuri, Santali, Sindhi (wrong language/script); Kashmiri, Sanskrit (chrF).
- Data in git-ignored `corpus/` (FLORES+ devtest, IN22-Gen, GlotLID; gated — `uvx --from huggingface_hub hf auth login`).
- Not yet seen in a browser: the picker with 12 languages, Urdu right to left.
- Fixed 2026-10-04: flag labels are "Not translated"/"Partly untranslated"; stopped-run status says "not translated yet".

## 2026-10-04 — contrastive sets: the checks measured (uncommitted)
- `bench/contrast.ts` (no model, 3 s): human IN22 pairs, one copy per mechanical corruption, through `check`.
  `bench/contrast-gt.ts`: English changed in one way, both versions through Google Translate (key in
  git-ignored `.env.local`; answers cached in `corpus/gt-cache.json`; budget refused before any call).
- Fixed from it: `partial` into English (0.2% → 93%); number marks (1,000 = 1000; Urdu ٬ ٫).
- Caught ~100%: echo, other script, lost markup, changed number. False alarms on untouched pairs 3–4%,
  mostly `numbers` where the translator chose differently (crore vs billion) or the reference has a typo.
- Gaps, each needing a decision:
  - same script, wrong language (Marathi for Hindi): 0%. Needs language ID; GlotLID is 1.6 GB.
  - negation dropped: ~5%. No rule sees meaning; only a model (QE, back-translation) could.
  - clause dropped 64–84%, text added 60–67%: `short`/`long` use one length ratio for every language.
    Next: a per-language expected ratio measured on IN22.
- Length checks now per language: `Language.length` (IN22 median chars per English char); into English
  the source's script picks it. `short` < 0.7, `long` > 1.4 of normal. Text added caught 60% → 90%,
  cut short ~97%; human false alarms unchanged (96.5% unflagged both ways).
- Decided 2026-10-04 (owner):
  - wrong language in the right script: a prompt line, kept only if the A/B bench shows no regression.
    RESULT: rejected. Old prompt already 20/20 right language in all 11 (nothing to fix); new line moved
    chrF by noise (mean from-English 48.2 → 47.8) and made Telugu return the whole Markdown probe in
    English (0 → 4 of 5). The gap stays open; next idea is the model's own likelihood (see below).
    (`corpus/runs/prompt-a` old preamble, `prompt-b` with "Each translation is written in {L}, not in
    another language that shares its script."; score each with `uv run bench/score.py <dir>`).
  - dropped negation (~5% caught) and dropped clause into English (~56%): accepted; no rule sees meaning.
- Phase 5 reader checklist: per language ~20 sampled blocks + every flagged block; look especially for
  meaning flipped by a lost "not", a clause left out, and a related language in the same script.
- GT-cache ideas (not started): (1) minimal-pair consistency — does sarvam's output change when the
  source's "not"/number changes; (2) negation markers per language learned from GT pair diffs → an
  in-app negation check; (3) sarvam as its own judge by likelihood (label Hindi vs Marathi; source with
  vs without "not") — first check one curl: can llama.cpp return the log-probability of given text;
  (4) GT outputs as fresh sources for into-English, original English as reference.

## Queue — patterns from other translators (2026-10-04), each with its cheapest test first
Order: cheapest test first; build only what its test supports. Seen in: Co-op Translator (Azure,
MIT), Anuvaad (EkStep, MIT), translation-agent (Andrew Ng), TranslateBooksWithLLMs.
1. Copied answers (Co-op duplicated-blocks). TEST: scan saved runs (`corpus/runs/pairs*`) for an
   answer equal to an example or context translation while sources differ — free, no model. Then a
   `copied` kind in `contrast.ts`. BUILD only if sarvam does it.
2. Owner's edits remembered and reused (Anuvaad translation memory). TEST, the part that matters:
   do worked examples rescue Gujarati/Maithili/Punjabi? Give each 5 IN22 human pairs as stand-in
   "edits", rerun `pairs.ts` on those 3 only (~3 min). If they pass, edits-as-examples is the way
   to grow a language. Exact reuse needs only a unit test.
3. Terms kept by masking, not by prompt (glossary, adapted). TEST: unit test in `segment.test.ts`,
   same as code and links. No model.
4. Notes for one language (Co-op `templates/language/mni.md`: "Meetei Mayek, NEVER Bengali
   script", with a right and a wrong example). TEST: Bodo and Dogri only, 5 rows, each with its
   note. Expand to Manipuri, Santali, Sindhi, Konkani only if one passes GlotLID.
5. Translate only changed blocks (Co-op freshness). TEST: unit test in `translate.test.ts`.
6. Next source paragraph shown as context (translation-agent marks the chunk inside the whole
   source). TEST: A/B on Hindi and Tamil, 10 rows; widen only on a gain. Risk: the model
   translates the extra paragraph too.
7. Self-critique on flagged blocks only (translation-agent reflect → improve). TEST: the blocks
   still flagged in saved runs (a handful), reflection prompt once each; count flags after.
8. Machine-translation note in the download (Co-op disclaimer). No test; owner decides the words.
Rejected: line markers and block counts (code rebuilds the document); LLM severity evaluator
(the likelihood judge is the cheaper version of it).

## 2026-10-04 — the model as its own judge (bench/judge.ts, bench/likelihood.ts)
- Likelihood of an answer under the app's prompt vs the same prompt with one thing swapped.
  Scoring walks tokens via /completion n_probs (grammar forcing rejected: it measured spelling).
  Server quirks handled: multi-byte letters held back (try 4 tokens), `--jinja` 500 on special
  tokens (try 1-3; else the comparison is skipped and counted).
- Same-script language (label swap, no examples): Hindi/Marathi/Nepali 1 of 45 false alarm, 90/90
  caught; Assamese/Bengali 2/30, 28/30. Urdu unmeasured (Kashmiri text unscoreable, 14 of 15).
- Lost "not" (source swap, GT pairs, all 11): 95% caught, 5% false alarm; works in Kannada/Tamil/
  Telugu where the word list failed.
- NEXT before building: rerun on sarvam's OWN answers (self-preference). Then decide cost: ~1 s per
  score; negation check only on blocks whose English has not/never/n't; language check perhaps on a
  few blocks per document, not all.

## 2026-10-04 — shipped (merged to main)
- Offered: Any language → English; English → Assamese, Hindi, Kannada, Malayalam, Marathi, Nepali, Tamil,
  Telugu. Withdrawn until they have examples: Urdu (copied/romanised short blocks), Bengali (7/30 short
  blocks in Assamese), Odia (5/30). Their settings live in bench/candidates.ts.
- New checks from bench/starts.ts: one-word echoes, short wrong-script blocks, no letters, the language's
  own name or a repeated earlier answer ("Not a translation"), never-used letters (`Language.foreign`).
  Stop also at the target's own label.
- Picker names each direction (`directionLabel`). MIT licence. README test + `.claude/rules/translator-readmes.md`.
- Rejected: Hindi examples lent to other languages (hurt Assamese, Marathi, Nepali).
- Seen in the browser, not catchable by rules: Telugu turned Tuesday into Wednesday (meaning; judge territory).
- Next: roadmap B (judge on sarvam's own answers), then examples for Urdu/Bengali/Odia/Gujarati/Maithili/Punjabi.
- C2 edit memory: built and live (store.ts Memory; reused blocks skip the model). C5 changed blocks only:
  built and live (edits set blocks aside in `previous`; carryOver by text). C3 kept terms: tried,
  rejected (Tamil got worse; sarvam keeps names unaided) — see bench/README.

## indickit in the translator — rig and plan (2026-10-07, session translator-3c)
Question: can indickit (../indickit, npm 0.4.2) give the translator a new feature? Rig: `bench/indickit.ts`
(no model; outputs in corpus/runs/indickit/; held-out reads logged in its reads.log). indickit@0.4.2 is a
devDependency only. Nothing committed.

1. **"Name changed" flag (phonetic): rejected on DEV.** IN22 even rows, 20 languages: catches 85% of planted
   name swaps, but false alarms on human pairs with names are 76.5% (title-case words), 57.9% with the
   shippable 21-word stop list, 30.4% with a 1 MB word list (cannot ship). Bar: 5–13% (other flags). On
   sarvam answers 51–79% flagged. In bench/README "Tried and rejected". `names test` (odd rows) and
   `names pib` (pib-parallel May 2021) are UNREAD; keep them for a retry. Retry only when all hold:
   phonetic rules 2026-10-07 are released (Singh, Howrah); the key folds English endings (Sepoys,
   Kauravas, Mahrattas); and a way exists to tell a person/place name from a title-case term in KB.
   Then: `names dev` until ≤10% alarms at ≥80% caught, then `names test` once, `names pib` once.
   Watch: linguistic-utilities jobs/phonetic/spikes/best_in_class/frontier.py (unified letter-pair scorer;
   open-text key recall 88.3%). It fixes matching, not name extraction. When it reaches indickit's
   TypeScript, add it to the rig as a matcher variant. The phonetic agent has these findings.
2. **normalize: measured, not adopted; the owner decides.** `bun bench/indickit.ts normalize`:
   - sarvam answers: 0–2% of blocks change. Edit-memory keys merged: at most 15 of 16,030 (Kannada PIB).
     So normalising the memory key or the changed-block test has no measured value. Recommend: no.
   - OCR output: ZWNJ in 50–100% of Tamil, Kannada, Telugu, Sanskrit blocks; old Malayalam chillu
     sequences in 100%. Invisible, but they reach the model, Copy and Download. Next test (needs :8086;
     translator-6d holds it until ~13:30): translate corpus/runs/ocr/synthetic-sauvola outputs raw and
     normalised, chrF against IN22. Adopt for OCR text only if it gains, or if the owner wants clean bytes.
   - Hazard: normalize writes Assamese ৰ as র in any language but `as`. The "letters never written" check
     catches Assamese-in-Bengali by ৰ. So normalize must run AFTER checks, never before.
3. **is_well_formed in place of pdf.ts#damage: blocked.** Job 17 in linguistic-utilities is "extend
   normalize, not ported". When the TS port ships, add a `wellformed` stage: pdf.ts#damage and
   is_well_formed against HarfBuzz labels on PDF words. Those labels are job 17's held-out data: ask the
   owner before reading them.
4. **Findings for indickit (not fixed here; out of lane):** keys('Delhi') = tlh, दिल्ली = tl (Latin "lh");
   October = oktpr, अक्टूबर = aktpr (initial o / a); English plural and -ian/-ic endings break keys; npm
   has 0.4.2 while indickit's README says install v0.4.3.
Coordination on 2026-10-07: translator-6d owns bench/pib-bench.ts, bench/candidates.ts, corpus/runs/pib-bench*
(mni.jsonl is a candidate, not offered; the rig skips it) and :8086 until ~13:30. translator-f3 publishes
../pib-parallel/data/regional/mni; corpus/pib/pilot-v2 is final but NOT held out (linguistic-utilities read it).
