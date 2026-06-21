<script setup lang="ts">
import type { Models } from 'node-appwrite'
import type { AdminAnalytics, AdminStats } from '../../../shared/types/admin'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'] })

const { t } = useI18n()
const localePath = useLocalePath()
const config = useRuntimeConfig()
const { data: stats, refresh: refreshStats } = await useFetch<AdminStats>('/api/admin/stats')

const days = ref(30)
const { data: analytics, refresh: refreshAnalytics } = await useFetch<AdminAnalytics>('/api/admin/analytics', {
  query: computed(() => ({ days: days.value })),
})

// Live: Kennzahlen (Kommentare/Gemeldet) + Chart bei Kommentar-Events nachziehen.
// Userzahl ändert sich nur bei Signups (keine Table) → bleibt bis Reload.
let liveTimer: ReturnType<typeof setTimeout> | undefined
useRealtimeRows<Models.Row>(config.public.appwriteDatabaseId, 'comments', () => {
  clearTimeout(liveTimer)
  liveTimer = setTimeout(() => { void refreshStats(); void refreshAnalytics() }, 500)
})
onScopeDispose(() => clearTimeout(liveTimer))

const rangeItems = computed(() => [7, 30, 90].map(d => ({
  label: t('admin.analytics.subtitle', { days: d }),
  value: d,
})))

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
      <div class="mx-auto flex w-full flex-col gap-4 sm:gap-6 lg:max-w-3xl">
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
              <h2 class="font-semibold">{{ t('admin.analytics.title') }}</h2>
              <USelect v-model="days" :items="rangeItems" size="sm" class="w-40" />
            </div>
          </template>

          <AnalyticsTrendChart
            :points="analytics.points"
            :users-label="t('admin.analytics.users')"
            :comments-label="t('admin.analytics.comments')"
            :users-total="analytics.usersInRange"
            :comments-total="analytics.commentsInRange"
            :today-label="t('admin.analytics.today')"
          />
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
