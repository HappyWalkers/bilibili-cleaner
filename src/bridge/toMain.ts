/**
 * Isolated-world -> MAIN-world messaging for the extension build. Both content scripts share the
 * same document (different JS globals), so a plain CustomEvent on `document` is enough -- no
 * origin-checking boilerplate needed the way postMessage would require.
 *
 * Chrome does not guarantee isolated-before-MAIN content-script injection ordering for two
 * `content_scripts` entries at the same `run_at` -- confirmed empirically in this project's Phase
 * 1 spike, where a single immediate dispatch was reliably lost until a second one ~200ms later
 * succeeded. Rather than build a full ack/queue protocol, this fires a bounded set of blind
 * retries: every action this bridge carries (register a URL transform, switch player mode, force
 * wide-screen, etc.) is a "set to this state" call, not "increment/toggle", so redundant delivery
 * is harmless by construction -- verify that property holds for any new action added here before
 * relying on this being safe to skip an ack protocol.
 */
const RETRY_DELAYS_MS = [150, 600]

export function sendToMain(action: string, payload?: unknown): void {
    const detail = { action, payload }
    const dispatch = () => document.dispatchEvent(new CustomEvent('bcf:main', { detail }))
    dispatch()
    for (const delay of RETRY_DELAYS_MS) {
        setTimeout(dispatch, delay)
    }
}
