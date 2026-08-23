/**
 * Extension build, MV3 background service worker. Registers chrome.contextMenus for the 3
 * GM_registerMenuCommand entries (see main.ts's menu()) that have no in-page equivalent (the
 * other 5 duplicate SideBtnView.vue buttons and were dropped, not ported). Two of the three need
 * relaying to the isolated-world content script -- a service worker has no DOM/CustomEvent
 * access, so it can't use src/bridge/toMain.ts's mechanism; chrome.tabs.sendMessage is the only
 * channel available here. The third (issue link) needs no relay at all.
 *
 * Both relayed items resolve their target tab defensively and address the message to frameId 0
 * only -- see the comments on onClicked below for why each matters.
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

const RELAY_ACTIONS: Record<string, string> = {
    [MENU_IDS.articleFilter]: 'toggle-article-filter-panel',
    [MENU_IDS.sideBtn]: 'toggle-side-btn',
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === MENU_IDS.issue) {
        chrome.tabs.create({ url: 'https://github.com/festoney8/bilibili-cleaner' })
        return
    }
    const action = RELAY_ACTIONS[String(info.menuItemId)]
    if (!action) return

    // Defensive, not a fix for an observed failure: both the pinned-icon right-click and the
    // Extensions-panel ⋮ menu were manually confirmed to populate `tab`. But chrome's own typings
    // mark the onClicked `tab` argument optional, so the previous `if (!tab?.id) return` had a
    // silent bail-out on a path the API permits. Resolve the active tab instead of returning.
    let tabId = tab?.id
    if (tabId === undefined) {
        const [active] = await chrome.tabs.query({ active: true, currentWindow: true })
        tabId = active?.id
    }
    if (tabId === undefined) {
        console.warn(`[bili-cleaner] no target tab for "${action}"`)
        return
    }

    // frameId 0 = top frame only. Without it this broadcasts to every frame, and any
    // same-origin bilibili iframe running the content script would toggle too -- an even
    // number of toggles cancels out. Today the same-origin iframes bilibili embeds
    // (message.bilibili.com/pages/nav/header_sync, /correspond/*) all sit in the @exclude
    // list so they never register a relay, but that is a coincidence of the exclude list,
    // not something this code should depend on.
    chrome.tabs.sendMessage(tabId, { action }, { frameId: 0 }).catch((err) => {
        // Expected when the tab isn't a (non-excluded) bilibili page -- there's no content
        // script listening. Logged rather than swallowed: silent failure is exactly what made
        // the bug above so hard to find.
        console.warn(`[bili-cleaner] "${action}" not delivered to tab ${tabId}:`, err?.message ?? err)
    })
})
