---
scope: "src/**"
tags: [translator, server, judge]
priority: high
source: hand-written
---

# translator: every request to the model server goes through `llm.ts#serverFetch`

`src/llm.ts#serverFetch` is the one place that knows how a request reaches the
model server: the base URL with a trailing `/v1` accepted, the API key as a
bearer token, and the `targetAddressSpace: 'local'` declaration Chrome needs
for a private address. `createClient`, `listModels` and the judge
(`src/judge.ts#createScorer`, `probe`) all call it with a `Server`
(`{ endpoint, apiKey }`).

Never build a fetch to the endpoint anywhere else. Before this seam the judge
built its own and sent no key, so on a hosted llama.cpp with `--api-key` the
probe failed quietly and the judge never ran. `test/judge.test.ts` checks that
the scorer and the probe carry the key; keep that test when adding a route.
