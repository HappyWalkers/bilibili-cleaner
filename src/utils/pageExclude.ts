/**
 * Runtime re-implementation of the userscript's @exclude list (vite.config.ts's monkey({
 * userscript: { exclude: [...] } }) block) for the extension build. MV3's exclude_matches syntax
 * can't express all of these as manifest match patterns -- a host wildcard must be the leading
 * character (`*://*.bilibili.com/*` is valid, `*://api.*.bilibili.com/*` is not, since the
 * wildcard there is mid-host) -- so instead both extension entry points call isExcludedPage() at
 * the top and bail out immediately, keeping the manifest's own `matches` broad.
 */
const EXCLUDE_PATTERNS = [
    '*://message.bilibili.com/pages/nav/header_sync',
    '*://message.bilibili.com/pages/nav/index_new_pc_sync',
    '*://data.bilibili.com/*',
    '*://cm.bilibili.com/*',
    '*://shop.bilibili.com/*',
    '*://link.bilibili.com/*',
    '*://passport.bilibili.com/*',
    '*://api.bilibili.com/*',
    '*://api.*.bilibili.com/*',
    '*://*.chat.bilibili.com/*',
    '*://member.bilibili.com/*',
    '*://www.bilibili.com/tensou/*',
    '*://www.bilibili.com/correspond/*',
    '*://live.bilibili.com/p/html/*',
    '*://live.bilibili.com/live-room-play-game-together',
    '*://www.bilibili.com/blackboard/comment-detail.html*',
    '*://www.bilibili.com/blackboard/newplayer.html*',
    '*://www.bilibili.com/appeal/*',
    '*://www.bilibili.com/toy/*',
] as const

function patternToRegExp(pattern: string): RegExp {
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`^${escaped.replace(/\*/g, '.*')}$`)
}

const EXCLUDE_REGEXPS = EXCLUDE_PATTERNS.map(patternToRegExp)

export function isExcludedPage(href: string = location.href): boolean {
    return EXCLUDE_REGEXPS.some((re) => re.test(href))
}
