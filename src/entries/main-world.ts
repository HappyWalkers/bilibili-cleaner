import { isExcludedPage } from '@/utils/pageExclude'
import { handleFetchAction } from './mainWorld/fetchHook'
import { handleLiveBasicAction } from './mainWorld/liveBasic'
import { handlePlayerLayoutBangumiAction } from './mainWorld/playerLayoutBangumi'
import { handlePlayerLayoutVideoAction } from './mainWorld/playerLayoutVideo'
import { handleRelatedVideoFilterAction } from './mainWorld/relatedVideoFilter'
import { handleUrlAction } from './mainWorld/urlHandler'

/**
 * Extension build, MAIN-world content script -- runs in the page's real JS context (this IS
 * `unsafeWindow`'s job in Tampermonkey terms), with no chrome.storage/chrome.runtime access.
 * Built as a standalone IIFE (see vite.config.extension.ts's contentScripts.standaloneFiles).
 *
 * Listens for the CustomEvent bridge (src/bridge/toMain.ts, dispatched by the isolated-world
 * script) and routes each named action to whichever mainWorld/*.ts module owns it. Registered as
 * the very first thing this script does, to minimize (not eliminate -- see toMain.ts's retry
 * comment) the isolated-vs-MAIN injection-order race.
 */
const handlers = [
    handleUrlAction,
    handleFetchAction,
    handlePlayerLayoutVideoAction,
    handlePlayerLayoutBangumiAction,
    handleLiveBasicAction,
    handleRelatedVideoFilterAction,
]

document.addEventListener('bcf:main', ((ev: CustomEvent<{ action: string; payload?: unknown }>) => {
    if (isExcludedPage()) return
    const { action, payload } = ev.detail
    for (const handle of handlers) {
        if (handle(action, payload)) return
    }
}) as EventListener)
