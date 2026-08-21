/**
 * Extension build, MV3 background service worker. Registers chrome.contextMenus for the 3
 * GM_registerMenuCommand entries (see main.ts's menu()) that have no in-page equivalent (the
 * other 5 duplicate SideBtnView.vue buttons and were dropped, not ported). Two of the three need
 * relaying to the isolated-world content script -- a service worker has no DOM/CustomEvent
 * access, so it can't use src/bridge/toMain.ts's mechanism; chrome.tabs.sendMessage is the only
 * channel available here. The third (issue link) needs no relay at all.
 */
const MENU_IDS = {
    articleFilter: 'bcf-toggle-article-filter',
    sideBtn: 'bcf-toggle-side-btn',
    issue: 'bcf-issue',
} as const

chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: MENU_IDS.articleFilter,
        title: '专栏过滤设置',
        contexts: ['action'],
    })
    chrome.contextMenus.create({
        id: MENU_IDS.sideBtn,
        title: '快捷按钮开关',
        contexts: ['action'],
    })
    chrome.contextMenus.create({
        id: MENU_IDS.issue,
        title: '问题反馈',
        contexts: ['action'],
    })
})

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === MENU_IDS.issue) {
        chrome.tabs.create({ url: 'https://github.com/festoney8/bilibili-cleaner' })
        return
    }
    if (!tab?.id) return
    if (info.menuItemId === MENU_IDS.articleFilter) {
        chrome.tabs.sendMessage(tab.id, { action: 'toggle-article-filter-panel' }).catch(() => {})
    } else if (info.menuItemId === MENU_IDS.sideBtn) {
        chrome.tabs.sendMessage(tab.id, { action: 'toggle-side-btn' }).catch(() => {})
    }
})
