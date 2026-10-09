import { expect, test } from 'bun:test'
import { detect, looksTyped, mostlyLatin, prose, type Model } from '../src/detect'
import model from '../src/typed-detect.json'

const m = model as Model

test('a paragraph typed in Hindi is taken for Hindi, and one in Kannada for Kannada', () => {
  expect(looksTyped(m, 'Kal subah 10 baje meeting hai. Agenda mein teen bugs dekhna hai, aur report likhni hai. Sab log time par aana.')).toBe('hi')
  expect(looksTyped(m, 'Naale beligge hattu gantege meeting ide. Ellaru samayakke barabeku. Report bareyabeku mattu bugs nodabeku.')).toBe('kn')
})

test('English, text in a script, and a short line are not typed Indian text', () => {
  expect(looksTyped(m, 'The meeting is at 10 tomorrow morning. The agenda has three bugs to look at and a report to write.')).toBe(null)
  expect(detect(m, 'कल सुबह 10 बजे मीटिंग है। एजेंडा में तीन बग देखने हैं।')).toBe(null)
  expect(detect(m, 'kal milte hain')).toBe(null)
})

test('mostlyLatin is the gate: typed text passes, a script and a short line do not', () => {
  expect(mostlyLatin('Kal subah 10 baje meeting hai. Agenda mein teen bugs dekhna hai.')).toBe(true)
  expect(mostlyLatin('कल सुबह 10 बजे मीटिंग है। एजेंडा में तीन बग देखने हैं।')).toBe(false)
  expect(mostlyLatin('kal milte hain')).toBe(false)
})

test('code, addresses and front matter do not count', () => {
  expect(prose('---\ntags: [a]\n---\nkal `npm install` chalana https://example.com par')).toBe('kal   chalana   par')
})
