import { isExcludedPage } from '@/utils/pageExclude'

/**
 * Extension build, isolated-world content script -- the counterpart to main.ts (userscript).
 * chrome.storage/chrome.runtime live only here (and in main-world.ts's tiny background-relay
 * cases), not in main-world.ts, which is why the Worker/Vue app/settings panel/everything lives
 * in this world, and only literal unsafeWindow touches move to main-world.ts (Phase 3).
 *
 * `bootstrap` (and everything it transitively imports, e.g. config.ts's module-load-time
 * GM_getValue call) MUST NOT be evaluated until warmCache() resolves -- a static top-level
 * `import` would defeat that ordering (imports are hoisted and evaluated before any of this
 * file's own code runs), so this uses dynamic import() instead.
 */
;(async () => {
    if (isExcludedPage()) return

    const { warmCache } = await import('@/shims/gmCompat')
    await warmCache()

    const { bootstrap } = await import('@/bootstrap')
    await bootstrap()

    const { registerMenuRelay } = await import('./isolatedMenuRelay')
    registerMenuRelay()
})()
