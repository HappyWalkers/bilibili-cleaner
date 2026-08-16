import { ISubFilter, SelectorFn } from '@/types/filter'
import { clickbaitScorer } from '@/utils/clickbaitScorer'
import { toHalfWidth } from '@/utils/tool'

/**
 * Model-based clickbait filter.
 *
 * Same contract as KeywordFilter: check() rejects when the element should be
 * hidden. Instead of matching a regex it asks the scorer service how bait-like
 * the title is and rejects above a threshold.
 *
 * threshold is stored 0-100 (integer, UI-friendly) and compared as 0-1.
 */
export class ClickbaitFilter implements ISubFilter {
    isEnable = false
    private threshold = 0.8

    enable(): void {
        this.isEnable = true
    }

    disable(): void {
        this.isEnable = false
    }

    /** value: 0-100. Higher = more conservative (hides less). */
    setParam(value: string[] | number): void {
        const n = typeof value === 'number' ? value : Number(value?.[0])
        if (Number.isFinite(n)) {
            this.threshold = Math.min(1, Math.max(0, n / 100))
        }
    }

    getThreshold(): number {
        return this.threshold
    }

    async check(el: HTMLElement, selectorFn: SelectorFn): Promise<void> {
        if (!this.isEnable) return

        const raw = selectorFn(el)
        if (typeof raw !== 'string') return
        const title = toHalfWidth(raw).trim()
        if (!title) return

        const score = await clickbaitScorer.score(title)
        if (score >= this.threshold) {
            // reject === hide, matching KeywordFilter's contract
            throw new Error('clickbait')
        }
    }
}
