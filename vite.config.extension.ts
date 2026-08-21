import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import { crx } from '@crxjs/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import tailwindShadowDOM from 'vite-plugin-tailwind-shadowdom'
import { bridgeAlias } from './build-plugins/bridgeAlias.ts'
import { monkeyStyleShim } from './build-plugins/monkeyStyleShim.ts'
import manifest from './extension/manifest.config.ts'

// Chrome Web Store build target -- sibling to vite.config.ts (the userscript/GitHub-Release
// build), not a replacement. Same plugins for shared behavior (Tailwind, shadow-DOM scoping,
// Vue), swapping vite-plugin-monkey's single-file userscript output for a real multi-file MV3
// extension via @crxjs/vite-plugin. Distinct outDir so neither build can ever clobber the other.
export default defineConfig({
    plugins: [
        bridgeAlias('extension'),
        monkeyStyleShim(),
        tailwindcss(),
        tailwindShadowDOM(),
        vue(),
        crx({
            manifest,
            contentScripts: {
                // world:'MAIN' scripts must be standalone IIFEs (no crxjs module loader/HMR) --
                // see @crxjs/vite-plugin's own CrxOptions docs.
                standaloneFiles: ['src/entries/main-world.ts'],
            },
        }),
    ],
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
            $: fileURLToPath(new URL('./src/shims/gmCompat.ts', import.meta.url)),
        },
    },
    css: {
        postcss: './postcss.config.js',
    },
    build: {
        outDir: 'dist-extension',
    },
})
