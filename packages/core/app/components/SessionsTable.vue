<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { SessionRow } from '../../shared/types/session'

defineProps<{ sessions: SessionRow[] }>()

const { t, locale } = useI18n()
const slots = useSlots()

// browserIcon/osIcon/deviceIcon/flagIcon: geteilte Helper aus utils/clientInfo (Auto-Import)
function browserLabel(s: SessionRow): string {
  return [s.clientName, s.clientVersion].filter(Boolean).join(' ').trim()
}
function osLabel(s: SessionRow): string {
  return [s.osName, s.osVersion].filter(Boolean).join(' ').trim()
}
function engineLabel(s: SessionRow): string {
  return [s.clientEngine, s.clientEngineVersion].filter(Boolean).join(' ').trim()
}
function deviceLabel(s: SessionRow): string {
  // z. B. „smartphone · Apple iPhone" — Duplikate (brand im model) vermeiden
  const brandModel = [s.deviceBrand, s.deviceModel].filter(Boolean).join(' ').trim()
  return [s.deviceName, brandModel].filter(Boolean).join(' · ').trim()
}
function dateTime(iso: string): string {
  return new Date(iso).toLocaleString(locale.value, { dateStyle: 'medium', timeStyle: 'short' })
}

const columns = computed<TableColumn<SessionRow>[]>(() => [
  { accessorKey: 'client', header: () => t('account.sessions.client') },
  { accessorKey: 'auth', header: () => t('account.sessions.auth') },
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
        <div v-if="engineLabel(row.original)" class="flex items-center gap-1.5 text-xs text-dimmed">
          <UIcon name="i-ph-engine" class="size-3.5 shrink-0" />
          <span>{{ engineLabel(row.original) }}</span>
        </div>
        <div v-if="osLabel(row.original)" class="flex items-center gap-1.5 text-xs text-muted">
          <UIcon :name="osIcon(row.original.osName)" class="size-3.5 shrink-0" />
          <span>{{ osLabel(row.original) }}</span>
        </div>
        <div v-if="deviceLabel(row.original)" class="flex items-center gap-1.5 text-xs text-muted">
          <UIcon :name="deviceIcon(row.original.deviceName)" class="size-3.5 shrink-0" />
          <span>{{ deviceLabel(row.original) }}</span>
        </div>
      </div>
    </template>
    <template #auth-cell="{ row }">
      <div class="flex flex-col gap-1">
        <UBadge color="neutral" variant="subtle" size="sm" class="w-fit">
          <UIcon :name="row.original.provider === 'email' ? 'i-ph-envelope-simple' : 'i-ph-plugs-connected'" class="size-3.5" />
          {{ row.original.provider || '—' }}
        </UBadge>
        <UBadge v-if="row.original.factors.length" color="info" variant="subtle" size="sm" class="w-fit" :title="t('account.sessions.factors')">
          <UIcon name="i-ph-shield-check" class="size-3.5" />
          {{ row.original.factors.join(', ') }}
        </UBadge>
      </div>
    </template>
    <template #location-cell="{ row }">
      <div class="flex items-center gap-1.5">
        <UIcon :name="flagIcon(row.original.countryCode)" class="size-4 shrink-0" />
        <span :class="row.original.countryName ? '' : 'text-muted'">{{ row.original.countryName || t('account.sessions.unknown') }}</span>
      </div>
    </template>
    <template #ip-cell="{ row }">
      <span class="font-mono text-muted">{{ row.original.ip || '—' }}</span>
    </template>
    <template #created-cell="{ row }">
      <span class="whitespace-nowrap text-muted">{{ dateTime(row.original.$createdAt) }}</span>
    </template>
    <template #updated-cell="{ row }">
      <div class="flex flex-col gap-0.5">
        <span class="whitespace-nowrap text-muted">{{ dateTime(row.original.$updatedAt) }}</span>
        <span v-if="row.original.expire" class="whitespace-nowrap text-xs text-dimmed">
          {{ t('account.sessions.expires') }} {{ dateTime(row.original.expire) }}
        </span>
      </div>
    </template>
    <template #actions-cell="{ row }">
      <div class="flex justify-end">
        <slot name="actions" :session="row.original" />
      </div>
    </template>
  </UTable>
</template>
