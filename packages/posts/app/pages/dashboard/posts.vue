<script setup lang="ts">
import type { DropdownMenuItem, TableColumn } from '@nuxt/ui'
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

function typeLabel(post: CommunityPost): string {
  return t(`posts.composer.type${post.type === 'poll' ? 'Poll' : post.type === 'question' ? 'Question' : 'Post'}`)
}

// Autor und Typ sind Kontext — auf schmalen Schirmen fallen sie weg.
const HIDE_SM = { td: 'hidden sm:table-cell', th: 'hidden sm:table-cell' }
const HIDE_MD = { td: 'hidden md:table-cell', th: 'hidden md:table-cell' }

const columns = computed<TableColumn<CommunityPost>[]>(() => [
  { id: 'post', header: () => t('posts.moderation.col.post') },
  { accessorKey: 'authorName', header: () => t('posts.moderation.col.author'), meta: { class: HIDE_SM } },
  { accessorKey: 'type', header: () => t('posts.moderation.col.type'), meta: { class: HIDE_MD } },
  { id: 'state', header: () => t('posts.moderation.col.state') },
  { accessorKey: '$createdAt', header: () => t('posts.moderation.col.date'), id: 'createdAt', meta: { class: HIDE_MD } },
  { id: 'actions', header: () => '' },
])

/** Wartende Beiträge: dieselbe Tabelle, nur ohne Aktionen (sie sind noch nicht da). */
const scheduledColumns = computed<TableColumn<CommunityPost>[]>(() => [
  { id: 'post', header: () => t('posts.moderation.col.post') },
  { accessorKey: 'authorName', header: () => t('posts.moderation.col.author'), meta: { class: HIDE_SM } },
  { id: 'scheduledAt', header: () => t('posts.moderation.col.scheduled') },
])

/**
 * Zeilen-Aktionen. Der KI-Assist bleibt an dieselben zwei Bedingungen
 * gebunden wie zuvor: gemeldeter Beitrag UND vom Server gemeldete
 * KI-Verfügbarkeit (data.aiAssist).
 */
function rowActions(post: CommunityPost): DropdownMenuItem[][] {
  const items: DropdownMenuItem[] = []
  if (data.value?.reportCounts[post.$id] && data.value?.aiAssist) {
    items.push({ label: t('posts.moderation.assist.button'), icon: 'i-ph-sparkle', onSelect: () => { void requestAssist(post) } })
  }
  items.push(post.status === 'hidden'
    ? { label: t('posts.moderation.restore'), icon: 'i-ph-eye', color: 'success', onSelect: () => { void setHidden(post, false) } }
    : { label: t('posts.moderation.hide'), icon: 'i-ph-eye-slash', color: 'error', onSelect: () => { void setHidden(post, true) } })
  return [items]
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
            <UTable :data="scheduled" :columns="scheduledColumns">
              <template #post-cell="{ row }">
                <span class="flex items-center gap-2">
                  <UIcon name="i-ph-clock" class="size-4 shrink-0 text-muted" />
                  <span class="block max-w-md truncate">{{ snippet(row.original) }}</span>
                </span>
              </template>
              <template #authorName-cell="{ row }">
                <span class="text-sm text-muted">{{ row.original.authorName }}</span>
              </template>
              <template #scheduledAt-cell="{ row }">
                <span class="whitespace-nowrap text-sm text-dimmed">
                  {{ row.original.scheduledAt ? formatRelativeTime(row.original.scheduledAt) : '—' }}
                </span>
              </template>
            </UTable>
          </section>

          <section data-mod-posts>
            <h2 class="mb-2 font-semibold">{{ t('posts.moderation.recent') }}</h2>
            <UTable :data="visible" :columns="columns">
              <template #post-cell="{ row }">
                <div class="max-w-md min-w-0" :data-mod-post="row.original.$id">
                  <p class="truncate" :title="row.original.title || row.original.body">{{ snippet(row.original) }}</p>
                  <UAlert
                    v-if="assistFor(row.original.$id)"
                    class="mt-2"
                    :color="assistFor(row.original.$id)!.action === 'hide' ? 'warning' : 'success'"
                    variant="subtle"
                    icon="i-ph-sparkle"
                    :title="t(`posts.moderation.assist.action.${assistFor(row.original.$id)!.action}`, { severity: assistFor(row.original.$id)!.severity })"
                    :description="assistFor(row.original.$id)!.assessment"
                    data-mod-assist-result
                  />
                </div>
              </template>
              <template #authorName-cell="{ row }">
                <span class="text-sm text-muted">{{ row.original.authorName }}</span>
              </template>
              <template #type-cell="{ row }">
                <span class="whitespace-nowrap text-sm text-muted">{{ typeLabel(row.original) }}</span>
              </template>
              <template #state-cell="{ row }">
                <div class="flex flex-wrap items-center gap-1">
                  <UBadge v-if="data?.reportCounts[row.original.$id]" color="warning" variant="subtle" size="sm" data-mod-reported>
                    {{ t('posts.moderation.reports', { count: data.reportCounts[row.original.$id] }) }}
                  </UBadge>
                  <UBadge v-if="row.original.status === 'hidden'" color="error" variant="subtle" size="sm">
                    {{ t('posts.moderation.hiddenBadge') }}
                  </UBadge>
                  <span v-if="!data?.reportCounts[row.original.$id] && row.original.status !== 'hidden'" class="text-muted">—</span>
                </div>
              </template>
              <template #createdAt-cell="{ row }">
                <span class="whitespace-nowrap text-sm text-muted">{{ formatRelativeTime(row.original.$createdAt) }}</span>
              </template>
              <template #actions-cell="{ row }">
                <div class="flex justify-end">
                  <UDropdownMenu :items="rowActions(row.original)" :content="{ align: 'end' }">
                    <UButton
                      icon="i-ph-dots-three-vertical"
                      color="neutral"
                      variant="ghost"
                      size="xs"
                      :aria-label="t('posts.moderation.rowActions')"
                      :loading="busyId === row.original.$id || assistBusy === row.original.$id"
                      :data-mod-toggle="row.original.$id"
                    />
                  </UDropdownMenu>
                </div>
              </template>

              <template #empty>
                <CoreEmptyState
                  v-if="typeFilter !== 'all'"
                  icon="i-ph-funnel"
                  :title="t('ui.empty.noResultsTitle')"
                  :description="t('ui.empty.noResultsText')"
                  :action-label="t('ui.empty.resetFilters')"
                  action-icon="i-ph-arrow-counter-clockwise"
                  @action="() => { typeFilter = 'all' }"
                />
                <CoreEmptyState
                  v-else
                  icon="i-ph-article"
                  :title="t('posts.moderation.emptyTitle')"
                  :description="t('posts.moderation.empty')"
                />
              </template>
            </UTable>
          </section>
        </div>
      </ClientOnly>
    </template>
  </UDashboardPanel>
</template>
