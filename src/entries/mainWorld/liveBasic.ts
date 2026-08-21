import { logger } from '@/utils/logger'

// The 2000ms wait already happened on the isolated-world side (see
// src/bridge/liveBasic.extension.ts) before this action was even dispatched, so this runs the
// quality switch immediately on receipt.
function qualityFn() {
    const player = window.livePlayer || window.EmbedPlayer?.instance
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

export function handleLiveBasicAction(action: string): boolean {
    if (action === 'live-basic.auto-best-quality.enable') {
        qualityFn()
        return true
    }
    return false
}
