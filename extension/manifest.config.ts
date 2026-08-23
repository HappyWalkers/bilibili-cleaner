import { defineManifest } from '@crxjs/vite-plugin'

// Match/exclude patterns are intentionally NOT mirrored here as manifest `matches`/
// `exclude_matches` -- MV3's match-pattern grammar rejects some of the userscript's real exclude
// patterns (e.g. `*://api.*.bilibili.com/*`, wildcard not in leading position). Both content
// scripts match `*://*.bilibili.com/*` broadly and re-implement the exact same exclude list as a
// runtime `location.href` check at their own entry point instead (see src/utils/pageExclude.ts).
//
// version is hand-kept in sync with vite.config.ts's userscript.version (package.json's own
// version field is unrelated -- it's stuck at the vite-scaffolded "0.0.0" default).
export default defineManifest({
    manifest_version: 3,
    name: 'bilibili 标题党过滤器 (AI)',
    version: '2.2.0',
    description: '在 bilibili 页面净化大师基础上，用 XLM-RoBERTa 模型替代关键词匹配来过滤标题党视频',
    permissions: ['storage', 'contextMenus'],
    host_permissions: ['https://huggingface.co/*'],
    // Original design (not derived from images/logo.png, which is a wordmark -- no square mark
    // to crop out of it): a plain funnel/filter glyph, white on bilibili-blue (#00AEEC), no
    // bilibili trademark/mascot imagery. Source: extension/icons/icon.svg.
    icons: {
        16: 'extension/icons/icon-16.png',
        48: 'extension/icons/icon-48.png',
        128: 'extension/icons/icon-128.png',
    },
    // No default_popup on purpose -- this toolbar entry exists only so the 3 menu commands
    // (background.ts's chrome.contextMenus, contexts: ['action']) have somewhere to attach;
    // clicking the icon itself does nothing.
    action: {
        default_title: 'bilibili 标题党过滤器 (AI)',
        default_icon: {
            16: 'extension/icons/icon-16.png',
            48: 'extension/icons/icon-48.png',
            128: 'extension/icons/icon-128.png',
        },
    },
    content_security_policy: {
        extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
    },
    background: {
        service_worker: 'src/entries/background.ts',
        type: 'module',
    },
    content_scripts: [
        {
            matches: ['*://*.bilibili.com/*'],
            js: ['src/entries/isolated.ts'],
            run_at: 'document_start',
            all_frames: true,
        },
        {
            matches: ['*://*.bilibili.com/*'],
            js: ['src/entries/main-world.ts'],
            world: 'MAIN',
            run_at: 'document_start',
            all_frames: true,
        },
    ],
})
