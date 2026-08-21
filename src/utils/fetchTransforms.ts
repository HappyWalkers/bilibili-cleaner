/**
 * Named, world-neutral fetch pre-transform functions -- same rationale as urlTransforms.ts (a
 * live closure can't cross the MAIN/isolated CustomEvent bridge, a name can). Currently only one:
 * pulled out of homepage/groups/rcmd.ts's inline closure.
 */
export type FetchTransformName = 'increaseRcmdLoadSize'

const increaseRcmdLoadSize = (input: RequestInfo | URL, init: RequestInit | undefined): RequestInfo | URL => {
    if (
        typeof input === 'string' &&
        input.includes('api.bilibili.com') &&
        input.includes('feed/rcmd') &&
        init?.method?.toUpperCase() === 'GET'
    ) {
        input = input.replace('&ps=12&', '&ps=24&')
    }
    return input
}

export const fetchTransforms: Record<
    FetchTransformName,
    (input: RequestInfo | URL, init: RequestInit | undefined) => RequestInfo | URL
> = {
    increaseRcmdLoadSize,
}
