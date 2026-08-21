import { unsafeWindow } from '$'
import { logger } from '@/utils/logger'

/**
 * Userscript-build implementation of live/basic.ts's one unsafeWindow-dependent action. Not
 * document-start-timing-critical (the original already does `setTimeout(qualityFn, 2000)`), so
 * this is a plain one-shot bridge action, no special-casing needed unlike bangumi's
 * default-widescreen.
 */
const qualityFn = () => {
    const player = unsafeWindow.livePlayer || unsafeWindow.EmbedPlayer?.instance
    if (player) {
        try {
            const info = player?.getPlayerInfo()
            const arr = player?.getPlayerInfo().qualityCandidates
            if (info && arr && arr.length) {
                let maxQn = 0
                arr.forEach((v) => {
                    if (v.qn && parseInt(v.qn) > maxQn) {
                        maxQn = parseInt(v.qn)
                    }
                })
                if (maxQn && info.quality && maxQn > parseInt(info.quality)) {
                    player.switchQuality(`${maxQn}`)
                }
            }
        } catch (err) {
            logger.error('auto-best-quality error', err)
        }
    }
}

export function dispatchLiveBasicAction(action: string): void {
    if (action === 'live-basic.auto-best-quality.enable') {
        setTimeout(qualityFn, 2000)
    }
}
