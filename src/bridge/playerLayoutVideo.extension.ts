import { sendToMain } from '@/bridge/toMain'

export function dispatchPlayerLayoutVideoAction(action: string): void {
    sendToMain(action)
}
