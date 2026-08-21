import { GM_getValue } from '$'

export default {
    // getter, not a plain field: must not call GM_getValue at module-evaluation time. logger.ts
    // (imported from MAIN-world files in the extension build, which never warm gmCompat's cache
    // -- they have no chrome.storage access at all, by design) imports this module; a plain
    // eager field here crashed main-world.ts with "GM_* called before warmCache() resolved" the
    // instant it was loaded, before anything even called .debug().
    get isDebugMode() {
        return GM_getValue('debug-mode') === true || import.meta.env.DEV
    },
    filterVisitSign: 'bili-cleaner-filtered', // 标记视频过滤器检测过的视频
    filterHideSign: 'bili-cleaner-hide', // 标记视频过滤器隐藏的视频
}
