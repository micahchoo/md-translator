// Every IN22-Gen language as a target the app could offer. Shipped ones are
// read from LANGUAGES, so a re-screen measures what the app uses; the rest have
// no examples, so a pass is earned without any.
import { LANGUAGES, type Language } from '../src/languages'

const DEVANAGARI = /[ऀ-ॿ]/g

const lang = (code: string, name: string, script: RegExp): Language => ({ code, name, native: name, from: 'English', script, length: 1, examples: [] })

/** IN22 column → target language. */
export const CANDIDATES: Record<string, Language> = {
  asm_Beng: LANGUAGES.as,
  hin_Deva: LANGUAGES.hi,
  kan_Knda: LANGUAGES.kn,
  mal_Mlym: LANGUAGES.ml,
  mar_Deva: LANGUAGES.mr,
  npi_Deva: LANGUAGES.ne,
  tam_Taml: LANGUAGES.ta,
  tel_Telu: LANGUAGES.te,
  // Not shipped: see the screen in languages.ts. Withdrawn ones keep what was learned.
  ben_Beng: { ...lang('bn', 'Bengali', /[ঀ-৿]/g), native: 'বাংলা', length: 0.95, foreign: /[ৰৱ]/ },
  ory_Orya: { ...lang('or', 'Odia', /[଀-୿]/g), native: 'ଓଡ଼ିଆ', length: 1.09 },
  urd_Arab: { ...lang('ur', 'Urdu', /[؀-ۿ]/g), dir: 'rtl', length: 0.97 },
  brx_Deva: lang('brx', 'Bodo', DEVANAGARI),
  doi_Deva: lang('doi', 'Dogri', DEVANAGARI),
  gom_Deva: lang('gom', 'Konkani', DEVANAGARI),
  guj_Gujr: lang('gu', 'Gujarati', /[઀-૿]/g),
  kas_Arab: lang('ks', 'Kashmiri', /[؀-ۿ]/g),
  mai_Deva: lang('mai', 'Maithili', DEVANAGARI),
  mni_Mtei: lang('mni', 'Manipuri', /[ꯀ-꯿ꫠ-꫿]/g),
  pan_Guru: lang('pa', 'Punjabi', /[਀-੿]/g),
  san_Deva: lang('sa', 'Sanskrit', DEVANAGARI),
  sat_Olck: lang('sat', 'Santali', /[᱐-᱿]/g),
  snd_Deva: lang('sd', 'Sindhi', DEVANAGARI),
}
