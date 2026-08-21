import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import monkey from 'vite-plugin-monkey'
import tailwindcss from '@tailwindcss/vite'
import tailwindShadowDOM from 'vite-plugin-tailwind-shadowdom'
import { bridgeAlias } from './build-plugins/bridgeAlias.ts'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [
        bridgeAlias('userscript'),
        tailwindcss(),
        tailwindShadowDOM(),
        vue(),
        monkey({
            entry: 'src/main.ts',
            userscript: {
                name: 'bilibili 标题党过滤器 (AI)',
                namespace: 'http://tampermonkey.net/',
                version: '2.1.0',
                description:
                    '在 bilibili 页面净化大师基础上，用 XLM-RoBERTa 模型替代关键词匹配来过滤标题党视频',
                author: 'festoney8 (fork: model-based clickbait filter)',
                connect: ['127.0.0.1', 'localhost'],
                homepage: 'https://github.com/festoney8/bilibili-cleaner',
                supportURL: 'https://github.com/festoney8/bilibili-cleaner',
                license: 'MIT',
                match: ['*://*.bilibili.com/*'],
                exclude: [
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
                ],
                icon: 'https://www.bilibili.com/favicon.ico',
                'run-at': 'document-start',
            },
            // Vue is bundled rather than pulled from a CDN via @require:
            // a local-first fork should not fail to start because an external
            // host is slow or blocked.
        }),
    ],
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
        },
    },
    css: {
        postcss: './postcss.config.js',
    },
})
