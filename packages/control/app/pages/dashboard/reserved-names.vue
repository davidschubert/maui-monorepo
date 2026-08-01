<script setup lang="ts">
/**
 * Gesperrte Namen: was nie an einen Kunden gehen darf (Davids Wunsch
 * 2026-07-30).
 *
 * EINE Liste, zwei Herkünfte. Die System-Namen stehen im Code
 * (RESERVED_SUBDOMAINS) und sind unlöschbar — sie sind Teil der Architektur
 * (`login.pukalani.app` in fremder Hand wäre eine Anmeldedaten-Falle mit
 * unserem Namen und gültigem Zertifikat). Die eigenen Einträge liegen in
 * `reserved_names` (control-027) und kosten keinen Deploy.
 *
 * Sie zusammen und alphabetisch zu zeigen ist Absicht: die Frage lautet „ist
 * `presse` frei?", nicht „in welcher Quelle steht `presse`?". Die Herkunft
 * beantwortet erst die zweite Frage — welche Zeile man wieder freigeben kann.
 */
import type { TableColumn } from '@nuxt/ui'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'sites.manage' })

const { t } = useI18n()
const toast = useToast()
const confirm = useConfirm()
useHead({ title: () => t('control.reservedNames.title') })

interface CustomEntry { name: string, note: string, createdAt: string }

const { data, refresh } = await useFetch<{ system: string[], custom: CustomEntry[] }>(
  '/api/control/reserved-names',
  { lazy: true, server: false },
)

interface ReservedEntry { name: string, note: string, source: 'system' | 'custom' }

const entries = computed<ReservedEntry[]>(() => [
  ...(data.value?.system ?? []).map(name => ({ name, note: '', source: 'system' as const })),
  ...(data.value?.custom ?? []).map(row => ({ name: row.name, note: row.note, source: 'custom' as const })),
].sort((a, b) => a.name.localeCompare(b.name)))

const form = reactive({ name: '', note: '' })
const saving = ref(false)

/** Der fachliche Grund reist im Envelope als `reason` (core/server/error.ts
 *  hebt genau diesen einen Schlüssel aus `data.code`) — der HTTP-Status allein
 *  könnte „schon gesperrt" nicht von „gehört der Plattform" unterscheiden. */
function reasonOf(error: unknown): string {
  return (error as { data?: { reason?: string } })?.data?.reason ?? ''
}

async function addName() {
  if (!form.name.trim()) return
  saving.value = true
  try {
    const created = await $fetch<{ name: string }>('/api/control/reserved-names', {
      method: 'POST',
      body: { name: form.name, ...(form.note.trim() ? { note: form.note.trim() } : {}) },
    })
    toast.add({ title: t('control.reservedNames.toastAdded', { name: created.name }), color: 'success' })
    form.name = ''
    form.note = ''
    await refresh()
  }
  catch (error) {
    const reason = reasonOf(error)
    const key = reason === 'system'
      ? 'control.reservedNames.errorSystem'
      : reason === 'exists'
        ? 'control.reservedNames.errorExists'
        : 'control.reservedNames.errorInvalid'
    toast.add({ title: t(key), color: 'error' })
  }
  finally {
    saving.value = false
  }
}

/** Freigeben ist folgenreich (der Name wird ab dem nächsten Wizard-Lauf
 *  beantragbar) — deshalb dieselbe Rückfrage wie beim Löschen eines Mandanten. */
async function removeName(entry: ReservedEntry) {
  try {
    const ok = await confirm({
      title: t('control.reservedNames.deleteConfirmTitle'),
      description: t('control.reservedNames.deleteConfirmText', { name: entry.name }),
      confirmLabel: t('control.reservedNames.delete'),
      color: 'error',
      action: () => $fetch(`/api/control/reserved-names/${entry.name}`, { method: 'DELETE' }),
    })
    if (!ok) return
    toast.add({ title: t('control.reservedNames.toastDeleted', { name: entry.name }), color: 'success' })
    await refresh()
  }
  catch {
    toast.add({ title: t('control.reservedNames.deleteFailed'), description: t('control.reservedNames.deleteFailedHint'), color: 'error' })
  }
}

const columns = computed<TableColumn<ReservedEntry>[]>(() => [
  { accessorKey: 'name', header: () => t('control.reservedNames.colName') },
  { accessorKey: 'source', header: () => t('control.reservedNames.colSource') },
  { accessorKey: 'note', header: () => t('control.reservedNames.colNote') },
  { id: 'actions', header: () => '' },
])
</script>

<template>
  <UDashboardPanel id="reserved-names">
    <template #header>
      <UDashboardNavbar :title="t('control.reservedNames.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <p class="mb-4 text-sm text-muted">{{ t('control.reservedNames.help') }}</p>

      <form class="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end" @submit.prevent="addName">
        <UFormField :label="t('control.reservedNames.formName')" class="sm:w-56">
          <UInput
            v-model="form.name"
            data-reserved-name
            autocapitalize="off"
            autocorrect="off"
            spellcheck="false"
            :placeholder="t('control.reservedNames.formNamePlaceholder')"
            class="w-full font-mono"
          />
        </UFormField>
        <UFormField :label="t('control.reservedNames.formNote')" class="flex-1">
          <UInput
            v-model="form.note"
            data-reserved-note
            maxlength="200"
            :placeholder="t('control.reservedNames.formNotePlaceholder')"
            class="w-full"
          />
        </UFormField>
        <UButton
          type="submit"
          icon="i-ph-prohibit"
          data-reserved-submit
          :loading="saving"
          :disabled="!form.name.trim()"
          :label="t('control.reservedNames.formSubmit')"
        />
      </form>

      <UTable :data="entries" :columns="columns" data-reserved-list>
        <template #name-cell="{ row }">
          <code class="font-mono text-sm">{{ row.original.name }}</code>
        </template>
        <template #source-cell="{ row }">
          <UBadge :color="row.original.source === 'system' ? 'neutral' : 'primary'" variant="subtle" size="sm">
            {{ t(row.original.source === 'system' ? 'control.reservedNames.sourceSystem' : 'control.reservedNames.sourceCustom') }}
          </UBadge>
        </template>
        <template #note-cell="{ row }">
          <span v-if="row.original.note" class="text-sm text-muted">{{ row.original.note }}</span>
          <span v-else class="text-muted">—</span>
        </template>
        <template #actions-cell="{ row }">
          <div class="flex justify-end">
            <UButton
              v-if="row.original.source === 'custom'"
              icon="i-ph-trash"
              color="error"
              variant="ghost"
              size="xs"
              :aria-label="t('control.reservedNames.delete')"
              @click="removeName(row.original)"
            />
          </div>
        </template>

        <template #empty>
          <CoreEmptyState
            icon="i-ph-prohibit"
            :title="t('control.reservedNames.emptyTitle')"
            :description="t('control.reservedNames.empty')"
            data-reserved-empty
          />
        </template>
      </UTable>
    </template>
  </UDashboardPanel>
</template>
