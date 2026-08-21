// MAIN-world-resident reimplementation of video.ts's __INITIAL_STATE__.related scrub -- see
// urlHandler.ts in this directory for the general per-target-swap rationale. Best-effort/
// fire-and-forget by design (matches the original: no return value, no error surfaced to the
// caller if the shape doesn't match).
export function handleRelatedVideoFilterAction(action: string, payload: any): boolean {
    if (action !== 'video.filterRelated') return false
    const blackBvids = (payload?.blackBvids ?? []) as string[]
    const rel = window.__INITIAL_STATE__?.related
    if (rel?.length && blackBvids.length) {
        const blackSet = new Set(blackBvids)
        window.__INITIAL_STATE__!.related = rel.filter((v) => !(v.bvid && blackSet.has(v.bvid)))
    }
    return true
}
