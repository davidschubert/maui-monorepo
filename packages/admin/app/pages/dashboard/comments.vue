<script setup lang="ts">
import type { AdminCommentListResponse, ModeratedComment, ModerationFilter } from '../../../shared/types/admin'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'] })

const { t } = useI18n()
const toast = useToast()
const route = useRoute()

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

const filterItems = computed(() => FILTERS.map(value => ({
  label: t(`admin.moderation.filter.${value}`),
  value,
})))

function setFilter(value: ModerationFilter) {
  filter.value = value
  setPage(1)
}

const pending = ref<{ status: 'hidden' | 'active', comment: ModeratedComment } | null>(null)
const busy = ref(false)

async function executePending() {
  if (!pending.value) return
  busy.value = true
  try {
    await $fetch(`/api/admin/comments/${pending.value.comment.$id}/status`, {
      method: 'PATCH',
      body: { status: pending.value.status },
    })
    toast.add({
      title: t(pending.value.status === 'hidden' ? 'admin.moderation.hidden' : 'admin.moderation.restored'),
      color: 'success',
    })
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
        <template #right>
          <div class="flex gap-1" data-moderation-filter>
            <UButton
              v-for="item in filterItems"
              :key="item.value"
              size="sm"
              :color="filter === item.value ? 'primary' : 'neutral'"
              :variant="filter === item.value ? 'soft' : 'ghost'"
              @click="setFilter(item.value)"
            >
              {{ item.label }}
            </UButton>
          </div>
        </template>
      </UDashboardNavbar>
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
        <div class="flex items-center gap-2 text-xs text-muted">
          <span class="font-medium text-default">{{ comment.authorName }}</span>
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

        <div class="mt-3 flex gap-2">
          <UButton
            v-if="comment.status !== 'hidden' && comment.status !== 'deleted'"
            size="xs" color="error" variant="ghost" icon="i-ph-eye-slash"
            @click="pending = { status: 'hidden', comment }"
          >
            {{ t('admin.moderation.hide') }}
          </UButton>
          <UButton
            v-if="comment.status !== 'active' && comment.status !== 'deleted'"
            size="xs" color="success" variant="ghost" icon="i-ph-eye"
            @click="pending = { status: 'active', comment }"
          >
            {{ t('admin.moderation.restore') }}
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
        <p class="text-sm">
          {{ t(pending?.status === 'hidden' ? 'admin.moderation.confirmHide' : 'admin.moderation.confirmRestore', { name: pending?.comment.authorName ?? '' }) }}
        </p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="pending = null">{{ t('comments.item.cancel') }}</UButton>
          <UButton :color="pending?.status === 'hidden' ? 'error' : 'primary'" :loading="busy" @click="executePending">
            {{ t('admin.users.confirmAction') }}
          </UButton>
        </div>
      </template>
    </UModal>
    </template>
  </UDashboardPanel>
</template>
