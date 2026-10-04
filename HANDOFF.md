# HANDOFF — md-translator (2026-10-01)

Static app: paste/attach Markdown → code segments it → sarvam-30b (raw /v1/completions,
parallel-text prompt, thinking never starts) → streamed Hindi/Kannada → copyable Markdown.
Design record and measurements: `.brainstorm/sessions/0001-md-translator.md`.

## Done (54 tests pass, tsc clean; nothing committed, nothing pushed)
- Phase 1 `src/segment.ts` — segment / mask / unmask / assemble / splitPassage. Verified on 456 real files.
- Phase 2 `src/checks.ts`, `src/prompt.ts`, `src/languages.ts` — 8 flags; parallel prompt; 5 neutral examples per language.
- Phase 3 `src/llm.ts` (SSE client, `targetAddressSpace: 'local'` for private IPs only), `src/translate.ts` (greedy, then up to 3 sampled retries at T 0.6, keep lowest-weight attempt, only clean pairs become context).

- Phase 4 UI: `index.html`, `src/main.ts`, `src/settings.ts`, `src/style.css` (63 tests pass).
- Phase 5: `vite.config.ts` (base './'), `.github/workflows/pages.yml` (bun test + build + deploy). Verified in headless Chromium against :8086.

- Typography: lang attributes, Indic line height 1.85 / size 1.07em, ZWJ/ZWNJ guard tests.
- Aligned view (`src/blocks.ts`): Source / Blocks / Markdown views, per-block Retry and Edit, follow the running block, show only flagged. `src/store.ts` keeps documents in localStorage; a stopped run resumes.
- Indented code is disabled (pasted text is indented prose); text inside HTML blocks is translated, tags and code/pre/script/style/comments are not.

## Roadmap (2026-10-04) — the one list; details in the dated sections below
A. Ship what is done (nothing committed yet)
   1. Browser check by the owner: 12-language picker, Urdu right to left, into-English Blocks view, new flag labels.
   2. Commit; push `main` (deploys Pages and the README together).
B. The model as its own judge → into the app
   1. Self-preference test: the judge on sarvam's OWN answers (~20 min). Decides whether to build.
   2. Measure cost per block on real documents.
   3. Build: negation check on blocks whose English has not/never/n't; language check on a few blocks
      per document (hi, mr, ne, as, bn). Urdu waits for a scorer fix (Kashmiri text unscoreable).
C. Patterns from other translators — the Queue below, 1–8, cheapest test first.
D. GT cache, still unused: minimal-pair consistency (does sarvam's output change when the source's
   "not"/number does); GT outputs as fresh into-English sources.
E. More languages
   1. Gujarati, Maithili, Punjabi: examples (Queue 2).  2. Bodo, Dogri: language notes (Queue 4).
   3. Sanskrit: rescreen on a larger sample.  4. Sarvam-Translate (4B, all 22) retried with its own
      chat template, scored by the same bench.
F. Bench rigour
   1. Methods section in bench/README (how each damage is made, why labels are true, limits).
   2. Real-document test on the owner's own Markdown (flags, markup, GlotLID; no references).
   3. Inversion into English (Claude's translations as sources, English originals as references).
G. Native-reader audit per language — the gate before advertising a language.
H. Known gaps kept open: code-mixed English words inside a sentence (runs under 5 words); `numbers`
   false alarms where a translator converts units (crore vs billion).
I. Owner decisions pending: README opening line to mention the checks; a LICENSE (the repo has none).

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
