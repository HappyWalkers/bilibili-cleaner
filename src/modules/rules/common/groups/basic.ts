import { Item } from '@/types/item'
import {
    isPageBangumi,
    isPageChannel,
    isPageDynamic,
    isPageFestival,
    isPageHomepage,
    isPageLive,
    isPagePlaylist,
    isPagePopular,
    isPageSearch,
    isPageSpace,
    isPageVideo,
    isPageWatchlater,
} from '@/utils/pageType'
import { registerUrlTransform, cleanUrl } from '#bridge/urlHandler'

export const commonBasicItems: Item[] = [
    {
        type: 'switch',
        id: 'border-radius',
        name: '页面直角化，去除圆角',
        // 根据当前页面选定attribute name
        attrName: ((): string | undefined => {
            if (isPageDynamic()) {
                return 'border-radius-dynamic'
            }
            if (isPageLive()) {
                return 'border-radius-live'
            }
            if (isPageSearch()) {
                return 'border-radius-search'
            }
            if (isPageVideo() || isPagePlaylist()) {
                return 'border-radius-video'
            }
            if (isPageBangumi()) {
                return 'border-radius-bangumi'
            }
            if (isPageHomepage()) {
                return 'border-radius-homepage'
            }
            if (isPagePopular()) {
                return 'border-radius-popular'
            }
            if (isPageSpace()) {
                return 'border-radius-space'
            }
            if (isPageChannel()) {
                return 'border-radius-channel'
            }
            return undefined
        })(),
    },
    {
        type: 'switch',
        id: 'beauty-scrollbar',
        name: '美化页面滚动条',
        description: ['适用于旧版本浏览器'],
    },
    {
        type: 'switch',
        id: 'hide-watchlater-button',
        name: '隐藏 视频卡片 稍后再看按钮',
    },
    {
        type: 'switch',
        id: 'url-cleaner',
        name: 'URL参数净化',
        description: ['给 UP 充电时若报错，尝试关闭本功能并刷新'],
        defaultEnable: true,
        noStyle: true,
        /**
         * URL净化，移除query string中的跟踪参数/无用参数
         * 净化掉vd_source参数会导致充电窗口载入失败
         */
        enableFn: async () => {
            // implementation: src/utils/urlTransforms.ts's cleanParams (named so it can cross
            // the MAIN/isolated bridge in the extension build -- see #bridge/urlHandler)
            registerUrlTransform('cleanParams')
            cleanUrl()
        },
    },
    {
        type: 'switch',
        id: 'hide-footer',
        name: '隐藏 页底footer',
    },
    {
        type: 'switch',
        id: 'common-unify-font',
        name: '统一全站字体',
        defaultEnable: true,
        attrName: ((): string | undefined => {
            if (isPageLive()) {
                return 'common-unify-font-live'
            }
            if (isPageDynamic()) {
                return 'common-unify-font-dynamic'
            }
            if (isPagePopular()) {
                return 'common-unify-font-popular'
            }
            if (isPageWatchlater()) {
                return 'common-unify-font-watchlater'
            }
            if (isPageSpace()) {
                return 'common-unify-font-space'
            }
            if (isPageFestival()) {
                return 'common-unify-font-festival'
            }
            return undefined
        })(),
        description: ['让全站字体与首页字体一致', '生效页面：动态、直播、热门、稍后再看'],
    },
]
