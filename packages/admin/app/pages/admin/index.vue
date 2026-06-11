<script setup lang="ts">
import type { AdminStats } from '../../../shared/types/admin'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'] })

const { t } = useI18n()
const { data: stats } = await useFetch<AdminStats>('/api/admin/stats')

const cards = computed(() => [
  { label: t('admin.stats.users'), value: stats.value?.usersTotal ?? 0, icon: 'i-ph-users', to: '/admin/users' },
  { label: t('admin.stats.comments'), value: stats.value?.commentsTotal ?? 0, icon: 'i-ph-chat-circle', to: '/admin/comments' },
  { label: t('admin.stats.reported'), value: stats.value?.commentsReported ?? 0, icon: 'i-ph-flag', to: '/admin/comments?status=reported' },
])
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-2xl font-bold">{{ t('admin.nav.overview') }}</h1>

    <div class="grid gap-4 sm:grid-cols-3" data-stat-cards>
      <UCard v-for="card in cards" :key="card.label">
        <NuxtLink :to="card.to" class="flex items-center gap-3">
          <UIcon :name="card.icon" class="size-8 text-primary" />
          <div>
            <p class="text-2xl font-bold tabular-nums">{{ card.value }}</p>
            <p class="text-sm text-muted">{{ card.label }}</p>
          </div>
        </NuxtLink>
      </UCard>
    </div>
  </div>
</template>
