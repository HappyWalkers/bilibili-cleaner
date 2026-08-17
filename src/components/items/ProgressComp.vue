<template>
    <div v-if="state.phase !== 'idle'" class="my-1 py-1 text-black">
        <div class="flex items-center justify-between text-sm">
            <span>{{ statusText }}</span>
            <span v-if="state.phase === 'loading'" class="text-gray-500">{{ state.loadedMB }} / {{ state.totalMB }} MB</span>
        </div>
        <div v-if="state.phase === 'loading'" class="mt-1 h-2 w-full overflow-hidden rounded-full bg-gray-200">
            <div
                class="h-full rounded-full bg-[#00AEEC] transition-[width] duration-200"
                :style="{ width: state.percent + '%' }"
            ></div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { clickbaitProgress as state } from '@/utils/clickbaitProgressState'

const statusText = computed(() => {
    switch (state.phase) {
        case 'loading':
            return `正在下载 AI 模型（首次使用，约 1.1GB，仅需一次）… ${state.percent}%`
        case 'ready':
            return '✓ AI 模型已就绪'
        case 'error':
            return `模型加载失败：${state.errorMessage.slice(0, 80)}`
        default:
            return ''
    }
})
</script>
