import { unsafeWindow } from '$'
import { playerGoTo } from '@/utils/playerGoTo'
import { waitForEle } from '@/utils/tool'
import { wideScreenManager } from '@/utils/widePlayer'

/**
 * Userscript-build implementation of the video playerLayout actions -- unsafeWindow, called
 * in-process (no bridge needed; Tampermonkey scripts don't have a MAIN/isolated split the way
 * MV3 extensions do). See src/entries/mainWorld/playerLayoutVideo.ts for the extension-build
 * counterpart -- kept as a separate file, not shared, because half of this is `unsafeWindow` vs
 * `window` and the other half (hot-path event listeners) is deliberately not bridge-mediated.
 */
let preventVolumeTune = false
const origGetBoundingClientRect = Element.prototype.getBoundingClientRect
let miniPlayerCleanUp = () => {}

const isWebScreen = (): boolean => {
    if (unsafeWindow.player?.getManifest?.()?.screenKind === 2) {
        return true
    }
    return document.body?.classList.contains('webscreen-fix')
}

const isMiniScreen = (): boolean => {
    return unsafeWindow.player?.getManifest?.()?.screenKind === 3
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

const scrollMiniPlayerHandler = () => {
    if (!document.fullscreenElement && isWebScreen()) {
        const currIsMiniScreen = isMiniScreen()
        if (!currIsMiniScreen && scrollY >= innerHeight * 1.05) {
            playerGoTo('mini')
        } else if (currIsMiniScreen && scrollY < innerHeight * 1.05) {
            playerGoTo('web')
        }
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

const actions: Record<string, () => void> = {
    'video-playerLayout.default-widescreen.enable': () => {
        unsafeWindow.isWide = true
        wideScreenManager.lock()
        const listener = () => {
            window.scrollTo(0, 64)
            waitForEle(document.body, '.bpx-player-ctrl-wide', (node: HTMLElement): boolean => {
                return node.className.includes('bpx-player-ctrl-wide')
            }).then((wideBtn) => {
                if (wideBtn) {
                    wideBtn.click()
                    wideScreenManager.unlock()
                }
            })
        }
        document.readyState !== 'loading' ? listener() : document.addEventListener('DOMContentLoaded', listener)
    },
    'video-playerLayout.default-webscreen.enable': () => {
        const id = setInterval(() => {
            if (typeof unsafeWindow.player?.requestStatue === 'function') {
                unsafeWindow.player
                    .requestStatue(2)
                    .then(() => {
                        clearInterval(id)
                        const id2 = setInterval(() => {
                            const container = document.querySelector<HTMLElement>(
                                '#bilibili-player .bpx-player-container',
                            )
                            const video = document.querySelector<HTMLElement>('#bilibili-player video')
                            if (container && video && container.getAttribute('data-screen') === 'web') {
                                const a = container.offsetHeight / innerHeight
                                const b = container.offsetWidth / innerWidth
                                const c = video.offsetHeight / innerHeight
                                if (a > 0.9 && a < 1.1 && b > 0.9 && b < 1.1 && c > 0.9 && c < 1.1) {
                                    clearInterval(id2)
                                    setTimeout(() => {
                                        document.documentElement.classList.add('webscreen-loaded')
                                    }, 1000)
                                }
                            }
                        }, 200)
                    })
                    .catch(() => {})
            }
        }, 100)
        document.addEventListener(
            'keydown',
            (e) => {
                if (isWebScreen() && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                    const target = e.target as HTMLElement
                    if (
                        target &&
                        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
                    ) {
                        return
                    }
                    document.querySelector<HTMLElement>('#bilibili-player .bpx-player-dm-root')?.click()
                }
            },
            true,
        )
    },
    'video-playerLayout.webscreen-scrollable.enable': () => {
        preventVolumeTune = true
    },
    'video-playerLayout.webscreen-scrollable.disable': () => {
        preventVolumeTune = false
    },
    'video-playerLayout.fullscreen-scrollable.enable': () => {
        preventVolumeTune = true
        document.addEventListener('click', handleFullScreenClick, true)
        document.addEventListener('dblclick', handleFullScreenDblClick, true)
    },
    'video-playerLayout.fullscreen-scrollable.disable': () => {
        preventVolumeTune = false
        document.removeEventListener('click', handleFullScreenClick, true)
        document.removeEventListener('dblclick', handleFullScreenDblClick, true)
    },
    'video-playerLayout.screen-scrollable-enable-mini-player.enable': () => {
        Element.prototype.getBoundingClientRect = function (this: Element) {
            const el = this as Element & { id: string }
            if (
                !document.fullscreenElement &&
                isWebScreen() &&
                (el.id === 'arc_toolbar_report' || el.id === 'playlistToolbar')
            ) {
                const rect = origGetBoundingClientRect.call(this)
                return { ...rect, top: 999999 }
            }
            return origGetBoundingClientRect.call(this)
        }
        window.addEventListener('scroll', scrollMiniPlayerHandler)
        miniPlayerCleanUp = () => window.removeEventListener('scroll', scrollMiniPlayerHandler)
    },
    'video-playerLayout.screen-scrollable-enable-mini-player.disable': () => {
        Element.prototype.getBoundingClientRect = origGetBoundingClientRect
        miniPlayerCleanUp()
    },
}

export function dispatchPlayerLayoutVideoAction(action: string): void {
    actions[action]?.()
}
