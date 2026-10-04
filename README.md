# Markdown Translator

Translates Markdown documents between English and eight Indian languages, using a model that runs on your own computer. Headings, lists, bold text, links and code come back where they were.

**Open it:** https://micahchoo.github.io/md-translator/

## Languages

Assamese, Hindi, Kannada, Malayalam, Marathi, Nepali, Tamil and Telugu, into and out of English.

To translate into English, choose English. You do not say what the source language is; the model recognises it.

Each language passed a test in both directions before it was added. Others were tested and left out. Both are in [bench/README.md](bench/README.md).

## What you need

A model server on your computer that answers OpenAI-style completion requests and accepts requests from a web page (CORS). llama.cpp, Ollama and vLLM can all do this. The translator was built and tested with **sarvam-30b**.

1. Start the server. The translator looks for it at `http://localhost:8086`.
2. Open the page, then **Settings**. Enter the endpoint and the model name, then press **Test connection**.

To use a server on another device, serve it over `https`, for example with `tailscale serve`. Browsers stop a secure page from calling plain `http` on any machine except your own.

## How to use it

1. Choose the direction, for example **English → Tamil** or **Any language → English**.
2. Paste Markdown, or attach `.md` files. Each file opens as a tab.
3. Press **Translate**. **Blocks** shows each piece of the source beside its translation as it arrives.
4. Press **Retry** or **Edit** on any block you want to change. Your edits are remembered: the same block in a later document, in the same direction, comes back with your words and is never sent to the model. Anuvaad keeps a translation memory for the same reason.
5. **Copy** the result, or **Download** it as a `.md` file.

Your documents stay in this browser. If you stop a run, **Translate** continues from where it stopped. If you change the source after a run, only the new or changed blocks are sent to the model again; Co-op Translator works the same way. To translate everything afresh, press **Translate again** without changing the source.

## What stays unchanged

Code, link addresses, numbers, emphasis marks, and the front matter keys named in Settings (`notion-id, base, tags, aliases, cssclasses` by default).

## Warning flags

Simple rules check every translated piece. When a rule fires, the translator tries the piece again, up to three times. If the best attempt still breaks a rule, the block shows a flag.

| Flag | What happened |
| --- | --- |
| Not translated | The answer is still in the source language. |
| Wrong script or letters | The answer is in another script, or uses letters this language never writes, as Sindhi ॾ in Nepali. |
| Not a translation | The answer is the language's own name, or repeats an earlier block's answer for a different source. |
| Partly untranslated | Part of the answer is still in the source language. |
| Numbers changed | A number is different, missing or new. |
| Formatting changed | Bold, italics, code or a link was lost or added. |
| May be missing text | The answer is much shorter than this language normally is. |
| May have added text | The answer is much longer than this language normally is. |
| Cut off | The answer stops at "…" and the source does not. |
| Nothing came back | The model returned no text. |

## What it cannot check

The rules see letters, numbers, length and formatting. They do not see meaning. In our tests:

- A lost "not", which reverses a sentence, was flagged about 1 time in 20.
- A related language in the same script, such as Marathi where Hindi was asked for, was never flagged.

Before you rely on a translation, have someone who reads the language check it.

## Settings

| Setting | What it does |
| --- | --- |
| Passage length | The longest piece sent in one request. Longer paragraphs are split at sentences. |
| Context blocks | How many earlier translated pieces the model sees, so it uses the same words for the same terms. |
| Retries | Attempts after a flagged answer. |
| System prompt | The opening instruction. `{L}` becomes the target language, `{S}` the source label. |
| Examples | Worked pairs shown to the model. Hindi and Kannada have five; the rest have none. |

## Development

```sh
bun install
bun test          # the checks, prompt, segmenting and settings
bun run dev       # local page
bun run build     # type check and production build
```

Pushing `main` publishes the page to GitHub Pages.

## Similar projects

- [Co-op Translator](https://github.com/Azure/co-op-translator) (Microsoft) translates the Markdown in a GitHub repository with cloud models, and keeps the translations in step with the source.
- [Anuvaad](https://github.com/project-anuvaad/anuvaad) is a server platform that translates legal documents into Indian languages, with human review. India's Supreme Court runs it.
- [Sarvam-Translate](https://huggingface.co/sarvamai/sarvam-translate) is an open model for long documents in all 22 Indian languages. It is a model, not a tool: it does not check its own output.

This translator is one web page and your own model server. Your documents stay on your machine, every block is checked and flagged where it fails, and every language on the list passed a test you can read and rerun.

## Credits

The model is sarvam-30b by Sarvam AI. The language tests use IN22-Gen by AI4Bharat, and GlotLID.

The code is under the [MIT licence](LICENSE).
