<script setup lang="ts">
// Workspace-Verwaltung (M8-T2, Check-in: v1 = nur Betreiber im Studio):
// Workspaces anlegen/umbenennen, Plan-/Status-Übersicht, zugeordnete Sites.
// Plan-Wechsel läuft BEWUSST nicht hier, sondern über Checkout + Fulfillment
// (T3) — plan/status sind in der PATCH-Route nicht schreibbar.
import type { WorkspaceRow } from '../../../shared/types/workspace'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'sites.manage' })

const { t } = useI18n()
const toast = useToast()
const appConfig = useAppConfig()

type WorkspaceWithSites = WorkspaceRow & { siteSlugs: string[] }
const { data, refresh } = await useFetch<{ workspaces: WorkspaceWithSites[] }>('/api/studio/workspaces')

const planFeatures = (plan: string): string[] =>
  (appConfig.maui as { studio?: { plans?: Record<string, { features: string[] }> } }).studio?.plans?.[plan]?.features ?? []

// ── Anlegen ────────────────────────────────────────────────────────────────
const showCreate = ref(false)
const form = reactive({ name: '', ownerEmail: '' })
const creating = ref(false)

async function createWorkspace() {
  creating.value = true
  try {
    await $fetch('/api/studio/workspaces', { method: 'POST', body: { ...form } })
    toast.add({ title: t('studio.workspaces.created', { name: form.name }), color: 'success' })
    showCreate.value = false
    Object.assign(form, { name: '', ownerEmail: '' })
  }
  catch (error) {
    toast.add({ title: t('studio.workspaces.createFailed'), description: (error as { statusMessage?: string })?.statusMessage, color: 'error' })
  }
  finally {
    creating.value = false
  }
  await refresh()
}

// ── Stammdaten bearbeiten ──────────────────────────────────────────────────
const editing = ref<WorkspaceWithSites | null>(null)
const editForm = reactive({ name: '', ownerEmail: '' })
const savingEdit = ref(false)

function openEdit(workspace: WorkspaceWithSites) {
  editing.value = workspace
  Object.assign(editForm, { name: workspace.name, ownerEmail: workspace.ownerEmail })
}

async function saveEdit() {
  if (!editing.value) return
  savingEdit.value = true
  try {
    await $fetch(`/api/studio/workspaces/${editing.value.$id}`, { method: 'PATCH', body: { ...editForm } })
    toast.add({ title: t('studio.workspaces.saved', { name: editForm.name }), color: 'success' })
    editing.value = null
  }
  catch (error) {
    toast.add({ title: t('studio.workspaces.saveFailed'), description: (error as { statusMessage?: string })?.statusMessage, color: 'error' })
  }
  finally {
    savingEdit.value = false
  }
  await refresh()
}

const planColor = (plan: string) => (plan === 'business' ? 'primary' : plan === 'pro' ? 'info' : 'neutral') as 'primary' | 'info' | 'neutral'
const statusColor = (s: string) => (s === 'active' ? 'success' : s === 'past_due' ? 'warning' : 'error') as 'success' | 'warning' | 'error'
</script>

<template>
  <UDashboardPanel id="workspaces">
    <template #header>
      <UDashboardNavbar :title="t('studio.workspaces.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton icon="i-ph-plus" data-workspaces-create @click="showCreate = true">
            {{ t('studio.workspaces.create') }}
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <p v-if="!data?.workspaces.length" class="py-12 text-center text-sm text-muted" data-workspaces-empty>
        {{ t('studio.workspaces.empty') }}
      </p>

      <div v-else class="divide-y divide-default" data-workspaces-list>
        <div v-for="workspace in data.workspaces" :key="workspace.$id" class="flex flex-wrap items-center justify-between gap-3 py-4" :data-workspace="workspace.name">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <p class="font-medium">{{ workspace.name }}</p>
              <UBadge :color="planColor(workspace.plan)" variant="subtle" size="sm" :data-workspace-plan="workspace.plan">{{ workspace.plan }}</UBadge>
              <UBadge :color="statusColor(workspace.status)" variant="subtle" size="sm">{{ workspace.status }}</UBadge>
            </div>
            <p class="mt-0.5 truncate text-sm text-muted">{{ workspace.ownerEmail }}</p>
            <div class="mt-1 flex flex-wrap items-center gap-1" :data-workspace-sites="workspace.siteSlugs.join(',')">
              <template v-if="workspace.siteSlugs.length">
                <UBadge v-for="slug in workspace.siteSlugs" :key="slug" color="neutral" variant="outline" size="sm">{{ slug }}</UBadge>
              </template>
              <span v-else class="text-xs text-muted">{{ t('studio.workspaces.noSites') }}</span>
            </div>
            <p class="mt-1 text-xs text-muted">
              {{ t('studio.workspaces.planFeatures') }}: {{ planFeatures(workspace.plan).join(', ') || '—' }}
            </p>
          </div>
          <div class="flex items-center gap-1">
            <UButton icon="i-ph-pencil-simple" size="sm" color="neutral" variant="ghost" :data-workspace-edit="workspace.name" @click="openEdit(workspace)">
              {{ t('studio.workspaces.edit') }}
            </UButton>
          </div>
        </div>
      </div>

      <UModal :open="showCreate" :title="t('studio.workspaces.createTitle')" @update:open="showCreate = false">
        <template #body>
          <div class="space-y-4">
            <UFormField :label="t('studio.workspaces.fieldName')"><UInput v-model="form.name" class="w-full" data-workspace-name /></UFormField>
            <UFormField :label="t('studio.workspaces.fieldOwnerEmail')" :hint="t('studio.workspaces.fieldOwnerEmailHint')">
              <UInput v-model="form.ownerEmail" type="email" class="w-full" data-workspace-email />
            </UFormField>
          </div>
        </template>
        <template #footer>
          <div class="flex w-full justify-end gap-2">
            <UButton color="neutral" variant="ghost" @click="showCreate = false">{{ t('studio.sites.cancel') }}</UButton>
            <UButton :disabled="!form.name.trim() || !form.ownerEmail.trim()" :loading="creating" data-workspace-save @click="createWorkspace">
              {{ t('studio.workspaces.create') }}
            </UButton>
          </div>
        </template>
      </UModal>

      <UModal :open="!!editing" :title="t('studio.workspaces.editTitle', { name: editing?.name ?? '' })" @update:open="editing = null">
        <template #body>
          <div class="space-y-4">
            <UFormField :label="t('studio.workspaces.fieldName')"><UInput v-model="editForm.name" class="w-full" /></UFormField>
            <UFormField :label="t('studio.workspaces.fieldOwnerEmail')"><UInput v-model="editForm.ownerEmail" type="email" class="w-full" /></UFormField>
          </div>
        </template>
        <template #footer>
          <div class="flex w-full justify-end gap-2">
            <UButton color="neutral" variant="ghost" @click="editing = null">{{ t('studio.sites.cancel') }}</UButton>
            <UButton :loading="savingEdit" @click="saveEdit">{{ t('studio.sites.save') }}</UButton>
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
