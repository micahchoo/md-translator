// Every IN22-Gen language as a target the app could offer. Shipped ones are
// read from LANGUAGES, so a re-screen measures what the app uses; the rest have
// no examples, so a pass is earned without any.
import { LANGUAGES, type Language } from '../src/languages'
import { STAGED } from './examples'

const DEVANAGARI = /[ऀ-ॿ]/g

const lang = (code: string, name: string, script: RegExp): Language => ({ code, name, native: name, from: 'English', script, length: 1, examples: [] })

/** IN22 column → target language. */
export const CANDIDATES: Record<string, Language> = {
  asm_Beng: LANGUAGES.as,
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
  brx_Deva: lang('brx', 'Bodo', DEVANAGARI),
  doi_Deva: { ...lang('doi', 'Dogri', DEVANAGARI), native: 'डोगरी', length: 0.99, foreign: /[ॻॼॾॿ]/, examples: STAGED.doi },
  gom_Deva: { ...lang('gom', 'Konkani', DEVANAGARI), native: 'कोंकणी', length: 0.95, foreign: /[ॻॼॾॿ]/, examples: STAGED.gom },
  kas_Arab: lang('ks', 'Kashmiri', /[؀-ۿ]/g),
  mni_Mtei: lang('mni', 'Manipuri', /[ꯀ-꯿ꫠ-꫿]/g),
  san_Deva: { ...lang('sa', 'Sanskrit', DEVANAGARI), native: 'संस्कृतम्', length: 0.98, foreign: /[ॻॼॾॿ]/, examples: STAGED.sa },
  sat_Olck: lang('sat', 'Santali', /[᱐-᱿]/g),
  snd_Deva: lang('sd', 'Sindhi', DEVANAGARI),
}
