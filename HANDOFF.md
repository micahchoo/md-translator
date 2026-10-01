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

## Next
- User reviews the app at `http://localhost:4173` (`npx vite preview`) or `npm run dev`. Nothing committed, nothing pushed.
- On approval: commit, create the GitHub repo, enable Pages (source: GitHub Actions), push.
- Known gap: code-mixed output (English words inside Kannada/Hindi sentences) is not flagged.
- Parked: user glossary (first try made the model bold every glossary term).
