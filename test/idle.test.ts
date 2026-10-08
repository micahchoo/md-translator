import { expect, test } from 'bun:test'
import { idleRelease } from '../src/idle'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

test('releases once no job has run for the idle time, never while one runs', async () => {
  let released = 0
  const idle = idleRelease(30, () => released++)
  const long = idle.run(() => wait(60))
  await wait(45)
  expect(released).toBe(0)
  await long
  await wait(15)
  expect(released).toBe(0)
  await wait(30)
  expect(released).toBe(1)
})

test('a new job before the idle time ends starts the wait again', async () => {
  let released = 0
  const idle = idleRelease(30, () => released++)
  await idle.run(async () => {})
  await wait(20)
  await idle.run(async () => {})
  await wait(20)
  expect(released).toBe(0)
  await wait(20)
  expect(released).toBe(1)
})

test('a failed job still counts as finished, and its error comes back', async () => {
  let released = 0
  const idle = idleRelease(10, () => released++)
  await expect(idle.run(async () => { throw new Error('no') })).rejects.toThrow('no')
  await wait(25)
  expect(released).toBe(1)
})
