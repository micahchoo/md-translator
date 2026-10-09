# Indic Markdown Translator

Translates Markdown documents between English and twenty Indian languages, using a model that runs on your own computer. Headings, lists, bold text, links and code come back where they were.

**Open it:** https://micahchoo.github.io/md-translator/

## Languages

Assamese, Bengali, Bodo, Dogri, Gujarati, Hindi, Kannada, Kashmiri, Konkani, Maithili, Malayalam, Marathi, Nepali, Odia, Punjabi, Sanskrit, Sindhi, Tamil, Telugu and Urdu, into and out of English. Urdu and Kashmiri are written right to left; Sindhi in Devanagari.

To translate into English, choose English. You do not say what the source language is; the model recognises it.

Each language passed a test in both directions before it was added. Others were tested and left out. Both are in [bench/README.md](bench/README.md).

## What you need

A model server on your computer that answers OpenAI-style completion requests and accepts requests from a web page (CORS). llama.cpp, Ollama and vLLM can all do this. The translator was built and tested with **sarvam-30b**.

1. Start the server. The translator looks for it at `http://localhost:8086`.
2. Open the page, then **Settings**. Enter the endpoint and the model name, then press **Test connection**.

To use a server on another device, serve it over `https`, for example with `tailscale serve`. Browsers stop a secure page from calling plain `http` on any machine except your own.

A hosted model works too, if it answers the same completion requests and accepts requests from a web page. Enter its endpoint, model name and **API key** in **Settings**. The key is sent only to that endpoint, and is cleared when you change the address. It lasts until the tab closes, unless you tick **Remember the key on this device**; then your other pages at micahchoo.github.io could read it. Anyone using the browser can see it either way, so use a key with a spending limit. Sarvam's own API answers only chat requests, which the translator does not send yet.

## How to use it

1. Choose the direction, for example **English → Tamil** or **Any language → English**.
2. Paste Markdown, or attach `.md` files, images of text or PDFs. Each file opens as a tab.
3. Press **Translate**. **Blocks** shows each piece of the source beside its translation as it arrives.
4. Press **Retry** or **Edit** on any block you want to change. Your edits are remembered: the same block in a later document, in the same direction, comes back with your words and is never sent to the model. Anuvaad keeps a translation memory for the same reason.
5. **Copy** the result, or **Download** it as a `.md` file.

Your documents stay in this browser. If you stop a run, **Translate** continues from where it stopped. If you change the source after a run, only the new or changed blocks are sent to the model again; Co-op Translator works the same way. To translate everything afresh, press **Translate again** without changing the source.

## Reading images and PDFs

Text in an image can be the source: attach a PNG, JPEG or WebP, drop it on the page, or paste a screenshot into **Source**. Images can be read in Assamese, Bengali, Bodo, Dogri, Gujarati, Hindi, Kannada, Konkani, Maithili, Marathi, Nepali, Punjabi and Sindhi, and in English.

Translating into English, choose the image's language under **Read as**. Translating from English, the image is read as English. Tick **It also has English** for a page that mixes English in, such as a brochure: without it the English comes back as nonsense, and on a page in one language it reads that language a little worse. Both choices are remembered.

What was read appears in **Source**, with the picture beside it. Check it before you translate, because a misread word becomes a mistranslated one.

Reading runs in your browser with Tesseract. The first image in a language downloads its letters, 1 to 5 MB, once. A layout model first finds each block of text, and each is read on its own and put in reading order, so a brochure's columns and boxes come back apart; it downloads once, 5 MB. Print reads best. Text over a photo, white text on colour and handwriting read badly, and the rupee sign is often lost: an image read as English never returns ₹ at all, since its letters have none, and on one Kannada brochure four prices of five came back with ₹ read as 2. Check every price. Bodo, Dogri, Maithili and Sindhi are read with Hindi's letters and Konkani with Marathi's; Sindhi's ॻ ॼ ॾ ॿ come back as their nearest Hindi letters. Malayalam, Odia, Sanskrit, Tamil, Telugu, Urdu and Kashmiri are not offered, because they failed the test in [bench/README.md](bench/README.md). That test could not tell whether Assamese, Bengali, Gujarati, Hindi and Nepali read old printed books well enough, so checking the text matters most for them. The image is not kept after a reload; the text is.

A PDF is read page by page. A page whose text is sound is taken as it is, exactly. A scanned page, or one whose text is broken, is read like an image: legacy Hindi fonts such as Krutidev store Latin letters in place of Devanagari, and some design programs store Indic letters doubled or out of order. A PDF can be in any of the twenty languages. One that cannot be read from images, such as Tamil, keeps its text even when it looks broken, and the bar under **Read as** says how many pages to check.

## Reading aloud

Translations into Bengali, Bodo, Dogri, Gujarati, Hindi, Kannada, Konkani, Maithili, Malayalam, Marathi, Nepali, Odia, Punjabi, Sanskrit, Sindhi, Tamil, Telugu and Urdu, and into English, can be read aloud.

In **Blocks**, press **Play** on a translated block. The first Play in a language downloads its voice from Hugging Face, about 64 MB, and the button shows how much has arrived. After that it plays at once. The voice runs in your browser; your text and its sound go nowhere. Code, link addresses and formatting marks are not read.

| Voice | Languages |
| --- | --- |
| Its own, human-sounding | Bengali, English, Hindi, Kannada, Malayalam, Marathi, Nepali, Telugu, Urdu |
| Hindi's, with Hindi pronunciation | Bodo, Dogri, Konkani, Maithili, Sanskrit, Sindhi |
| Mechanical (espeak-ng) | Gujarati, Odia, Punjabi, Tamil |

The middle row's blocks say "Hindi pronunciation": a reader of the language will hear an accent, and Dogri and Bodo lose their tones. Assamese and Kashmiri have no Play button, because espeak-ng reads Assamese wrongly and has no rules for Kashmiri. Nobody who reads these languages has checked the voices yet.

## Downloads and memory

Voices and the letters for reading images stay in your browser after the first download. **Remove downloaded models** in the top bar (**Free space** on a phone) shows how much they take, and removes them; each downloads again when next needed. A minute after the last image or voice, the page also lets go of the models in memory, which matters on a phone: in testing, one page read and one voice held about 940 MB until then, and about 260 MB after.

## Latin letters

For a reader who speaks the language but does not read its script, tick **Latin letters** in **Blocks**: each translation gets a line under it, such as "bharat ke pradhaanmantri" under भारत के प्रधानमंत्री. It works for all twenty languages. The first tick in a language downloads its tables from jsDelivr, 0.2–1.8 MB; your text goes nowhere. The spelling is one common way of writing each word, not a standard: on Wikipedia sentences in 11 of the languages, romanized by native speakers, the line's spelling is theirs for about half the words (61% in Hindi, 29% in Sindhi); the other nine were not measured. The line is only for reading. Copy and Download give the translation alone.

## Typed in Latin letters

Many people type an Indian language in Latin letters: "kal meeting hai". The model gives such text back unchanged about half the time, so tick **Typed in Latin letters** above the source box and choose the language: each block is written in the language's script before the model reads it, and **Blocks** shows the written form with your typing under it. It works for every language but Sindhi, whose tables are in another script. The first run in a language downloads its tables from jsDelivr, 0.3–3.1 MB; your text goes nowhere. English words inside the text are written in the script too ("meeting" becomes मीटिंग), as the language itself writes them; a name that must stay in English goes in code, as `Obsidian`. Code, link addresses and numbers stay as typed. Measured on sentences typed by native speakers, the writing restores about nine words in ten; the translation then comes within a few points of one from the script itself in ten languages, and further behind in Odia, Dogri and Kashmiri (see `bench/README.md`, "Text typed in Latin letters").

## What stays unchanged

Code, link addresses, numbers, emphasis marks, and the front matter keys named in Settings (`notion-id, base, tags, aliases, cssclasses` by default).

Names are usually kept as they are, but an interface label in bold may be translated: "Run **Draw a question**" came back with the command's name in Hindi. If a name must stay in English, write it as code in your source: `Draw a question`.

## Warning flags

Simple rules check every translated piece. When a rule fires, the translator tries the piece again, up to three times. If the best attempt still breaks a rule, the block shows a flag.

| Flag | What happened |
| --- | --- |
| Not translated | The answer is still in the source language. |
| Wrong script or letters | The answer is in another script, or uses letters this language never writes, as Sindhi ॾ in Nepali. |
| Not a translation | The answer is the language's own name, or repeats an earlier block's answer for a different source. |
| Meaning may be reversed | The English says "not", and the model itself finds its answer fits the sentence without "not" better. |
| Another language | The model itself finds its answer fits a related language better: Marathi for Hindi, Assamese for Bengali. Checked on a document's first few blocks. |
| Partly untranslated | Part of the answer is still in the source language. |
| Numbers changed | A number is different, missing or new. |
| Formatting changed | Bold, italics, code or a link was lost or added. |
| May be missing text | The answer is much shorter than this language normally is. |
| May have added text | The answer is much longer than this language normally is. |
| Cut off | The answer stops at "…" and the source does not. |
| Odd form | The answer's form is not its source's: a comma after most words, a phrase repeated back to back, or English in capitals throughout. A flagged answer is never shown to the model as context, so one odd answer cannot spread to the blocks after it. |
| Nothing came back | The model returned no text. |

## What it cannot check

The rules see letters, numbers, length and formatting, not meaning. If you turn it on in Settings, a llama.cpp server's model also checks its own answers for a lost "not" and for a related language, and in testing caught 95% of each. Other meaning errors pass unflagged: a Telugu answer turned Tuesday into Wednesday.

Before you rely on a translation, have someone who reads the language check it.

## Settings

| Setting | What it does |
| --- | --- |
| API key | For a hosted model; see [What you need](#what-you-need). Never saved with the other settings. |
| Passage length | The longest piece sent in one request. Longer paragraphs are split at sentences. |
| Context blocks | How many earlier translated pieces the model sees, so it uses the same words for the same terms. |
| Retries | Attempts after a flagged answer. |
| System prompt | The opening instruction. `{L}` becomes the target language, `{S}` the source label. |
| Model checks its own answers | Off by default, and for llama.cpp servers only. The model scores each answer whose English says "not" against the sentence without it, and a document's first blocks against related languages. It caught 95% of lost negations in testing, and makes a run about three times slower. |
| Note in downloads | On by default. A downloaded file ends with one line naming the model, the date, and how many blocks were flagged. Copy never adds it. |
| Examples | Worked pairs shown to the model, five per language. Hindi's and Kannada's were written first; Bodo's, Sindhi's and Kashmiri's are human translations from IN22-Gen; the rest were written by Claude and checked against Google Translate both ways. English has none. |

## Development

```sh
bun install
bun test          # the checks, prompt, segmenting, settings and reading aloud
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

The model is sarvam-30b by Sarvam AI. The language tests use IN22-Gen by AI4Bharat (CC BY 4.0), whose human translations also give Bodo, Sindhi and Kashmiri their examples, and GlotLID.

Reading images uses [Tesseract](https://github.com/tesseract-ocr/tesseract) and its [tessdata_fast](https://github.com/tesseract-ocr/tessdata_fast) models, run by [Tesseract.js](https://github.com/naptha/tesseract.js), all under the Apache 2.0 licence. They load only when you first attach an image. PDFs are read by [pdf.js](https://github.com/mozilla/pdf.js) (Apache 2.0), which loads with the first PDF. The layout model is [PP-DocLayout-S](https://huggingface.co/PaddlePaddle/PP-DocLayout-S) by PaddlePaddle (Apache 2.0), converted to ONNX and served with this page; `public/models/NOTICE.txt` says how.

Latin letters come from [indickit](https://github.com/micahchoo/indickit)'s `romanize` (MIT), which loads with the first tick.

Reading aloud uses [espeak-ng](https://github.com/espeak-ng/espeak-ng), compiled to WebAssembly by [espeak-ng.js](https://github.com/ianmarmour/espeak-ng.js), under the GPL 3.0 or later, and [Piper](https://github.com/rhasspy/piper) voices from [piper-voices](https://huggingface.co/rhasspy/piper-voices) and, for Kannada, [piper-kn](https://huggingface.co/micahchoo/piper-kn), trained for this page, run by [ONNX Runtime](https://onnxruntime.ai/) (MIT). They load only when you first press Play. Each voice is under the licence of the recordings it learned from:

| Voice | Licence |
| --- | --- |
| Hindi (rohan), Malayalam (arjun) | [Indic TTS](https://www.iitm.ac.in/donlab/indictts/), IIT Madras |
| Telugu (padmavathi) | CC BY 4.0 |
| Bengali, Marathi (google) | CC BY-SA 4.0 |
| Kannada (SYSPIN male) | [SYSPIN](https://syspin.iisc.ac.in/datasets), IISc, CC BY 4.0; fine-tuned from lessac, whose recordings are under a [research licence](https://www.cstr.ed.ac.uk/projects/blizzard/2013/lessac_blizzard2013/license.html), so non-commercial use only |
| Nepali (chitwan) | CC0 |
| Urdu (fasih) | MIT |
| English (LJSpeech) | Public domain |

The code is under the [MIT licence](LICENSE).
