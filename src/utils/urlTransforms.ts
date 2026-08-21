import { matchBvid } from '@/utils/tool'
import { isPageLive, isPageSearch, isPageVideo, isPageWatchlater } from '@/utils/pageType'

/**
 * Named, world-neutral URL-cleaning functions, registered into URLHandlerInstance.cleanFnArr
 * (userscript) or dispatched by name across the MAIN/isolated bridge (extension) -- see
 * src/bridge/urlHandler.ts. Pulled out of their original inline closures in
 * video/groups/basic.ts and common/groups/basic.ts because a live function reference can't cross
 * a CustomEvent (structured-cloned, not the same JS realm); a name can.
 */
export type UrlTransformName = 'bv2av' | 'cleanParams'

/**
 * algo by bilibili-API-collect
 * @see https://www.zhihu.com/question/381784377/answer/1099438784
 * @see https://github.com/SocialSisterYi/bilibili-API-collect/issues/740
 * @see https://socialsisteryi.github.io/bilibili-API-collect/docs/misc/bvid_desc.html
 */
const bv2av = (url: string): string => {
    const XOR_CODE = 23442827791579n
    const MASK_CODE = 2251799813685247n
    const BASE = 58n
    const data = 'FcwAPNKTMug3GV5Lj7EJnHpWsx4tb8haYeviqBz6rkCy12mUSDQX9RdoZf'
    const dec = (bvid: string): number => {
        const bvidArr = Array.from<string>(bvid)
        ;[bvidArr[3], bvidArr[9]] = [bvidArr[9], bvidArr[3]]
        ;[bvidArr[4], bvidArr[7]] = [bvidArr[7], bvidArr[4]]
        bvidArr.splice(0, 3)
        const tmp = bvidArr.reduce((pre, bvidChar) => pre * BASE + BigInt(data.indexOf(bvidChar)), 0n)
        return Number((tmp & MASK_CODE) ^ XOR_CODE)
    }

    try {
        if (url.includes('bilibili.com/video/BV')) {
            const bvid = matchBvid(url)
            if (bvid) {
                // 保留query string中分P参数, anchor中reply定位
                const urlObj = new URL(url)
                const params = new URLSearchParams(urlObj.search)
                let partNum = ''
                if (params.has('p')) {
                    partNum += `?p=${params.get('p')}`
                }
                const aid = dec(bvid)
                if (partNum || urlObj.hash) {
                    return `https://www.bilibili.com/video/av${aid}/${partNum}${urlObj.hash}`
                }
                return `https://www.bilibili.com/video/av${aid}`
            }
        }
        return url
    } catch {
        return url
    }
}

/**
 * URL净化，移除query string中的跟踪参数/无用参数
 * 净化掉vd_source参数会导致充电窗口载入失败
 */
const cleanParams = (url: string): string => {
    try {
        // 直播域名各种iframe页面（天选、抽奖）和活动页特殊处理
        if (url.match(/live\.bilibili\.com\/(p\/html|activity|blackboard)/)) {
            return url
        }
        // https://www.bilibili.com/pc/community/copyright 页面过滤
        if (url.match(/bilibili\.com\/pc\/community\/copyright/)) {
            return url
        }
        const keysToRemove = new Set([
            'from_source',
            'spm_id_from',
            'search_source',
            'vd_source',
            'unique_k',
            'is_story_h5',
            'from_spmid',
            'share_plat',
            'share_medium',
            'share_from',
            'share_source',
            'share_tag',
            'up_id',
            'timestamp',
            'mid',
            'live_from',
            'launch_id',
            'session_id',
            'share_session_id',
            'broadcast_type',
            'is_room_feed',
            'spmid',
            'plat_id',
            'goto',
            'report_flow_data',
            'trackid',
            'live_form',
            'track_id',
            'from',
            'visit_id',
            'extra_jump_from',
            'buvid',
        ])
        // video page new params
        if (isPageVideo()) {
            keysToRemove.add('image_material_id')
            keysToRemove.add('creative_id')
            keysToRemove.add('biz_extra')
            keysToRemove.add('title_encode')
            keysToRemove.add('caid')
            keysToRemove.add('resource_id')
            keysToRemove.add('source_id')
            keysToRemove.add('request_id')
            keysToRemove.add('title_material_id')
            keysToRemove.add('linked_creative_id')
            keysToRemove.add('bbid')
            keysToRemove.add('ts')
            keysToRemove.add('-Arouter')
        }
        // watchlater page new params
        if (isPageWatchlater()) {
            keysToRemove.add('watchlater_cfg')
        }
        if (isPageSearch()) {
            keysToRemove.add('vt')
        }
        if (isPageLive()) {
            keysToRemove.add('bbid')
            keysToRemove.add('ts')
            keysToRemove.add('hotRank')
            keysToRemove.add('popular_rank')
        }
        const urlObj = new URL(url)
        const params = new URLSearchParams(urlObj.search)

        const temp = []
        for (const k of params.keys()) {
            keysToRemove.has(k) && temp.push(k)
        }
        for (const k of temp) {
            params.delete(k)
        }
        params.get('p') === '1' && params.delete('p')

        urlObj.search = params.toString().replace(/\/$/, '')
        return urlObj.toString()
    } catch {
        return url
    }
}

export const urlTransforms: Record<UrlTransformName, (url: string) => string> = {
    bv2av,
    cleanParams,
}
