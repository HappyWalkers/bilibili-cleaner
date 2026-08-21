import { useArticleFilterPanelStore, useSideBtnStore } from '@/stores/view'

/**
 * Receives the two toggle commands relayed from the background service worker's
 * chrome.contextMenus (see src/entries/background.ts) -- a service worker has no DOM/CustomEvent
 * access, so it can't use the src/bridge/toMain.ts mechanism; chrome.tabs.sendMessage /
 * chrome.runtime.onMessage is the only channel available for this one.
 *
 * Must be called only after bootstrap() has resolved (app.use(pinia) already ran), matching how
 * main.ts's menu() -- the userscript equivalent -- also calls useXStore() only after bootstrap().
 */
export function registerMenuRelay(): void {
    chrome.runtime.onMessage.addListener((msg: { action?: string }) => {
        if (msg?.action === 'toggle-article-filter-panel') {
            useArticleFilterPanelStore().toggle()
        } else if (msg?.action === 'toggle-side-btn') {
            useSideBtnStore().toggle()
        }
    })
}
