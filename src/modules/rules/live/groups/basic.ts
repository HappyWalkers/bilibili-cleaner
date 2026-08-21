import { Item } from '@/types/item'
import { dispatchLiveBasicAction } from '#bridge/liveBasic'
import { waitForHead } from '@/utils/init'

let observer: MutationObserver | undefined

export const liveBasicItems: Item[] = [
    {
        type: 'switch',
        id: 'live-page-sidebar-vm',
        name: '隐藏 页面右侧按钮 实验室/关注',
        defaultEnable: true,
    },
    {
        type: 'switch',
        id: 'live-page-default-skin',
        name: '禁用 播放器皮肤',
        enableFn: () => {
            const style = document.querySelector<HTMLStyleElement>('head #skin-css')
            if (style) {
                style.disabled = true
            }
            observer = new MutationObserver((mutations) => {
                for (const mutation of mutations) {
                    for (const node of mutation.addedNodes) {
                        if (node instanceof HTMLStyleElement && node.id === 'skin-css') {
                            node.disabled = true
                        }
                    }
                }
            })
            waitForHead().then(() => {
                observer?.observe(document.head, { childList: true })
            })
        },
        disableFn: () => {
            observer?.disconnect()
            const style = document.querySelector<HTMLStyleElement>('head #skin-css')
            if (style) {
                style.disabled = false
            }
        },
    },
    {
        type: 'switch',
        id: 'live-page-remove-wallpaper',
        name: '禁用 直播背景',
    },
    {
        type: 'switch',
        id: 'activity-live-auto-jump',
        name: '活动直播自动跳转普通直播',
        noStyle: true,
        enableFn: async () => {
            if (!/\/\d+/.test(location.pathname)) {
                return
            }
            if (self !== top) {
                return
            }
            let cnt = 0
            const id = setInterval(() => {
                if (
                    document.querySelector(
                        '.rendererRoot, #main.live-activity-full-main, #internationalHeader, iframe[src*="live.bilibili.com/blanc/"]',
                    )
                ) {
                    location.href = location.href.replace('live.bilibili.com/', 'live.bilibili.com/blanc/')
                    clearInterval(id)
                }
                ++cnt > 50 && clearInterval(id)
            }, 200)
        },
    },
    {
        type: 'switch',
        id: 'auto-best-quality',
        name: '自动切换最高画质 (实验功能)',
        description: ['自动画质时也会切换，但仍显示[自动]'],
        noStyle: true,
        enableFn: async () => {
            if (!/\/\d+|\/blanc\/\d+/.test(location.pathname)) {
                return
            }
            if (self !== top) {
                return
            }
            dispatchLiveBasicAction('live-basic.auto-best-quality.enable')
        },
        enableFnRunAt: 'document-end',
    },
    {
        type: 'number',
        id: 'live-page-width',
        name: '修改 页面宽度占比 (0禁用)',
        description: ['推荐范围 85~95'],
        minValue: 0,
        maxValue: 100,
        step: 1,
        defaultValue: 0,
        disableValue: 0,
        addonText: 'vw',
        fn: (value: number) => {
            document.documentElement.style.setProperty('--live-page-width', `${value}vw`)
        },
    },
]
