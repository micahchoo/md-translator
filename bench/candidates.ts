// Every IN22-Gen language as a target the app could offer. Shipped ones are
// read from LANGUAGES, so a re-screen measures what the app uses; the rest have
// no examples, so a pass is earned without any.
import { LANGUAGES, type Language } from '../src/languages'

const DEVANAGARI = /[ऀ-ॿ]/g

const lang = (code: string, name: string, script: RegExp): Language => ({ code, name, native: name, from: 'English', script, length: 1, examples: [] })

/** IN22 column → target language. */
export const CANDIDATES: Record<string, Language> = {
  asm_Beng: LANGUAGES.as,
  brx_Deva: LANGUAGES.brx,
  kas_Arab: LANGUAGES.ks,
  snd_Deva: LANGUAGES.sd,
  doi_Deva: LANGUAGES.doi,
  gom_Deva: LANGUAGES.gom,
  san_Deva: LANGUAGES.sa,
  ben_Beng: LANGUAGES.bn,
  guj_Gujr: LANGUAGES.gu,
  mai_Deva: LANGUAGES.mai,
  ory_Orya: LANGUAGES.or,
  pan_Guru: LANGUAGES.pa,
  urd_Arab: LANGUAGES.ur,
  hin_Deva: LANGUAGES.hi,
  kan_Knda: LANGUAGES.kn,
  mal_Mlym: LANGUAGES.ml,
  mar_Deva: LANGUAGES.mr,
  npi_Deva: LANGUAGES.ne,
  tam_Taml: LANGUAGES.ta,
  tel_Telu: LANGUAGES.te,
  // Not shipped: see the screen in languages.ts.
  mni_Mtei: { ...lang('mni', 'Manipuri', /[ꯀ-꯿ꫠ-꫿]/g), native: 'ꯃꯩꯇꯩꯂꯣꯟ', length: 0.95 },
  sat_Olck: { ...lang('sat', 'Santali', /[᱐-᱿]/g), native: 'ᱥᱟᱱᱛᱟᱲᱤ', length: 1.05 },
}

/** PIB code → target language, for bench/pib-bench.ts. PIB Imphal writes Manipuri in
 *  Bengali script, not IN22's Meetei Mayek, so its examples are five PIB rows from
 *  August 2023, a month the test never samples. Length: PIB's median, 1.0. */
export const PIB_CANDIDATES: Record<string, Language> = {
  mni: {
    ...lang('mni', 'Manipuri', /[ঀ-৿]/g),
    native: 'মৈতৈলোন',
    examples: [
      ['We will give them another chance in 2028.', 'ঐখোয়না মখোয়বু 2028 দা অতোপ্পা খুদোংচাবা অমগা পীরগনি।'],
      ['After all, how did India become the 5th largest economy in the world?', 'পুম্নমক অসিগী মতুংদা ভারতনা মালেমগী 5শুবা খ্বাইদগী চাউবা ইকনোমী করম্না ওইরকখি?'],
      ['**Several steps have been taken by the Government to promote renewable energy, including solar energy, in the country.**', '**সোলর ইনর্জী য়াওনা রিন্যুএবল ইনর্জী প্রমোৎ তৌনবা সরকারনা খোঙথাং কয়ামরুম পাইখৎখি।**'],
      ['[Therefore, today Mr. Prime Minister and I have decided to take the India-Greece partnership to a "strategic" level.](#1) `npm install`', '[মরম অসিনা, ঙসিদি প্রধান মন্ত্রী অমসুং ঐহাক্না ভারত-গ্রীসকী মরী অসি "স্ত্রেতেজিক ওইবা" থাক্তা পুখৎনবা ৱারেপ্নরে।](#1) `npm install`'],
      ['The project is expected to begin by the end of this year and likely to be completed by 2028-29.', 'প্রোজেক্ত অসি হন্দক্কী চহি লোইরকপদা হৌগনি হায়বগী থাজবা লৈরি অমসুং ইং 2028-29 ফাওবদা লোইশিনবা য়ানা লৈরি।'],
    ],
  },
}
