// The API key of a hosted model (Sarvam, OpenRouter, …), kept apart from the
// settings so it is never in a saved document, a download or the settings' JSON.
//
// The page is served at micahchoo.github.io beside the owner's other sites, and
// every page at that address can read its localStorage. So the key lives in
// sessionStorage by default, which no other tab can read; it is put in
// localStorage only when the reader ticks "Remember". Either way it is given only
// to the address (scheme, host and port) it was entered for.

const KEY = 'md-translator.key'

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
/** `tab` is sessionStorage, `device` localStorage. */
export interface KeyStores {
  tab: Store
  device: Store
}

/** The address a key belongs to: scheme, host and port; '' for no URL. */
export const originOf = (endpoint: string) => {
  try {
    return new URL(endpoint).origin
  } catch {
    return ''
  }
}

function read(store: Store, origin: string): string {
  try {
    const saved = JSON.parse(store.getItem(KEY) ?? 'null')
    return saved?.origin === origin && typeof saved.key === 'string' ? saved.key : ''
  } catch {
    return ''
  }
}

const quietly = (f: () => void) => {
  try {
    f()
  } catch {
    // Blocked storage: the key lasts as long as the form does.
  }
}

/** The key for `endpoint`'s address, and whether it is remembered on this device. */
export function loadKey(stores: KeyStores, endpoint: string): { key: string; remembered: boolean } {
  const origin = originOf(endpoint)
  if (!origin) return { key: '', remembered: false }
  const device = read(stores.device, origin)
  return { key: read(stores.tab, origin) || device, remembered: !!device }
}

/** Keeps `key` for `endpoint`'s address in this tab, and on the device when `remember`; an empty key removes it. */
export function saveKey(stores: KeyStores, endpoint: string, key: string, remember: boolean): void {
  const origin = originOf(endpoint)
  const value = JSON.stringify({ origin, key })
  for (const [store, keep] of [[stores.tab, true], [stores.device, remember]] as const)
    quietly(() => (key && origin && keep ? store.setItem(KEY, value) : store.removeItem(KEY)))
}
