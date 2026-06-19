<script setup lang="ts">
import type { AdminAnalytics, AdminStats } from '../../../shared/types/admin'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'] })

const { t } = useI18n()
const localePath = useLocalePath()
const { data: stats } = await useFetch<AdminStats>('/api/admin/stats')
const { data: analytics } = await useFetch<AdminAnalytics>('/api/admin/analytics')

const cards = computed(() => [
  { label: t('admin.stats.users'), value: stats.value?.usersTotal ?? 0, icon: 'i-ph-users', to: localePath('/dashboard/users') },
  { label: t('admin.stats.comments'), value: stats.value?.commentsTotal ?? 0, icon: 'i-ph-chat-circle', to: localePath('/dashboard/comments') },
  { label: t('admin.stats.reported'), value: stats.value?.commentsReported ?? 0, icon: 'i-ph-flag', to: localePath({ path: '/dashboard/comments', query: { status: 'reported' } }) },
])
</script>

<template>
  <UDashboardPanel id="overview">
    <template #header>
      <UDashboardNavbar :title="t('admin.nav.overview')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex flex-col gap-4 sm:gap-6">
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

        <UCard v-if="analytics">
          <template #header>
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 class="font-semibold">{{ t('admin.analytics.title') }}</h2>
                <p class="text-sm text-muted">{{ t('admin.analytics.subtitle', { days: analytics.rangeDays }) }}</p>
              </div>
              <div class="flex gap-4 text-sm">
                <span><span class="font-bold tabular-nums text-primary">{{ analytics.usersInRange }}</span> <span class="text-muted">{{ t('admin.analytics.users') }}</span></span>
                <span><span class="font-bold tabular-nums text-info">{{ analytics.commentsInRange }}</span> <span class="text-muted">{{ t('admin.analytics.comments') }}</span></span>
              </div>
            </div>
          </template>

          <AnalyticsTrendChart
            :points="analytics.points"
            :users-label="t('admin.analytics.users')"
            :comments-label="t('admin.analytics.comments')"
          />
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
