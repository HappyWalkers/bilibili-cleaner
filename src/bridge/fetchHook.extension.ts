import { sendToMain } from '@/bridge/toMain'
import type { FetchTransformName } from '@/utils/fetchTransforms'

export function registerFetchPreTransform(name: FetchTransformName): void {
    sendToMain('fetch.registerPreTransform', { name })
}
