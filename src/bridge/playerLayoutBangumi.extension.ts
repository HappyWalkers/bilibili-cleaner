import { sendToMain } from '@/bridge/toMain'

export function dispatchPlayerLayoutBangumiAction(action: string): void {
    sendToMain(action)
}
