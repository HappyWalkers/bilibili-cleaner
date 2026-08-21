import { unsafeWindow } from '$'

export function filterRelatedVideos(blackBvids: string[]): void {
    const rel = unsafeWindow.__INITIAL_STATE__?.related
    if (rel?.length && blackBvids.length) {
        const blackSet = new Set(blackBvids)
        unsafeWindow.__INITIAL_STATE__!.related = rel.filter((v) => !(v.bvid && blackSet.has(v.bvid)))
    }
}
