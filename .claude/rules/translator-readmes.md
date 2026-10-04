---
scope: "**"
tags: [translator, docs, bench]
priority: medium
source: hand-written
---

# translator: the two READMEs follow the code and the bench

`README.md` is for someone choosing the translator; `bench/README.md` is for
someone checking or rerunning its tests. Both repeat facts the code holds, and
both go stale silently.

## What a test already enforces

`test/readme.test.ts` fails when the README's language list differs from
`languages.ts#LANGUAGES`, when its flag table differs from `blocks.ts#FLAG_TEXT`,
when the bench README's "Passed" row differs from the offered languages, or
when a file in `bench/` goes unmentioned. Fix the README, not the test. If a
fact of that kind is added to a README, add its test too.

## What only you can check

- **A bench rerun changes numbers.** After `pairs.ts`, `score.py`, `contrast.ts`,
  `contrast-gt.ts`, `negation.ts` or `judge.ts` produce new results, update every
  figure the bench README quotes from them, in the same change.
- **Never describe a result before it exists.** A test still running goes under
  "Being measured", with what it measures and no outcome. Move it to the results
  or to "Tried and rejected" when it finishes; a rejected idea stays, with its
  numbers, so nobody tries it blind.
- **The README goes live with the push.** Pushing `main` deploys the page and
  GitHub shows the README at once. Describe a language, flag or setting only in
  the push that ships it.
- **Credit a borrowed pattern only once it is built** (the queue in HANDOFF.md
  lists patterns from Co-op Translator, Anuvaad and translation-agent).
- **No claim the evidence does not hold**: "only", "first" and "unique" were
  never surveyed.

## Never in the repository

FLORES+ text in any form, including run outputs that contain its sentences
(its gate forbids re-hosting where crawlers reach). Google Translate output.
IN22-Gen only as a credited sentence or two. All of it lives in the
git-ignored `corpus/`.

Verify with `bun test`.
