import fetchHook from '@/utils/fetch'
import { fetchTransforms, type FetchTransformName } from '@/utils/fetchTransforms'

export function registerFetchPreTransform(name: FetchTransformName): void {
    fetchHook.addPreFn(fetchTransforms[name])
}
