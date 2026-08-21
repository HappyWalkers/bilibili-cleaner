import { unsafeWindow } from '$'
import { logger } from '@/utils/logger'
import { playerGoTo } from '@/utils/playerGoTo'

/**
 * Userscript-build implementation of the bangumi playerLayout actions -- see
 * playerLayoutVideo.userscript.ts for the general rationale (unsafeWindow, in-process, no
 * bridge). `default-widescreen` here patches `__NEXT_DATA__` and needs to run before Next.js
 * hydrates -- in the userscript build GM_getValue is synchronous so this fires early enough by
 * construction. KNOWN LIMITATION in the extension build (playerLayoutBangumi.extension.ts): the
 * isolated-world cache-warm-up (chrome.storage.local.get) is async, so this can land a few
 * frames later than true document_start -- not yet given the localStorage-mirror treatment the
 * plan calls for; flagged for Phase 5 verification, not silently assumed fine.
 */
let preventVolumeTune = false
let cleanUp = () => {}

const isWebScreen = (): boolean => {
    if (unsafeWindow.player?.getManifest?.()?.screenKind === 2) {
        return true
    }
    return !!document.querySelector('#bilibili-player-wrap[class^=video_playerFullScreen]')
}

const isMiniScreen = (): boolean => {
    return unsafeWindow.player?.getManifest?.()?.screenKind === 3
}

for (const eventName of ['mousewheel', 'DOMMouseScroll', 'wheel']) {
    window.addEventListener(
        eventName,
        (e: Event) => {
            if (preventVolumeTune && isWebScreen() && !isMiniScreen()) {
                e.stopImmediatePropagation()
            }
        },
        { capture: true, passive: true },
    )
}

const toggleFullScreen = () => {
    const fullScreenStatus = (): 'ele' | 'f11' | 'not' => {
        if (document.fullscreenElement) {
            return 'ele'
        }
        if (window.innerWidth === screen.width && window.innerHeight === screen.height) {
            return 'f11'
        }
        return 'not'
    }

    switch (fullScreenStatus()) {
        case 'ele':
            document.exitFullscreen().catch(() => {})
            if (isWebScreen()) {
                playerGoTo('normal')
            }
            break
        case 'f11':
            playerGoTo('normal')
            break
        case 'not':
            document.documentElement.requestFullscreen().catch(() => {})
            if (!isWebScreen()) {
                playerGoTo('web')
            }
            window.scrollTo(0, 0)
            break
    }
}

const handleFullScreenClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement
    if (
        target.closest('#bilibili-player .bpx-player-ctrl-full') ||
        (target.classList.contains('bpx-player-ctrl-full') && target.classList.contains('#bilibili-player'))
    ) {
        e.stopImmediatePropagation()
        toggleFullScreen()
    }
}

const handleFullScreenDblClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement
    if (
        target.closest('#bilibili-player .bpx-player-video-perch') ||
        (target.classList.contains('bpx-player-video-perch') && target.closest('#bilibili-player'))
    ) {
        e.stopImmediatePropagation()
        document.querySelector<HTMLVideoElement>('#bilibili-player video')?.pause()
        toggleFullScreen()
    }
}

const actions: Record<string, () => void> = {
    'bangumi-playerLayout.default-widescreen.enable': () => {
        let origNextData = unsafeWindow.__NEXT_DATA__
        if (origNextData?.props?.pageProps?.dehydratedState?.queries?.[1]?.state?.data?.show) {
            origNextData.props.pageProps.dehydratedState.queries[1].state.data.show.wide_screen = 1
        }
        try {
            Object.defineProperty(unsafeWindow, '__NEXT_DATA__', {
                get() {
                    return origNextData
                },
                set(value) {
                    if (value.props?.pageProps?.dehydratedState?.queries?.[1]?.state?.data?.show) {
                        value.props.pageProps.dehydratedState.queries[1].state.data.show.wide_screen = 1
                    }
                    origNextData = value
                },
            })
        } catch (err) {
            logger.error('bangumi default-widescreen defineProperty error', err)
        }
    },
    'bangumi-playerLayout.webscreen-scrollable.enable': () => {
        preventVolumeTune = true
    },
    'bangumi-playerLayout.webscreen-scrollable.disable': () => {
        preventVolumeTune = false
    },
    'bangumi-playerLayout.fullscreen-scrollable.enable': () => {
        preventVolumeTune = true
        document.addEventListener('click', handleFullScreenClick, true)
        document.addEventListener('dblclick', handleFullScreenDblClick, true)
    },
    'bangumi-playerLayout.fullscreen-scrollable.disable': () => {
        preventVolumeTune = false
        document.removeEventListener('click', handleFullScreenClick, true)
        document.removeEventListener('dblclick', handleFullScreenDblClick, true)
    },
    'bangumi-playerLayout.screen-scrollable-enable-mini-player.enable': () => {
        const handler = (e: Event) => {
            if (document.fullscreenElement) {
                e.stopImmediatePropagation()
            }
        }
        window.addEventListener('scroll', handler, { capture: true, passive: true })
        cleanUp = () => window.removeEventListener('scroll', handler, true)
    },
    'bangumi-playerLayout.screen-scrollable-enable-mini-player.disable': () => {
        cleanUp()
    },
}

export function dispatchPlayerLayoutBangumiAction(action: string): void {
    actions[action]?.()
}
