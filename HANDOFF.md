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

## Next
- Live: https://micahchoo.github.io/md-translator/ (deployed 2026-10-01, repo micahchoo/md-translator). Pages workflow deploys on push to main.

- Known gap: code-mixed output (English words inside Kannada/Hindi sentences) is not flagged.
- Parked: user glossary (first try made the model bold every glossary term).
