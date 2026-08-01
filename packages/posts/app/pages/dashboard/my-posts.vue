<script setup lang="ts">
import type { DropdownMenuItem, TableColumn } from '@nuxt/ui'
import { decidePostAuthorAction } from '../../../shared/postAuthorPolicy'
import type { CommunityPost, PostMineResponse } from '../../../shared/types/post'

/**
 * „Meine Beiträge" — die Dashboard-Fläche der Capability `posts.write` (C16).
 * Ein Editor darf Beiträge verfassen, hatte im Dashboard aber nichts: die
 * Feed-Verwaltung (/dashboard/posts) verlangt `posts.moderate`.
 *
 * WARUM /dashboard/my-posts UND NICHT /dashboard/posts/mine (nachgemessen,
 * nicht vermutet): Nuxt behandelt eine Datei `posts.vue` NEBEN einem Ordner
 * `posts/` als Eltern-Route — der Ordnerinhalt wird zum KIND. Mit Nuxts
 * eigenem Routen-Baumbauer (`unrouting`, dieselbe Version wie im Build)
 * gegengeprüft:
 *
 *   dashboard/posts.vue + dashboard/posts/mine.vue
 *     → /dashboard/posts  (posts.vue)
 *         └ mine          (posts/mine.vue)     ← Kind
 *   dashboard/posts.vue + dashboard/my-posts.vue
 *     → /dashboard/my-posts                    ← eigene Route
 *     → /dashboard/posts
 *
 * `dashboard/posts.vue` ist aber eine gewöhnliche Seite ohne `<NuxtPage/>` —
 * das Kind hätte also gar keine Stelle zum Rendern und die Seite wäre still
 * leer. Aus posts.vue eine Hülle mit Sub-Navigation zu machen (Muster
 * `admin/settings.vue`) wäre möglich, aber falsch: die beiden Seiten gehören
 * VERSCHIEDENEN Zielgruppen (Moderator vs. Editor), eine gemeinsame Hülle
 * würde beiden die jeweils andere Registerkarte zeigen, die sie nicht öffnen
 * dürfen. Zwei Geschwister-Routen sind die ehrlichere Abbildung.
 */
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'posts.write' })

const { t } = useI18n()
const toast = useToast()
const confirm = useConfirm()
const localePath = useLocalePath()
const { user } = useCurrentUser()
const { formatRelativeTime } = useFormatRelativeTime()

// `useHead` wie auf JEDER Dashboard-Seite — nicht `useBrandTitle()`: das ist
// laut eigener Doku der Kopf ÖFFENTLICHER Seiten und spiegelt Titel/Text
// zusätzlich in og:*/description. Hinter dem Login teilt niemand einen Link,
// und Social-Tags für eine Verwaltungsseite wären Rauschen.
useHead({ title: () => t('posts.mine.title') })

const { data, status, refresh } = await useFetch<PostMineResponse>('/api/posts/mine', {
  lazy: true,
  server: false,
})

const rows = computed(() => data.value?.rows ?? [])

function snippet(post: CommunityPost): string {
  const text = post.title || post.body
  return text.length > 120 ? `${text.slice(0, 120)}…` : text
}

function typeLabel(post: CommunityPost): string {
  return t(`posts.composer.type${post.type === 'poll' ? 'Poll' : post.type === 'question' ? 'Question' : 'Post'}`)
}

// Autor und Typ sind Kontext — auf schmalen Schirmen fallen sie weg
// (dieselben Klassen wie in der Moderations-Tabelle).
const HIDE_MD = { td: 'hidden md:table-cell', th: 'hidden md:table-cell' }

const columns = computed<TableColumn<CommunityPost>[]>(() => [
  { id: 'post', header: () => t('posts.mine.col.post') },
  { accessorKey: 'type', header: () => t('posts.mine.col.type'), meta: { class: HIDE_MD } },
  { id: 'state', header: () => t('posts.mine.col.state') },
  { accessorKey: '$createdAt', header: () => t('posts.mine.col.date'), id: 'createdAt', meta: { class: HIDE_MD } },
  { id: 'actions', header: () => '' },
])

const busyId = ref('')

async function removePost(post: CommunityPost) {
  const ok = await confirm({
    title: t('posts.mine.confirmDeleteTitle'),
    description: t('posts.mine.confirmDeleteText'),
    confirmLabel: t('posts.mine.delete'),
    action: async () => {
      busyId.value = post.$id
      await $fetch(`/api/posts/${post.$id}`, { method: 'DELETE' })
    },
  }).catch(() => {
    toast.add({ title: t('posts.mine.deleteFailed'), description: t('posts.mine.deleteFailedHint'), color: 'error' })
    return false
  })
  busyId.value = ''
  if (!ok) return

  toast.add({ title: t('posts.mine.deleted'), description: t('posts.mine.deletedHint'), color: 'success' })
  await refresh()
}

/**
 * Zeilen-Aktionen. „Löschen" hängt an derselben puren Regel wie die Route
 * (C16) — der Server ist die Autorität, die UI bietet nur an, was auch
 * durchgeht. Gefragt wird mit der ECHTEN Betrachter-Id, nicht mit
 * `post.authorId`: die Route liefert zwar nur eigene Beiträge, aber eine
 * Prüfung, die sich ihre Eingabe selbst gibt, prüft nichts.
 * Bearbeitet wird weiter im Feed, dort steht der Beitrag im Zusammenhang
 * (die Karte hat das Formular).
 */
function rowActions(post: CommunityPost): DropdownMenuItem[][] {
  const { canDelete } = decidePostAuthorAction(
    { authorId: post.authorId, status: post.status, type: post.type },
    user.value?.$id,
  )
  const items: DropdownMenuItem[] = [
    { label: t('posts.mine.openInFeed'), icon: 'i-ph-arrow-square-out', to: localePath('/feed') },
  ]
  if (canDelete) {
    items.push({ label: t('posts.mine.delete'), icon: 'i-ph-trash', color: 'error', onSelect: () => { void removePost(post) } })
  }
  return [items]
}
</script>

<template>
  <UDashboardPanel id="posts-mine">
    <template #header>
      <UDashboardNavbar :title="t('posts.mine.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            icon="i-ph-plus"
            :to="localePath('/feed')"
            data-mine-new
          >
            {{ t('posts.mine.new') }}
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <ClientOnly>
        <template #fallback>
          <div class="flex justify-center py-16"><UIcon name="i-ph-spinner" class="size-6 animate-spin text-muted" /></div>
        </template>

        <div v-if="status === 'pending' && !data" class="flex justify-center py-16">
          <UIcon name="i-ph-spinner" class="size-6 animate-spin text-muted" />
        </div>

        <UTable v-else :data="rows" :columns="columns" data-mine-table>
          <template #post-cell="{ row }">
            <p class="max-w-md truncate" :title="row.original.title || row.original.body" :data-mine-post="row.original.$id">
              {{ snippet(row.original) }}
            </p>
          </template>
          <template #type-cell="{ row }">
            <span class="whitespace-nowrap text-sm text-muted">{{ typeLabel(row.original) }}</span>
          </template>
          <template #state-cell="{ row }">
            <UBadge v-if="row.original.status === 'hidden'" color="error" variant="subtle" size="sm">
              {{ t('posts.mine.state.hidden') }}
            </UBadge>
            <UBadge v-else-if="row.original.status === 'scheduled'" color="neutral" variant="subtle" size="sm">
              {{ t('posts.mine.state.scheduled') }}
            </UBadge>
            <UBadge v-else color="success" variant="subtle" size="sm">
              {{ t('posts.mine.state.published') }}
            </UBadge>
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
                  :aria-label="t('posts.mine.rowActions')"
                  :loading="busyId === row.original.$id"
                  :data-mine-toggle="row.original.$id"
                />
              </UDropdownMenu>
            </div>
          </template>

          <template #empty>
            <CoreEmptyState
              icon="i-ph-article"
              :title="t('posts.mine.emptyTitle')"
              :description="t('posts.mine.empty')"
              :action-label="t('posts.mine.new')"
              action-icon="i-ph-plus"
              :action-to="localePath('/feed')"
            />
          </template>
        </UTable>
      </ClientOnly>
    </template>
  </UDashboardPanel>
</template>
