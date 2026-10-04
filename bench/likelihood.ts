// The bench's handle on the app's scorer (src/judge.ts#createScorer), against
// the endpoint in $ENDPOINT. One scorer for both, so what the bench measured is
// what the app runs.
import { createScorer } from '../src/judge'

const scorer = createScorer(process.env.ENDPOINT ?? 'http://localhost:8086')

export async function score(prefix: string, text: string): Promise<{ sum: number }> {
  return { sum: await scorer(prefix, text) }
}
