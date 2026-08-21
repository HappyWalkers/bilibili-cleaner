import { sendToMain } from '@/bridge/toMain'
import type { UrlTransformName } from '@/utils/urlTransforms'

export function registerUrlTransform(name: UrlTransformName): void {
    sendToMain('url.registerTransform', { name })
}

export function cleanUrl(): void {
    sendToMain('url.clean')
}
