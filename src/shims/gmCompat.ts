/**
 * chrome.storage.local-backed replacement for vite-plugin-monkey's GM_* storage API, aliased to
 * '$' in vite.config.extension.ts (the extension build only -- the userscript build still gets
 * the real thing from vite-plugin-monkey).
 *
 * Synchronous like the real GM_getValue/GM_setValue -- callers never await these, so `warmCache`
 * must resolve BEFORE anything imports a module that calls them. src/entries/isolated.ts
 * dynamic-imports bootstrap() only after awaiting warmCache() for exactly this reason (a static
 * top-level `import` would defeat it -- see e.g. src/config.ts's module-load-time GM_getValue
 * call). `assertWarm` throws rather than silently returning defaults if that sequencing is ever
 * violated, since a silent wrong-default is much harder to debug than a loud one.
 *
 * `unsafeWindow` and `GM_registerMenuCommand` are deliberately NOT exported here: any isolated-
 * world file that still imports one of those after the MAIN-world split fails the extension build
 * with an import error instead of silently misbehaving at runtime -- a free regression check that
 * the split is complete. `GM_xmlhttpRequest` *is* stubbed (throws if actually called) purely to
 * unblock the build for clickbaitScorer.ts's already-understood, never-called-in-production
 * `gmTransport` dev path -- it isn't part of what the import-error check is meant to catch.
 */

export type GmValueListenerId = number

type ChangeListener = (name: string, oldValue: unknown, newValue: unknown) => void

let cache: Record<string, unknown> = {}
let warmed = false
const listeners = new Map<GmValueListenerId, { key: string; fn: ChangeListener }>()
let nextListenerId = 1

export async function warmCache(): Promise<void> {
    cache = await chrome.storage.local.get(null)
    warmed = true
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local') return
        for (const [key, change] of Object.entries(changes)) {
            if ('newValue' in change) {
                cache[key] = change.newValue
            } else {
                delete cache[key]
            }
            for (const { key: listenerKey, fn } of listeners.values()) {
                if (listenerKey === key) fn(key, change.oldValue, change.newValue)
            }
        }
    })
}

function assertWarm(): void {
    if (!warmed) {
        throw new Error('gmCompat: GM_* called before warmCache() resolved -- sequencing bug')
    }
}

export function GM_getValue<T>(key: string, defaultValue?: T): T {
    assertWarm()
    return key in cache ? (cache[key] as T) : (defaultValue as T)
}

export function GM_setValue(key: string, value: unknown): void {
    assertWarm()
    cache[key] = value
    void chrome.storage.local.set({ [key]: value })
}

export function GM_deleteValue(key: string): void {
    assertWarm()
    delete cache[key]
    void chrome.storage.local.remove(key)
}

export function GM_listValues(): string[] {
    assertWarm()
    return Object.keys(cache)
}

export function GM_addValueChangeListener(key: string, fn: ChangeListener): GmValueListenerId {
    const id = nextListenerId++
    listeners.set(id, { key, fn })
    return id
}

export function GM_removeValueChangeListener(id: GmValueListenerId): void {
    listeners.delete(id)
}

export function GM_xmlhttpRequest(): never {
    throw new Error('GM_xmlhttpRequest is not available in the extension build (dev-only transport)')
}
