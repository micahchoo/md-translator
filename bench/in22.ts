// IN22-Gen, read once from its parquet file and kept as JSON beside it. Every
// row holds the same sentence in English and all 22 languages, each a human
// translation, so any two columns of a row are a parallel pair.
import { $ } from 'bun'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const PARQUET = 'corpus/in22-gen/data/train-00000-of-00001.parquet'
const JSON_CACHE = 'corpus/in22-gen/rows.json'

export type Row = Record<string, string>

export async function in22Rows(): Promise<Row[]> {
  if (!existsSync(JSON_CACHE)) {
    const json = await $`uvx --quiet --with pyarrow python -c ${`
import json, pyarrow.parquet as pq
print(json.dumps(pq.read_table('${PARQUET}').to_pylist()))`}`.text()
    writeFileSync(JSON_CACHE, json)
  }
  return JSON.parse(readFileSync(JSON_CACHE, 'utf8')) as Row[]
}

/** `n` rows taken evenly through the set, which is grouped by domain. */
export function spread<T>(rows: T[], n: number): T[] {
  const step = Math.max(1, Math.floor(rows.length / n))
  return rows.filter((_, i) => i % step === 0).slice(0, n)
}
