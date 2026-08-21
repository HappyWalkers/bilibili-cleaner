import { unsafeWindow } from '$'
import { logger } from './logger'

/**
 * Extracted out of tool.ts specifically because it's the one unsafeWindow-dependent export in an
 * otherwise world-neutral file -- keeping it separate means tool.ts's other exports (matchBvid,
 * waitForEle, etc, used from ~15 isolated-world files) stay importable from anywhere in either
 * build without dragging in an unresolvable `unsafeWindow` import. Userscript-build-only: the
 * extension build's MAIN-world files each define their own local equivalent (see
 * src/entries/mainWorld/playerLayoutVideo.ts and playerLayoutBangumi.ts), since `window.player`
 * there is just as direct as this is for the userscript build.
 */
export const playerGoTo = (mode: 'normal' | 'wide' | 'web' | 'mini' | 'full' | 'pip') => {
    const map = {
        normal: 0,
        wide: 1,
        web: 2,
        mini: 3,
        full: 4,
        pip: 5,
    }
    if (typeof unsafeWindow.player?.requestStatue === 'function') {
        unsafeWindow.player.requestStatue(map[mode]).catch((err: unknown) => {
            logger.error(`Failed to switch player mode to ${mode}:`, err)
        })
    }
}
