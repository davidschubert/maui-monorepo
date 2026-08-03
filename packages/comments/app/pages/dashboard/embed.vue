<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'

// F37 (2026-08-02): `community.embed` statt `system.manage`. Die Seite stand
// im Kunden-Dashboard, verlangte aber ein Instanz-Label — im Pool war sie
// damit für den Owner der Community unerreichbar. Die Middleware prüft BEIDE
// Quellen (Label ODER Community-Rolle, N1); die Autorität bleiben die Gates in
// server/api/admin/embed-sites/*.
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'community.embed' })

// Bau-Schalter (F37): dieselbe Antwort wie /embed selbst — ohne
// `pukalani.comments.embed.enabled` gibt es dieses Produkt in dieser App nicht,
// also auch nicht seine Verwaltungsseite. Der Menüpunkt ist schon per
// `configFlag` gebunden; das hier ist die Sperre für den direkten Aufruf.
const embedConfig = useAppConfig() as { pukalani?: { comments?: { embed?: { enabled?: boolean } } } }
if (!embedConfig.pukalani?.comments?.embed?.enabled) {
  throw createError({ status: 404, statusText: 'Not Found' })
}

const { t } = useI18n()
const toast = useToast()
const confirm = useConfirm()
useHead({ title: () => t('comments.embedAdmin.title') })

interface EmbedSiteDto { id: string, host: string, label: string, targetTypes: string[], active: boolean }

const { data, refresh } = await useFetch<{ total: number, sites: EmbedSiteDto[] }>('/api/admin/embed-sites', { lazy: true, server: false })
const sites = computed(() => data.value?.sites ?? [])

const HIDE_SM = { td: 'hidden sm:table-cell', th: 'hidden sm:table-cell' }

const columns = computed<TableColumn<EmbedSiteDto>[]>(() => [
  { accessorKey: 'host', header: () => t('comments.embedAdmin.col.host') },
  { accessorKey: 'label', header: () => t('comments.embedAdmin.col.label'), meta: { class: HIDE_SM } },
  { id: 'targets', header: () => t('comments.embedAdmin.col.targets'), meta: { class: HIDE_SM } },
  { accessorKey: 'active', header: () => t('comments.embedAdmin.col.active') },
  { id: 'actions', header: () => '' },
])

const showCreate = ref(false)
const saving = ref(false)
const form = reactive({ host: '', label: '', targetTypes: '' })

function parseTargetTypes(value: string): string[] {
  return value.split(',').map(s => s.trim()).filter(Boolean)
}

function openCreate() {
  form.host = ''
  form.label = ''
  form.targetTypes = ''
  showCreate.value = true
}

async function createSite() {
  saving.value = true
  try {
    await $fetch('/api/admin/embed-sites', {
      method: 'POST',
      body: {
        host: form.host,
        ...(form.label ? { label: form.label } : {}),
        ...(form.targetTypes ? { targetTypes: parseTargetTypes(form.targetTypes) } : {}),
      },
    })
    // Neue Sites entstehen aktiv (index.post.ts) — sonst wartet man auf einen
    // Schalter, den man gar nicht umlegen muss.
    toast.add({ title: t('comments.embedAdmin.created'), description: t('comments.embedAdmin.createdHint'), color: 'success' })
    showCreate.value = false
    await refresh()
  }
  catch {
    // Hier stand der rohe `statusMessage` der Route zuerst und der übersetzte
    // Text nur als Rückfall (Audit-Befund C12): das ist ein KUNDEN-Dashboard —
    // ein englischer Entwickler-Satz in einer deutschen Oberfläche sagt dem
    // Betreiber der Site nichts. Der Statustext fällt unter HTTP/2 ohnehin weg.
    // Im Betreiber-Werkzeug (packages/control) bleibt er bewusst vorne.
    toast.add({
      title: t('comments.embedAdmin.createFailed'),
      description: t('comments.embedAdmin.createFailedHint'),
      color: 'error',
    })
  }
  finally {
    saving.value = false
  }
}

/**
 * An/Aus läuft über USwitch (Davids UX-Regel, Audit-Befund K9) — der Schalter
 * ist ungebunden (:model-value), die Wahrheit kommt nach dem PATCH aus dem
 * refresh(). `pending` sperrt genau die laufende Zeile gegen Doppelklicks.
 */
const pending = ref<string | null>(null)

async function toggleActive(site: EmbedSiteDto) {
  pending.value = site.id
  const nowActive = !site.active
  try {
    await $fetch(`/api/admin/embed-sites/${site.id}`, { method: 'PATCH', body: { active: nowActive } })
    toast.add({
      title: t(nowActive ? 'comments.embedAdmin.enabled' : 'comments.embedAdmin.disabled'),
      // Abschalten wirkt sofort auf fremden Seiten — das sagt der Titel nicht
      description: nowActive ? undefined : t('comments.embedAdmin.disabledHint'),
      color: 'success',
    })
    await refresh()
  }
  catch {
    toast.add({ title: t('comments.embedAdmin.updateFailed'), description: t('comments.embedAdmin.updateFailedHint'), color: 'error' })
  }
  finally {
    pending.value = null
  }
}

async function removeSite(site: EmbedSiteDto) {
  try {
    const ok = await confirm({
      title: t('comments.embedAdmin.confirmDeleteTitle'),
      description: t('comments.embedAdmin.confirmDeleteText', { host: site.host }),
      confirmLabel: t('comments.embedAdmin.delete'),
      action: () => $fetch(`/api/admin/embed-sites/${site.id}`, { method: 'DELETE' }),
    })
    if (!ok) return
    toast.add({ title: t('comments.embedAdmin.deleted'), color: 'success' })
    await refresh()
  }
  catch {
    toast.add({ title: t('comments.embedAdmin.deleteFailed'), description: t('comments.embedAdmin.deleteFailedHint'), color: 'error' })
  }
}
</script>

<template>
  <UDashboardPanel id="embed-sites">
    <template #header>
      <UDashboardNavbar :title="t('comments.embedAdmin.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton icon="i-ph-plus" data-embed-sites-create :label="t('comments.embedAdmin.new')" @click="openCreate" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <p class="mb-4 text-sm text-muted">{{ t('comments.embedAdmin.subtitle') }}</p>

      <UTable :data="sites" :columns="columns" data-embed-sites-list>
        <template #host-cell="{ row }">
          <span class="font-mono font-medium" :data-embed-site="row.original.host">{{ row.original.host }}</span>
        </template>
        <template #label-cell="{ row }">
          <span class="text-sm text-muted">{{ row.original.label || '—' }}</span>
        </template>
        <template #targets-cell="{ row }">
          <span class="text-sm text-muted">
            {{ row.original.targetTypes.length ? row.original.targetTypes.join(', ') : t('comments.embedAdmin.allTargetTypes') }}
          </span>
        </template>
        <template #active-cell="{ row }">
          <USwitch
            :model-value="row.original.active"
            :disabled="pending === row.original.id"
            :aria-label="row.original.active ? t('comments.embedAdmin.disable') : t('comments.embedAdmin.enable')"
            :data-embed-site-toggle="row.original.host"
            @update:model-value="() => toggleActive(row.original)"
          />
        </template>
        <template #actions-cell="{ row }">
          <div class="flex justify-end">
            <UButton
              color="error"
              variant="ghost"
              size="xs"
              icon="i-ph-trash"
              :aria-label="t('comments.embedAdmin.delete')"
              @click="() => removeSite(row.original)"
            />
          </div>
        </template>

        <template #empty>
          <CoreEmptyState
            icon="i-ph-code"
            :title="t('comments.embedAdmin.emptyTitle')"
            :description="t('comments.embedAdmin.empty')"
            :action-label="t('comments.embedAdmin.new')"
            action-icon="i-ph-plus"
            data-embed-sites-empty
            @action="openCreate"
          />
        </template>
      </UTable>
    </template>
  </UDashboardPanel>

  <UModal v-model:open="showCreate" :title="t('comments.embedAdmin.new')">
    <template #body>
      <div class="space-y-3">
        <UFormField :label="t('comments.embedAdmin.host')" :help="t('comments.embedAdmin.hostHelp')">
          <UInput v-model="form.host" :placeholder="t('comments.embedAdmin.hostPlaceholder')" class="w-full font-mono" autofocus />
        </UFormField>
        <UFormField :label="t('comments.embedAdmin.label')">
          <UInput v-model="form.label" class="w-full" />
        </UFormField>
        <UFormField :label="t('comments.embedAdmin.targetTypes')" :help="t('comments.embedAdmin.targetTypesHelp')">
          <UInput v-model="form.targetTypes" :placeholder="t('comments.embedAdmin.targetTypesPlaceholder')" class="w-full font-mono" />
        </UFormField>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" :label="t('ui.cancel')" @click="() => { showCreate = false }" />
        <UButton :loading="saving" :disabled="!form.host" data-embed-sites-save :label="t('comments.embedAdmin.create')" @click="createSite" />
      </div>
    </template>
  </UModal>
</template>
