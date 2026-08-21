import { GM_registerMenuCommand } from '$'
import { bootstrap } from './bootstrap'
import { toggleDarkMode } from './modules/rules/common/groups/theme'
import {
    useArticleFilterPanelStore,
    useCommentFilterPanelStore,
    useDynamicFilterPanelStore,
    useRulePanelStore,
    useSideBtnStore,
    useVideoFilterPanelStore,
} from './stores/view'
import { logger } from '@/utils/logger'
import { isPageLive } from './utils/pageType'

const menu = () => {
    // skip live page iframe
    if (isPageLive() && self !== top) {
        return
    }
    const ruleStore = useRulePanelStore()
    const videoStore = useVideoFilterPanelStore()
    const commentStore = useCommentFilterPanelStore()
    const dynamicStore = useDynamicFilterPanelStore()
    const articleStore = useArticleFilterPanelStore()
    const sideBtnStore = useSideBtnStore()

    GM_registerMenuCommand('✅ 页面净化优化', () => {
        ruleStore.toggle()
    })
    if (videoStore.isPageValid()) {
        GM_registerMenuCommand('✅ 视频过滤设置', () => {
            videoStore.toggle()
        })
    } else {
        GM_registerMenuCommand('🚫 视频过滤设置', () => {
            alert('[bilibili-cleaner] 本页面不支持视频过滤')
        })
    }

    if (commentStore.isPageValid()) {
        GM_registerMenuCommand('✅ 评论过滤设置', () => {
            commentStore.toggle()
        })
    } else {
        GM_registerMenuCommand('🚫 评论过滤设置', () => {
            alert('[bilibili-cleaner] 本页面不支持评论过滤')
        })
    }
    if (dynamicStore.isPageValid()) {
        GM_registerMenuCommand('✅ 动态过滤设置', () => {
            dynamicStore.toggle()
        })
    } else {
        GM_registerMenuCommand('🚫 动态过滤设置', () => {
            alert('[bilibili-cleaner] 本页面不支持动态过滤')
        })
    }

    if (articleStore.isPageValid()) {
        GM_registerMenuCommand('✅ 专栏过滤设置', () => {
            articleStore.toggle()
        })
    } else {
        GM_registerMenuCommand('🚫 专栏过滤设置', () => {
            alert('[bilibili-cleaner] 本页面不支持专栏过滤')
        })
    }

    GM_registerMenuCommand('⚡ 夜间模式开关', () => {
        toggleDarkMode()
    })
    GM_registerMenuCommand('⚡ 快捷按钮开关', () => {
        sideBtnStore.toggle()
    })
    GM_registerMenuCommand('💬 问题反馈', () => {
        window.open('https://github.com/festoney8/bilibili-cleaner', '_blank')
    })
}

await bootstrap()

try {
    menu()
} catch (err) {
    logger.error('main.ts menu error', err)
}
