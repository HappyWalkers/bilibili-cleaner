import { Item } from '@/types/item'
import { GM_getValue } from '$'
import { registerUrlTransform, cleanUrl } from '#bridge/urlHandler'
import { matchAvidBvid } from '@/utils/tool'

export const videoBasicItems: Item[] = [
    {
        type: 'switch',
        id: 'video-page-hide-fixed-header',
        name: '顶栏 滚动页面后 不再吸附顶部',
    },
    {
        type: 'switch',
        id: 'video-page-bv2av',
        name: 'BV号转AV号',
        noStyle: true,
        enableFn: async () => {
            // implementation: src/utils/urlTransforms.ts's bv2av (named so it can cross the
            // MAIN/isolated bridge in the extension build -- see #bridge/urlHandler)
            registerUrlTransform('bv2av')
            cleanUrl()
        },
    },
    {
        type: 'switch',
        id: 'video-page-simple-share',
        name: '净化分享功能',
        description: ['点击分享按钮时，复制纯净链接'],
        noStyle: true,
        // 净化分享按钮写入剪贴板内容
        enableFn: async () => {
            // 监听shareBtn出现
            let counter = 0
            const id = setInterval(() => {
                counter++
                const shareBtn = document.getElementById('share-btn-outer')
                if (shareBtn) {
                    // 新增click事件
                    // 若replace element, 会在切换视频后无法更新视频分享数量, 故直接新增click事件覆盖剪贴板
                    shareBtn.addEventListener('click', () => {
                        let title = document.querySelector(
                            '.video-info-title .video-title, #viewbox_report > h1, .video-title-href',
                        )?.textContent
                        const prefix = document.querySelector('#categoryPill')?.textContent
                        if (prefix && title && title.startsWith(prefix)) {
                            title = title.slice(prefix.length).trim()
                        }
                        if (title && !title.match(/^[（【［《「＜｛〔〖〈『].*|.*[）】］》」＞｝〕〗〉』]$/)) {
                            title = `【${title}】`
                        }
                        // 匹配av号, BV号, 分P号
                        const avbv = matchAvidBvid(location.href)
                        let domain = GM_getValue('video-page-simple-share-domain')
                        if (!domain || domain === 'disable') {
                            domain = 'www.bilibili.com/video'
                        }
                        let shareText = title ? `${title} \nhttps://${domain}/${avbv}` : `https://${domain}/${avbv}`
                        const urlObj = new URL(location.href)
                        const params = new URLSearchParams(urlObj.search)
                        if (params.has('p')) {
                            shareText += `?p=${params.get('p')}`
                        }
                        navigator.clipboard.writeText(shareText).catch(() => {})
                    })
                    clearInterval(id)
                } else if (counter > 50) {
                    clearInterval(id)
                }
            }, 200)
        },
        enableFnRunAt: 'document-end',
    },
    {
        type: 'list',
        id: 'video-page-simple-share-domain',
        name: '使用短域名分享',
        defaultValue: 'disable',
        disableValue: 'disable',
        options: [
            {
                value: 'disable',
                name: '不使用',
            },
            {
                value: 'b23.tv',
                name: 'b23.tv',
            },
            {
                value: 'bili22.cn',
                name: 'bili22.cn',
            },
            {
                value: 'bili33.cn',
                name: 'bili33.cn',
            },
            {
                value: 'bili23.cn',
                name: 'bili23.cn',
            },
            {
                value: 'bili2233.cn',
                name: 'bili2233.cn',
            },
            {
                value: 'bilibili.com',
                name: 'bilibili.com',
            },
        ],
    },
]
