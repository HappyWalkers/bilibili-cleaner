import { Item } from '@/types/item'
import { dispatchPlayerLayoutVideoAction } from '#bridge/playerLayoutVideo'

export const videoPlayerLayoutItems: Item[] = [
    {
        type: 'switch',
        id: 'default-widescreen',
        name: '自动宽屏播放',
        enableFn: () => {
            dispatchPlayerLayoutVideoAction('video-playerLayout.default-widescreen.enable')
        },
    },
    {
        type: 'switch',
        id: 'default-webscreen',
        name: '自动网页全屏播放',
        description: ['实验功能，不要与自动宽屏同时启用', '偶尔会出现载入时闪屏'],
        enableFn: () => {
            dispatchPlayerLayoutVideoAction('video-playerLayout.default-webscreen.enable')
        },
    },
    {
        type: 'switch',
        id: 'webscreen-scrollable',
        name: '网页全屏时 页面可滚动',
        description: ['启用后滚轮无法调节音量，刷新生效'],
        enableFn: () => {
            dispatchPlayerLayoutVideoAction('video-playerLayout.webscreen-scrollable.enable')
        },
        disableFn: () => {
            dispatchPlayerLayoutVideoAction('video-playerLayout.webscreen-scrollable.disable')
        },
        enableFnRunAt: 'document-end',
    },
    {
        type: 'switch',
        id: 'fullscreen-scrollable',
        name: '网页全屏/真全屏时 页面可滚动',
        description: ['启用后滚轮无法调节音量，刷新生效'],
        enableFn: () => {
            dispatchPlayerLayoutVideoAction('video-playerLayout.fullscreen-scrollable.enable')
        },
        disableFn: () => {
            dispatchPlayerLayoutVideoAction('video-playerLayout.fullscreen-scrollable.disable')
        },
    },
    {
        type: 'switch',
        id: 'screen-scrollable-enable-mini-player',
        name: '网页全屏滚动时 启用小窗播放器',
        description: ['实验功能，不支持真全屏'],
        enableFn: () => {
            dispatchPlayerLayoutVideoAction('video-playerLayout.screen-scrollable-enable-mini-player.enable')
        },
        disableFn: () => {
            dispatchPlayerLayoutVideoAction('video-playerLayout.screen-scrollable-enable-mini-player.disable')
        },
    },
    {
        type: 'switch',
        id: 'screen-scrollable-move-header-bottom',
        name: '全屏滚动时 在视频底部显示顶栏',
        description: ['网页全屏/真全屏滚动时生效'],
    },
    {
        type: 'switch',
        id: 'video-page-exchange-player-position',
        name: '播放器和视频信息 交换位置',
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
