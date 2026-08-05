<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { ReportedMessageView } from '../../../shared/types/message'

/**
 * DIE MELDE-WARTESCHLANGE der privaten Nachrichten.
 *
 * Sie ist die Bedingung dafür, dass dieser Layer `targetType: 'message'`
 * registrieren darf: ein meldbarer Typ ohne Warteschlange ist ein „Versprechen
 * ins Leere" (moderation/server/utils/reportTargets.ts). Beides oder keins.
 *
 * ── WAS HIER STEHT UND WAS NICHT ────────────────────────────────────────
 * Sichtbar ist ausschließlich die GEMELDETE Nachricht, als eingefrorene Kopie
 * aus dem Moment der Meldung — kein Verlauf, kein Kontext, auch nicht „die
 * drei davor" (Davids Entscheidung 2). Wer Kontext braucht, fragt den Melder;
 * was der freiwillig beilegt, steht im `note`-Feld seiner Meldung, das die
 * allgemeine Melde-Ansicht zeigt.
 *
 * `UTable` ist hier richtig (Davids Regel B6): das IST eine Datenliste —
 * sortierbar nach Meldezeitpunkt, mit gleichartigen Zeilen. Die Listen-Spalte
 * des Posteingangs ist es nicht und bleibt deshalb handgebaut.
 */
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'reports.moderate' })

const { t } = useI18n()
const { formatRelativeTime } = useFormatRelativeTime()

useHead({ title: () => t('messages.reports.title') })

const { data, status } = await useFetch<{ messages: ReportedMessageView[] }>(
  '/api/messages/moderation',
  { lazy: true, server: false, default: () => ({ messages: [] }) },
)

const rows = computed(() => data.value?.messages ?? [])

const columns = computed<TableColumn<ReportedMessageView>[]>(() => ([
  { accessorKey: 'authorName', header: t('messages.reports.from') },
  { accessorKey: 'recipientName', header: t('messages.reports.to') },
  { accessorKey: 'body', header: t('messages.reports.title') },
  { accessorKey: 'reportedAt', header: t('messages.reports.reportedAt') },
]))
</script>

<template>
  <UDashboardPanel id="message-reports">
    <template #header>
      <UDashboardNavbar :title="t('messages.reports.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-4">
        <UAlert
          icon="i-ph-lock-simple"
          color="neutral"
          variant="subtle"
          :description="t('messages.reports.description')"
        />

        <CoreEmptyState
          v-if="status !== 'pending' && rows.length === 0"
          icon="i-ph-flag-banner"
          :title="t('messages.reports.empty')"
        />

        <UTable
          v-else
          :data="rows"
          :columns="columns"
          :loading="status === 'pending'"
        >
          <template #authorName-cell="{ row }">
            <span class="text-sm">{{ row.original.authorName || row.original.authorId }}</span>
          </template>
          <template #recipientName-cell="{ row }">
            <span class="text-sm">{{ row.original.recipientName || row.original.recipientId }}</span>
          </template>
          <template #body-cell="{ row }">
            <!-- DER EINGEFRORENE BELEG, nie der lebende Text. Gerendert wie
                 jeder andere Inhalt (kein v-html) — es ist dasselbe
                 Markdown-Subset. -->
            <div class="max-w-xl">
              <MarkdownContent :source="row.original.body" class="text-sm" />
              <p class="mt-1 text-xs text-muted">
                {{ t('messages.reports.snapshotNote') }}
              </p>
            </div>
          </template>
          <template #reportedAt-cell="{ row }">
            <span class="text-sm text-muted">{{ formatRelativeTime(row.original.reportedAt) }}</span>
          </template>
        </UTable>
      </div>
    </template>
  </UDashboardPanel>
</template>
