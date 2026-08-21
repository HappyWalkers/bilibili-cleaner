import { sendToMain } from '@/bridge/toMain'

export function filterRelatedVideos(blackBvids: string[]): void {
    sendToMain('video.filterRelated', { blackBvids })
}
