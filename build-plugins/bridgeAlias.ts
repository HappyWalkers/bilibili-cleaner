import { fileURLToPath, URL } from 'node:url'
import type { Plugin } from 'vite'

/**
 * Resolves `#bridge/<name>` to `src/bridge/<name>.userscript.ts` or
 * `src/bridge/<name>.extension.ts` depending on which vite config loads this plugin -- the
 * per-target-swap mechanism for code that has to behave differently in the two builds (real
 * unsafeWindow-touching logic vs. a CustomEvent dispatch to the MAIN-world script that has it).
 * Consumer files (e.g. video/groups/basic.ts) import the generic `#bridge/<name>` specifier and
 * never know which variant they got -- only the two files under src/bridge/ and this plugin do.
 */
export function bridgeAlias(variant: 'userscript' | 'extension'): Plugin {
    const bridgeDir = fileURLToPath(new URL('../src/bridge', import.meta.url))
    return {
        name: `bridge-alias-${variant}`,
        enforce: 'pre',
        resolveId(source) {
            if (!source.startsWith('#bridge/')) return null
            const name = source.slice('#bridge/'.length)
            return `${bridgeDir}/${name}.${variant}.ts`
        },
    }
}
