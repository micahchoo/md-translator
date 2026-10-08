// What the page downloads into the browser to read images and to speak: the
// voices (about 64 MB each) and Tesseract's language data. One button in the
// top bar shows their size and removes them all, with the models in memory.
import { models } from './onnx'
import { releaseReaders, removeLanguages, storedLanguages } from './ocr'
import { removeVoices, storedVoices } from './speech'

/** The bytes the page keeps in this browser; 0 where storage is not open to it. */
export async function downloadedBytes(): Promise<number> {
  const [voices, languages] = await Promise.all([
    storedVoices().then((v) => v.bytes, () => 0),
    storedLanguages().catch(() => 0),
  ])
  return voices + languages
}

/** Removes every download and ends the models in memory; each downloads again when next needed. */
export async function removeDownloads(): Promise<void> {
  models.release()
  releaseReaders()
  await Promise.allSettled([removeVoices(), removeLanguages()])
}
