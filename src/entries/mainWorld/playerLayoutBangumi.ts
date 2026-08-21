import { logger } from '@/utils/logger'

/**
 * MAIN-world-resident reimplementation of bangumi playerLayout's unsafeWindow-dependent parts --
 * see playerLayoutVideo.ts in this directory for the general rationale, and
 * bridge/playerLayoutBangumi.userscript.ts for the known document-start timing caveat on
 * `default-widescreen` specifically (not yet mitigated for the extension build).
 */
let preventVolumeTune = false
let cleanUp = () => {}

const isWebScreen = (): boolean => {
    if (window.player?.getManifest?.()?.screenKind === 2) {
        return true
    }
    return !!document.querySelector('#bilibili-player-wrap[class^=video_playerFullScreen]')
}

const isMiniScreen = (): boolean => {
    return window.player?.getManifest?.()?.screenKind === 3
}

const playerGoTo = (mode: 'normal' | 'wide' | 'web' | 'mini' | 'full' | 'pip') => {
    const map = { normal: 0, wide: 1, web: 2, mini: 3, full: 4, pip: 5 }
    if (typeof window.player?.requestStatue === 'function') {
        window.player.requestStatue(map[mode]).catch((err: unknown) => {
            logger.error(`Failed to switch player mode to ${mode}:`, err)
        })
    }
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
        let origNextData = window.__NEXT_DATA__
        if (origNextData?.props?.pageProps?.dehydratedState?.queries?.[1]?.state?.data?.show) {
            origNextData.props.pageProps.dehydratedState.queries[1].state.data.show.wide_screen = 1
        }
        try {
            Object.defineProperty(window, '__NEXT_DATA__', {
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

export function handlePlayerLayoutBangumiAction(action: string): boolean {
    const handler = actions[action]
    if (handler) {
        handler()
        return true
    }
    return false
}
