import { Item } from '@/types/item'
import { dispatchPlayerLayoutBangumiAction } from '#bridge/playerLayoutBangumi'

export const bangumiPlayerLayoutItems: Item[] = [
    {
        type: 'switch',
        id: 'default-widescreen',
        name: '自动宽屏播放',
        noStyle: true,
        enableFn: () => {
            dispatchPlayerLayoutBangumiAction('bangumi-playerLayout.default-widescreen.enable')
        },
    },
    {
        type: 'switch',
        id: 'webscreen-scrollable',
        name: '网页全屏时 页面可滚动',
        description: ['启用后滚轮无法调节音量，刷新生效'],
        enableFn: () => {
            dispatchPlayerLayoutBangumiAction('bangumi-playerLayout.webscreen-scrollable.enable')
        },
        disableFn: () => {
            dispatchPlayerLayoutBangumiAction('bangumi-playerLayout.webscreen-scrollable.disable')
        },
        enableFnRunAt: 'document-end',
    },
    {
        type: 'switch',
        id: 'fullscreen-scrollable',
        name: '网页全屏/真全屏时 页面可滚动',
        description: ['启用后滚轮无法调节音量，刷新生效'],
        enableFn: () => {
            dispatchPlayerLayoutBangumiAction('bangumi-playerLayout.fullscreen-scrollable.enable')
        },
        disableFn: () => {
            dispatchPlayerLayoutBangumiAction('bangumi-playerLayout.fullscreen-scrollable.disable')
        },
    },
    {
        type: 'switch',
        id: 'screen-scrollable-enable-mini-player',
        name: '网页全屏滚动时 启用小窗播放器',
        description: ['实验功能，不支持真全屏'],
        enableFn: () => {
            dispatchPlayerLayoutBangumiAction('bangumi-playerLayout.screen-scrollable-enable-mini-player.enable')
        },
        disableFn: () => {
            dispatchPlayerLayoutBangumiAction('bangumi-playerLayout.screen-scrollable-enable-mini-player.disable')
        },
    },
    {
        type: 'switch',
        id: 'screen-scrollable-move-header-bottom',
        name: '全屏滚动时 在视频底部显示顶栏',
        description: ['网页全屏/真全屏滚动时生效'],
    },
    {
        type: 'number',
        id: 'normalscreen-width',
        name: '普通播放宽度调节（-1禁用）',
        minValue: -1,
        maxValue: 100,
        step: 0.1,
        defaultValue: -1,
        disableValue: -1,
        addonText: 'vw',
        fn: (value: number) => {
            document.documentElement.style.setProperty('--normalscreen-width', `${value}vw`)
        },
    },
]
