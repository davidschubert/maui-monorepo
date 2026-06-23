<script setup lang="ts">
import type { Models } from 'node-appwrite'
import type { ChangelogEntry, ChangelogListResponse } from '../../shared/types/admin'

const { t, locale } = useI18n()
const config = useRuntimeConfig()
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(locale.value, { day: '2-digit', month: 'short', year: 'numeric' })

// Anzeige je UI-Sprache mit Fallback auf die jeweils andere
function localized(entry: ChangelogEntry, field: 'title' | 'body') {
  const en = field === 'title' ? entry.titleEn : entry.bodyEn
  const de = field === 'title' ? entry.title : entry.body
  return locale.value === 'en' ? (en || de) : (de || en)
}

const entries = ref<ChangelogEntry[]>([])
const open = ref(false)
// "Zuletzt gesehen" pro Gerät — Einträge neuer als dieser Zeitstempel sind ungelesen
const seen = useCookie<string>('maui-changelog-seen', {
  default: () => '',
  maxAge: 60 * 60 * 24 * 365,
  sameSite: 'lax',
})

const unread = computed(() =>
  entries.value.filter(e => !seen.value || e.date > seen.value).length,
)

function categoryColor(c: string) {
  return c === 'fix' ? 'error' : c === 'improvement' ? 'success' : 'primary'
}

async function load() {
  try {
    const res = await $fetch<ChangelogListResponse>('/api/changelog')
    entries.value = res.entries
    // Erstbesuch: Basislinie auf den neuesten Eintrag → keine "ganze Historie"-Badge
    if (!seen.value && res.entries.length) seen.value = res.entries[0]!.date
  }
  catch {
    // still — Panel bleibt leer
  }
}

let stop: (() => void) | undefined
onMounted(() => {
  load()
  stop = useRealtimeRows<Models.Row & ChangelogEntry>(
    config.public.appwriteDatabaseId,
    'changelog',
    (ev) => {
      if (ev.type === 'create') {
        if (ev.payload.published) entries.value = [ev.payload, ...entries.value]
      }
      else {
        void load() // update/delete → neu laden
      }
    },
  )
})
onBeforeUnmount(() => stop?.())

function onToggle(value: boolean) {
  open.value = value
  // Beim Öffnen als gelesen markieren (neuester Eintrag = Basislinie)
  if (value && entries.value.length) seen.value = entries.value[0]!.date
}
</script>

<template>
  <UPopover :open="open" @update:open="onToggle">
    <UChip :show="unread > 0" :text="unread > 9 ? '9+' : unread" color="primary" size="3xl">
      <UButton icon="i-ph-megaphone" color="neutral" variant="ghost" :aria-label="t('whatsNew.title')" />
    </UChip>

    <template #content>
      <div class="max-h-[28rem] w-80 max-w-[90vw] overflow-y-auto">
        <p class="border-b border-default px-3 py-2.5 text-sm font-semibold">{{ t('whatsNew.title') }}</p>

        <p v-if="entries.length === 0" class="px-3 py-8 text-center text-sm text-muted">
          {{ t('whatsNew.empty') }}
        </p>

        <ul v-else class="divide-y divide-default">
          <li v-for="e in entries" :key="e.$id" class="px-3 py-3">
            <div class="flex flex-wrap items-center gap-1.5">
              <UBadge :color="categoryColor(e.category)" variant="subtle" size="sm">{{ t(`admin.changelog.category.${e.category || 'feature'}`) }}</UBadge>
              <span class="text-sm font-medium">{{ localized(e, 'title') }}</span>
              <UBadge v-if="e.version" color="neutral" variant="subtle" size="sm">{{ e.version }}</UBadge>
            </div>
            <p class="mt-1 whitespace-pre-line text-sm text-muted">{{ localized(e, 'body') }}</p>
            <p class="mt-1 text-xs text-dimmed">{{ fmtDate(e.date) }}</p>
          </li>
        </ul>
      </div>
    </template>
  </UPopover>
</template>
