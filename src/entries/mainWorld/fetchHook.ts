import { logger } from '@/utils/logger'
import { fetchTransforms, type FetchTransformName } from '@/utils/fetchTransforms'

/**
 * MAIN-world-resident reimplementation of src/utils/fetch.ts -- see urlHandler.ts in this same
 * directory for why (plain `window`, not `unsafeWindow`; reached only via the CustomEvent
 * bridge). `postFnArr`/`addPostFn` from the original are omitted: confirmed zero consumers
 * anywhere in the codebase, not just currently-unmigrated ones.
 */
class FetchHook {
    private static instance: FetchHook
    private preFnArr: ((input: RequestInfo | URL, init: RequestInit | undefined) => RequestInfo | URL)[] = []

    private constructor() {
        try {
            this.hook()
        } catch (err) {
            logger.error('hook fetch error', err)
        }
    }

    static getInstance(): FetchHook {
        if (!FetchHook.instance) {
            FetchHook.instance = new FetchHook()
        }
        return FetchHook.instance
    }

    addPreFn(fn: (input: RequestInfo | URL, init: RequestInit | undefined) => RequestInfo | URL) {
        this.preFnArr.push(fn)
    }

    hook() {
        const origFetch = window.fetch
        window.fetch = async (input, init?) => {
            try {
                this.preFnArr.forEach((fn) => {
                    input = fn(input, init)
                })
            } catch {
                return origFetch(input, init)
            }
            return origFetch(input, init)
        }
    }
}

const fetchHookInstance = FetchHook.getInstance()

export function handleFetchAction(action: string, payload: any): boolean {
    if (action === 'fetch.registerPreTransform') {
        const name = payload?.name as FetchTransformName
        if (fetchTransforms[name]) fetchHookInstance.addPreFn(fetchTransforms[name])
        return true
    }
    return false
}
