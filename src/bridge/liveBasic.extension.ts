import { sendToMain } from '@/bridge/toMain'

// The 2000ms wait happens here (isolated world), not in the MAIN-world handler, so it only ever
// triggers once regardless of how many of toMain.ts's blind retries land (those all resolve
// within ~600ms, well before this fires) -- see liveBasic.userscript.ts for the userscript-build
// equivalent of this same timing choice.
export function dispatchLiveBasicAction(action: string): void {
    if (action === 'live-basic.auto-best-quality.enable') {
        setTimeout(() => sendToMain(action), 2000)
        return
    }
    sendToMain(action)
}
