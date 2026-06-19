<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'
import type { AdminCommentListResponse, ModeratedComment, ModerationFilter } from '../../../shared/types/admin'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'] })

const { t } = useI18n()
const toast = useToast()
const route = useRoute()
const localePath = useLocalePath()
const { user: me } = useCurrentUser()

const FILTERS: ModerationFilter[] = ['reported', 'hidden', 'all']

// Initial-Filter aus der Query (Stat-Cards verlinken auf ?status=reported)
const filter = ref<ModerationFilter>(
  FILTERS.includes(route.query.status as ModerationFilter)
    ? route.query.status as ModerationFilter
    : 'reported',
)
const { page, setPage } = usePagination()

const { data, refresh } = await useFetch<AdminCommentListResponse>('/api/admin/comments', {
  query: computed(() => ({ status: filter.value, page: page.value })),
})

function setFilter(value: ModerationFilter) {
  filter.value = value
  setPage(1)
}

const filterLinks = computed<NavigationMenuItem[]>(() => FILTERS.map(value => ({
  label: t(`admin.moderation.filter.${value}`),
  active: filter.value === value,
  onSelect: () => setFilter(value),
})))

type PendingAction =
  | { action: 'hidden' | 'active', comment: ModeratedComment }
  | { action: 'block', comment: ModeratedComment }

const pending = ref<PendingAction | null>(null)
const busy = ref(false)

const confirmText = computed(() => {
  if (!pending.value) return ''
  const name = pending.value.comment.authorName
  if (pending.value.action === 'block') return t('admin.users.confirm.block', { name })
  return t(pending.value.action === 'hidden' ? 'admin.moderation.confirmHide' : 'admin.moderation.confirmRestore', { name })
})

async function executePending() {
  if (!pending.value) return
  busy.value = true
  try {
    if (pending.value.action === 'block') {
      await $fetch(`/api/admin/users/${pending.value.comment.authorId}/status`, {
        method: 'PATCH',
        body: { blocked: true },
      })
      toast.add({ title: t('admin.users.blocked'), color: 'success' })
    }
    else {
      await $fetch(`/api/admin/comments/${pending.value.comment.$id}/status`, {
        method: 'PATCH',
        body: { status: pending.value.action },
      })
      toast.add({
        title: t(pending.value.action === 'hidden' ? 'admin.moderation.hidden' : 'admin.moderation.restored'),
        color: 'success',
      })
    }
    pending.value = null
    await refresh()
  }
  catch {
    toast.add({ title: t('admin.users.actionFailed'), color: 'error' })
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <UDashboardPanel id="moderation">
    <template #header>
      <UDashboardNavbar :title="`${t('admin.nav.comments')} (${data?.total ?? 0})`">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <UNavigationMenu :items="filterLinks" highlight class="-mx-1 flex-1" data-moderation-filter />
      </UDashboardToolbar>
    </template>

    <template #body>
      <p v-if="(data?.comments?.length ?? 0) === 0" class="text-sm text-muted">
      {{ t('admin.moderation.empty') }}
    </p>

    <ul v-else class="space-y-3" data-moderation-list>
      <li
        v-for="comment in data?.comments"
        :key="comment.$id"
        class="rounded-lg border border-default p-4"
        :data-moderation-id="comment.$id"
      >
        <div class="flex flex-wrap items-center gap-2 text-xs text-muted">
          <ULink :to="localePath(`/dashboard/users/${comment.authorId}`)" class="font-medium text-default hover:text-primary hover:underline">
            {{ comment.authorName }}
          </ULink>
          <span>·</span>
          <span>{{ comment.targetType }}/{{ comment.targetId }}</span>
          <span>·</span>
          <span>{{ formatDate(comment.$createdAt) }}</span>
          <UBadge
            :color="comment.status === 'reported' ? 'warning' : comment.status === 'hidden' ? 'error' : 'neutral'"
            variant="subtle"
            size="sm"
          >
            {{ t(`admin.moderation.status.${comment.status}`) }}
          </UBadge>
        </div>

        <p class="mt-2 whitespace-pre-line text-sm">{{ comment.content }}</p>

        <div class="mt-3 flex flex-wrap gap-2">
          <UButton
            v-if="comment.status !== 'hidden' && comment.status !== 'deleted'"
            size="xs" color="error" variant="ghost" icon="i-ph-eye-slash"
            @click="pending = { action: 'hidden', comment }"
          >
            {{ t('admin.moderation.hide') }}
          </UButton>
          <UButton
            v-if="comment.status !== 'active' && comment.status !== 'deleted'"
            size="xs" color="success" variant="ghost" icon="i-ph-eye"
            @click="pending = { action: 'active', comment }"
          >
            {{ t('admin.moderation.restore') }}
          </UButton>
          <UButton
            size="xs" color="error" variant="ghost" icon="i-ph-prohibit"
            :disabled="comment.authorId === me?.$id"
            @click="pending = { action: 'block', comment }"
          >
            {{ t('admin.moderation.blockAuthor') }}
          </UButton>
          <span v-if="comment.status === 'deleted'" class="text-xs italic text-muted">
            {{ t('admin.moderation.notModeratable') }}
          </span>
        </div>
      </li>
    </ul>

    <UPagination
      v-if="(data?.total ?? 0) > 25"
      :page="page"
      :total="data?.total ?? 0"
      :items-per-page="25"
      @update:page="setPage"
    />

    <UModal :open="pending !== null" :title="t('admin.users.confirmTitle')" @update:open="(value: boolean) => { if (!value) pending = null }">
      <template #body>
        <p class="text-sm">{{ confirmText }}</p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="pending = null">{{ t('comments.item.cancel') }}</UButton>
          <UButton :color="pending?.action === 'active' ? 'primary' : 'error'" :loading="busy" @click="executePending">
            {{ t('admin.users.confirmAction') }}
          </UButton>
        </div>
      </template>
    </UModal>
    </template>
  </UDashboardPanel>
</template>
