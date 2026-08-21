import URLHandlerInstance from '@/utils/urlHandler'
import { urlTransforms, type UrlTransformName } from '@/utils/urlTransforms'

export function registerUrlTransform(name: UrlTransformName): void {
    URLHandlerInstance.cleanFnArr.push(urlTransforms[name])
}

export function cleanUrl(): void {
    URLHandlerInstance.clean()
}
