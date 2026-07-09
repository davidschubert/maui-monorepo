<script setup lang="ts">
import type { CommunityPost, PostModerationAssist, PostModerationResponse } from '../../../shared/types/post'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'posts.moderate' })

const { t } = useI18n()
const toast = useToast()
const { formatRelativeTime } = useFormatRelativeTime()

useHead({ title: () => t('posts.moderation.title') })

const { data, status, refresh } = await useFetch<PostModerationResponse>('/api/posts/moderation', {
  lazy: true,
  server: false,
})

// Typ-Filter im Toolbar-Muster der Kommentar-Moderation (Alle/Beiträge/Umfrage/Frage)
type TypeFilter = 'all' | 'post' | 'poll' | 'question'
const TYPE_FILTERS: TypeFilter[] = ['all', 'post', 'poll', 'question']
const TYPE_ICON: Record<TypeFilter, string> = {
  all: 'i-ph-list-bullets',
  post: 'i-ph-article',
  poll: 'i-ph-chart-bar',
  question: 'i-ph-question',
}
const typeFilter = ref<TypeFilter>('all')
const filterLinks = computed(() => TYPE_FILTERS.map(value => ({
  label: t(`posts.moderation.filter.${value}`),
  icon: TYPE_ICON[value],
  active: typeFilter.value === value,
  onSelect: () => { typeFilter.value = value },
})))
const matchesType = (row: CommunityPost) => typeFilter.value === 'all' || row.type === typeFilter.value

const scheduled = computed(() => data.value?.rows.filter(row => row.status === 'scheduled' && matchesType(row)) ?? [])
const visible = computed(() => data.value?.rows.filter(row => row.status !== 'scheduled' && matchesType(row)) ?? [])

const busyId = ref('')
async function setHidden(post: CommunityPost, hide: boolean) {
  busyId.value = post.$id
  try {
    await $fetch(`/api/posts/${post.$id}/${hide ? 'hide' : 'restore'}`, { method: 'POST' })
    toast.add({ title: t(hide ? 'posts.moderation.hidden' : 'posts.moderation.restored'), color: 'success' })
    await refresh()
  }
  catch {
    toast.add({ title: t('posts.moderation.actionFailed'), color: 'error' })
  }
  finally {
    busyId.value = ''
  }
}

// KI-Assist (advisory) — Muster der Kommentar-Moderation: Einschätzung pro
// gemeldetem Post einholen, inline zeigen; Aktionen löst weiter der Mensch aus.
const assists = ref(new Map<string, PostModerationAssist>())
const assistBusy = ref('')
const assistFor = (id: string) => assists.value.get(id)

async function requestAssist(post: CommunityPost) {
  assistBusy.value = post.$id
  try {
    const result = await $fetch<PostModerationAssist>(`/api/posts/${post.$id}/assist`, { method: 'POST' })
    assists.value.set(post.$id, result)
  }
  catch {
    toast.add({ title: t('posts.moderation.assist.failed'), color: 'error' })
  }
  finally {
    assistBusy.value = ''
  }
}

function snippet(post: CommunityPost): string {
  const text = post.title || post.body
  return text.length > 120 ? `${text.slice(0, 120)}…` : text
}
</script>

<template>
  <UDashboardPanel id="posts-moderation">
    <template #header>
      <UDashboardNavbar :title="t('posts.moderation.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <UNavigationMenu :items="filterLinks" highlight class="-mx-1 flex-1" data-posts-filter />
      </UDashboardToolbar>
    </template>

    <template #body>
      <ClientOnly>
        <template #fallback>
          <div class="flex justify-center py-16"><UIcon name="i-ph-spinner" class="size-6 animate-spin text-muted" /></div>
        </template>

        <div v-if="status === 'pending' && !data" class="flex justify-center py-16">
          <UIcon name="i-ph-spinner" class="size-6 animate-spin text-muted" />
        </div>

        <div v-else class="space-y-8">
          <section v-if="scheduled.length > 0" data-mod-scheduled>
            <h2 class="mb-2 font-semibold">{{ t('posts.moderation.queue') }}</h2>
            <ul class="divide-y divide-default">
              <li v-for="post in scheduled" :key="post.$id" class="flex items-center gap-3 py-2 text-sm">
                <UIcon name="i-ph-clock" class="size-4 shrink-0 text-muted" />
                <span class="min-w-0 flex-1 truncate">{{ snippet(post) }}</span>
                <span class="shrink-0 text-xs text-muted">{{ post.authorName }}</span>
                <span class="shrink-0 text-xs text-dimmed">{{ post.scheduledAt ? formatRelativeTime(post.scheduledAt) : '' }}</span>
              </li>
            </ul>
          </section>

          <section data-mod-posts>
            <h2 class="mb-2 font-semibold">{{ t('posts.moderation.recent') }}</h2>
            <p v-if="visible.length === 0" class="text-sm text-muted">{{ t('posts.moderation.empty') }}</p>
            <ul v-else class="divide-y divide-default">
              <li v-for="post in visible" :key="post.$id" class="py-2 text-sm" :data-mod-post="post.$id">
                <div class="flex items-center gap-3">
                  <div class="min-w-0 flex-1">
                    <p class="truncate">{{ snippet(post) }}</p>
                    <p class="text-xs text-muted">
                      {{ post.authorName }} · {{ t(`posts.composer.type${post.type === 'poll' ? 'Poll' : post.type === 'question' ? 'Question' : 'Post'}`) }}
                      · {{ formatRelativeTime(post.$createdAt) }}
                    </p>
                  </div>
                  <UBadge v-if="data?.reportCounts[post.$id]" color="warning" variant="subtle" size="sm" data-mod-reported>
                    {{ t('posts.moderation.reports', { count: data.reportCounts[post.$id] }) }}
                  </UBadge>
                  <UBadge v-if="post.status === 'hidden'" color="error" variant="subtle" size="sm">
                    {{ t('posts.moderation.hiddenBadge') }}
                  </UBadge>
                  <UButton
                    v-if="data?.reportCounts[post.$id] && data?.aiAssist"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    icon="i-ph-sparkle"
                    :loading="assistBusy === post.$id"
                    :data-mod-assist="post.$id"
                    @click="requestAssist(post)"
                  >
                    {{ t('posts.moderation.assist.button') }}
                  </UButton>
                  <UButton
                    :color="post.status === 'hidden' ? 'success' : 'error'"
                    variant="ghost"
                    size="xs"
                    :icon="post.status === 'hidden' ? 'i-ph-eye' : 'i-ph-eye-slash'"
                    :loading="busyId === post.$id"
                    :data-mod-toggle="post.$id"
                    @click="setHidden(post, post.status !== 'hidden')"
                  >
                    {{ post.status === 'hidden' ? t('posts.moderation.restore') : t('posts.moderation.hide') }}
                  </UButton>
                </div>
                <UAlert
                  v-if="assistFor(post.$id)"
                  class="mt-2"
                  :color="assistFor(post.$id)!.action === 'hide' ? 'warning' : 'success'"
                  variant="subtle"
                  icon="i-ph-sparkle"
                  :title="t(`posts.moderation.assist.action.${assistFor(post.$id)!.action}`, { severity: assistFor(post.$id)!.severity })"
                  :description="assistFor(post.$id)!.assessment"
                  data-mod-assist-result
                />
              </li>
            </ul>
          </section>
        </div>
      </ClientOnly>
    </template>
  </UDashboardPanel>
</template>
