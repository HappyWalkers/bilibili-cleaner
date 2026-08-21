import { logger } from '@/utils/logger'
import { urlTransforms, type UrlTransformName } from '@/utils/urlTransforms'

/**
 * MAIN-world-resident reimplementation of src/utils/urlHandler.ts (the userscript build's
 * version, used via unsafeWindow), using plain `window` instead -- this script already runs in
 * the page's real JS context (that's what `world: 'MAIN'` means), so there's no isolated-world
 * sandbox to escape from here. Reached only through the CustomEvent bridge -- see
 * handleUrlAction below and src/bridge/urlHandler.extension.ts on the isolated-world side.
 */
class URLHandler {
    private static instance: URLHandler
    private origReplaceState = window.history.replaceState
    private origPushState = window.history.pushState
    cleanFnArr: ((url: string) => string)[] = []

    private constructor() {
        try {
            this.hijack()
        } catch (err) {
            logger.error('init URLHandler error', err)
        }
    }

    static getInstance() {
        if (!URLHandler.instance) {
            URLHandler.instance = new URLHandler()
        }
        return URLHandler.instance
    }

    private hijack() {
        window.history.replaceState = (data: any, unused: string, url?: string | URL | null): void => {
            try {
                if (typeof url === 'string') {
                    if (!url.startsWith(location.origin) && !url.startsWith(location.hostname)) {
                        url = `${location.origin}${url.startsWith('/') ? '' : '/'}${url}`
                    }
                    const cleanURL = this.cleanFnArr.reduce((curr, fn) => fn(curr), url)
                    if (location.href.endsWith(cleanURL)) {
                        return
                    }
                    return this.origReplaceState.apply(window.history, [data, unused, cleanURL])
                }
                return this.origReplaceState.apply(window.history, [data, unused, url])
            } catch (err) {
                logger.error('URLHandler replaceState error', err)
                return this.origReplaceState.apply(window.history, [data, unused, url])
            }
        }
        window.history.pushState = (data: any, unused: string, url?: string | URL | null): void => {
            try {
                if (typeof url === 'string') {
                    if (!url.startsWith(location.origin) && !url.startsWith(location.hostname)) {
                        url = `${location.origin}${url.startsWith('/') ? '' : '/'}${url}`
                    }
                    const cleanURL = this.cleanFnArr.reduce((curr, fn) => fn(curr), url)
                    if (location.href.endsWith(cleanURL)) {
                        return
                    }
                    return this.origPushState.apply(window.history, [data, unused, cleanURL])
                }
                return this.origPushState.apply(window.history, [data, unused, url])
            } catch (err) {
                logger.error('URLHandler pushState error', err)
                return this.origReplaceState.apply(window.history, [data, unused, url])
            }
        }
    }

    clean() {
        try {
            const cleanURL = this.cleanFnArr.reduce((curr, fn) => fn(curr), location.href)
            if (location.href !== cleanURL) {
                this.origReplaceState.apply(window.history, [null, '', cleanURL])
            }
        } catch (err) {
            logger.error('init URLHandler error', err)
        }
    }
}

const urlHandlerInstance = URLHandler.getInstance()

export function handleUrlAction(action: string, payload: any): boolean {
    if (action === 'url.registerTransform') {
        const name = payload?.name as UrlTransformName
        if (urlTransforms[name]) urlHandlerInstance.cleanFnArr.push(urlTransforms[name])
        return true
    }
    if (action === 'url.clean') {
        urlHandlerInstance.clean()
        return true
    }
    return false
}
