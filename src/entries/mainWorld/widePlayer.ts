// MAIN-world-resident reimplementation of src/utils/widePlayer.ts -- plain `window`, no
// unsafeWindow needed (see urlHandler.ts in this directory for the general rationale). Its only
// consumer (the video playerLayout's `default-widescreen` item) is itself entirely MAIN-world
// (see playerLayoutVideo.ts), so this needs no bridge action of its own.
class WideScreenManager {
    private static instance: WideScreenManager
    private wideScreenLock = false

    private constructor() {
        let _isWide = window.isWide
        Object.defineProperty(window, 'isWide', {
            get: () => _isWide,
            set: (value: boolean) => {
                _isWide = value || this.wideScreenLock
                if (_isWide) {
                    document.documentElement?.setAttribute('player-is-wide', '')
                } else {
                    document.documentElement?.removeAttribute('player-is-wide')
                }
            },
        })
    }

    static getInstance(): WideScreenManager {
        if (!WideScreenManager.instance) {
            WideScreenManager.instance = new WideScreenManager()
        }
        return WideScreenManager.instance
    }

    lock() {
        this.wideScreenLock = true
    }

    unlock() {
        this.wideScreenLock = false
    }
}

export const wideScreenManager = WideScreenManager.getInstance()
