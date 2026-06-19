<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { SessionRow } from '../../shared/types/session'

defineProps<{ sessions: SessionRow[] }>()

const { t, locale } = useI18n()
const slots = useSlots()

function browserIcon(clientName: string): string {
  return clientName.toLowerCase().includes('chrome') ? 'i-ph-google-chrome-logo' : 'i-ph-browser'
}
function osIcon(osName: string): string {
  const os = osName.toLowerCase()
  if (os.includes('mac') || os.includes('os x') || os.includes('ios')) return 'i-ph-apple-logo'
  if (os.includes('windows')) return 'i-ph-windows-logo'
  if (os.includes('android')) return 'i-ph-android-logo'
  if (os.includes('linux') || os.includes('ubuntu') || os.includes('debian')) return 'i-ph-linux-logo'
  return 'i-ph-desktop'
}
function browserLabel(s: SessionRow): string {
  return [s.clientName, s.clientVersion].filter(Boolean).join(' ').trim()
}
function osLabel(s: SessionRow): string {
  return [s.osName, s.osVersion].filter(Boolean).join(' ').trim()
}
function dateTime(iso: string): string {
  return new Date(iso).toLocaleString(locale.value, { dateStyle: 'medium', timeStyle: 'short' })
}

const columns = computed<TableColumn<SessionRow>[]>(() => [
  { accessorKey: 'client', header: () => t('account.sessions.client') },
  { accessorKey: 'location', header: () => t('account.sessions.location') },
  { accessorKey: 'ip', header: () => t('account.sessions.ip') },
  { accessorKey: 'created', header: () => t('account.sessions.created') },
  { accessorKey: 'updated', header: () => t('account.sessions.updated') },
  ...(slots.actions ? [{ id: 'actions', header: () => '' }] : []),
])
</script>

<template>
  <UTable :data="sessions" :columns="columns">
    <template #client-cell="{ row }">
      <div class="flex flex-col gap-1">
        <div class="flex flex-wrap items-center gap-1.5">
          <UIcon :name="browserIcon(row.original.clientName)" class="size-4 shrink-0 text-muted" />
          <span class="font-medium">{{ browserLabel(row.original) || t('account.sessions.unknown') }}</span>
          <UBadge v-if="row.original.current" color="success" variant="subtle" size="sm">{{ t('account.sessions.current') }}</UBadge>
        </div>
        <div v-if="osLabel(row.original)" class="flex items-center gap-1.5 text-xs text-muted">
          <UIcon :name="osIcon(row.original.osName)" class="size-3.5 shrink-0" />
          <span>{{ osLabel(row.original) }}</span>
        </div>
      </div>
    </template>
    <template #location-cell="{ row }">
      <span :class="row.original.countryName ? '' : 'text-muted'">{{ row.original.countryName || t('account.sessions.unknown') }}</span>
    </template>
    <template #ip-cell="{ row }">
      <span class="font-mono text-muted">{{ row.original.ip || '—' }}</span>
    </template>
    <template #created-cell="{ row }">
      <span class="whitespace-nowrap text-muted">{{ dateTime(row.original.$createdAt) }}</span>
    </template>
    <template #updated-cell="{ row }">
      <span class="whitespace-nowrap text-muted">{{ dateTime(row.original.$updatedAt) }}</span>
    </template>
    <template #actions-cell="{ row }">
      <div class="flex justify-end">
        <slot name="actions" :session="row.original" />
      </div>
    </template>
  </UTable>
</template>
