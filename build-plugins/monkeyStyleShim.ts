import type { Plugin } from 'vite'

/**
 * Replicates vite-plugin-monkey's `?style` import suffix for the extension build, which doesn't
 * use vite-plugin-monkey at all. ~15 files across src/modules/rules and bootstrap.ts do
 * `import css from './foo.scss?style'` and expect back a ready-to-append HTMLStyleElement (see
 * `_style` in node_modules/vite-plugin-monkey/dist/node/index.mjs). Rather than touch every one
 * of those call sites (which would fork them from the userscript build), redirect `?style` to
 * Vite's own built-in `?inline` (compiled CSS as a JS string -- works for .scss too, since it
 * runs after Vite's own Sass pipeline), then wrap that string in the same <style>-element shape.
 *
 * The resolved virtual id is a fully opaque `\0monkey-style:<n>` (mapped internally to the real
 * resolved id) rather than anything containing `.scss`/`?inline` -- keeping those substrings out
 * of the id is deliberate: vite:css's own load/transform hooks pattern-match on file
 * extension/query and would otherwise try to re-process this plugin's *output* (plain JS) as if
 * it were raw stylesheet source, which fails loudly (confirmed: sass choked on the trailing
 * `export default ...` line, "expected {").
 */
const SUFFIX = '?style'
const MARKER_PREFIX = '\0monkey-style:'

export function monkeyStyleShim(): Plugin {
    const idMap = new Map<string, string>()
    let counter = 0

    return {
        name: 'monkey-style-shim',
        enforce: 'pre',
        async resolveId(source, importer, options) {
            if (!source.endsWith(SUFFIX)) return null
            const real = source.slice(0, -SUFFIX.length)
            const resolved = await this.resolve(`${real}?inline`, importer, { ...options, skipSelf: true })
            if (!resolved) return null
            const virtualId = `${MARKER_PREFIX}${counter++}`
            idMap.set(virtualId, resolved.id)
            return virtualId
        },
        async load(id) {
            const real = idMap.get(id)
            if (!real) return null
            const info = await this.load({ id: real })
            const wrapped = (info.code ?? '').replace(/export default/, 'const __monkeyStyleCss =')
            return `${wrapped}
const __monkeyStyleEl = document.createElement('style')
__monkeyStyleEl.append(__monkeyStyleCss)
export default __monkeyStyleEl
`
        },
    }
}
