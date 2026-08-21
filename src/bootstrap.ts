import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import { loadModules } from './modules'
import css from './style.css?style'
import { waitForBody } from './utils/init'
import { logger } from '@/utils/logger'
import { migrate } from './utils/storage'

/**
 * Extracted from main.ts so both the userscript entry (main.ts, calls bootstrap() then its own
 * menu()) and the extension's isolated-world entry (calls bootstrap() only -- menu commands
 * become chrome.contextMenus there instead) share one implementation.
 */
const mountApp = () => {
    const wrap = document.createElement('div')
    wrap.id = 'bili-cleaner'
    const root = wrap.attachShadow({ mode: 'open' })
    root.append(css)
    waitForBody().then(() => document.body.appendChild(wrap))

    const app = createApp(App as any)
    app.config.errorHandler = (err, vm, info) => {
        logger.error('Vue:', err)
        logger.error('Component:', vm)
        logger.error('Info:', info)
    }

    const pinia = createPinia()
    app.use(pinia)

    app.mount(
        (() => {
            const node = document.createElement('div')
            root.appendChild(node)
            return node
        })(),
    )
}

export const bootstrap = async () => {
    logger.info(`mode: ${import.meta.env.MODE}, url: ${location.href}`)

    await migrate().catch((err) => {
        logger.error('Storage key migration failed', err)
    })

    for (const fn of [loadModules, mountApp]) {
        try {
            fn()
        } catch (err) {
            logger.error(`bootstrap ${fn.name} error`, err)
        }
    }
}
