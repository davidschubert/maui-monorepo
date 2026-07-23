<script setup lang="ts">
import { nameToSubdomain, OPERATOR_APEX } from '../../../schemas/tenant'
import type { TenantMode, TenantStatus } from '../../../shared/types/tenantRecord'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'sites.manage' })

const { t } = useI18n()
const toast = useToast()
useHead({ title: () => t('studio.tenants.title') })

interface TenantDto { id: string, name: string, host: string, mode: TenantMode, projectId: string, tenantId: string, status: TenantStatus }

const { data, refresh } = await useFetch<{ total: number, tenants: TenantDto[] }>('/api/studio/tenants', { lazy: true, server: false })
const tenants = computed(() => data.value?.tenants ?? [])

const showCreate = ref(false)
const showAdvanced = ref(false)
const saving = ref(false)
const form = reactive({ name: '', host: '', mode: 'pool' as TenantMode, projectId: '' })
const modeItems = computed(() => [
  { label: t('studio.tenants.mode.pool'), value: 'pool' },
  { label: t('studio.tenants.mode.silo'), value: 'silo' },
])

// UX: der Name führt — die Subdomain folgt live, solange der Betreiber das
// Host-Feld nicht selbst angefasst hat (dann gewinnt seine Eingabe).
const hostTouched = ref(false)
watch(() => form.name, (name) => {
  if (hostTouched.value) return
  const slug = nameToSubdomain(name)
  form.host = slug ? `${slug}.${OPERATOR_APEX}` : ''
})

function openCreate() {
  form.name = ''
  form.host = ''
  form.mode = 'pool'
  form.projectId = ''
  hostTouched.value = false
  showAdvanced.value = false
  showCreate.value = true
}

async function createTenant() {
  saving.value = true
  try {
    await $fetch('/api/studio/tenants', {
      method: 'POST',
      body: {
        name: form.name,
        host: form.host,
        mode: form.mode,
        // leer = Server nimmt den Pool-Default (maui.studio.defaultPoolProject)
        ...(form.projectId ? { projectId: form.projectId } : {}),
      },
    })
    toast.add({ title: t('studio.tenants.created'), color: 'success' })
    showCreate.value = false
    await refresh()
  }
  catch (error) {
    toast.add({ title: t('studio.tenants.createFailed'), description: (error as { statusMessage?: string })?.statusMessage, color: 'error' })
  }
  finally {
    saving.value = false
  }
}

async function toggleStatus(tenant: TenantDto) {
  const status = tenant.status === 'active' ? 'disabled' : 'active'
  try {
    await $fetch(`/api/studio/tenants/${tenant.id}`, { method: 'PATCH', body: { status } })
    toast.add({ title: t(status === 'active' ? 'studio.tenants.enabled' : 'studio.tenants.disabled'), color: 'success' })
    await refresh()
  }
  catch {
    toast.add({ title: t('studio.tenants.updateFailed'), color: 'error' })
  }
}

async function removeTenant(tenant: TenantDto) {
  try {
    await $fetch(`/api/studio/tenants/${tenant.id}`, { method: 'DELETE' })
    toast.add({ title: t('studio.tenants.deleted'), color: 'success' })
    await refresh()
  }
  catch {
    toast.add({ title: t('studio.tenants.deleteFailed'), color: 'error' })
  }
}
</script>

<template>
  <UDashboardPanel id="tenants">
    <template #header>
      <UDashboardNavbar :title="t('studio.tenants.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton icon="i-ph-plus" data-tenants-create :label="t('studio.tenants.new')" @click="openCreate" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <p class="mb-4 text-sm text-muted">{{ t('studio.tenants.subtitle') }}</p>

      <p v-if="!tenants.length" class="py-12 text-center text-sm text-muted" data-tenants-empty>
        {{ t('studio.tenants.empty') }}
      </p>
      <div v-else class="divide-y divide-default" data-tenants-list>
        <div v-for="tenant in tenants" :key="tenant.id" class="flex flex-wrap items-center justify-between gap-3 py-4" :data-tenant="tenant.host">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <p class="font-medium">{{ tenant.name || tenant.host }}</p>
              <UBadge :color="tenant.mode === 'pool' ? 'primary' : 'neutral'" variant="subtle" size="sm">{{ tenant.mode }}</UBadge>
              <UBadge :color="tenant.status === 'active' ? 'success' : 'neutral'" variant="subtle" size="sm">{{ tenant.status }}</UBadge>
            </div>
            <p class="mt-0.5 truncate font-mono text-sm text-muted">
              <a :href="`https://${tenant.host}`" target="_blank" rel="noopener" class="hover:underline">{{ tenant.host }}</a>
              · {{ tenant.projectId }}<template v-if="tenant.tenantId"> · {{ tenant.tenantId }}</template>
            </p>
          </div>
          <div class="flex items-center gap-2">
            <UButton
              color="neutral"
              variant="outline"
              size="sm"
              :label="tenant.status === 'active' ? t('studio.tenants.disable') : t('studio.tenants.enable')"
              @click="() => toggleStatus(tenant)"
            />
            <UButton color="error" variant="soft" size="sm" icon="i-ph-trash" :aria-label="t('studio.tenants.delete')" @click="() => removeTenant(tenant)" />
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>

  <UModal v-model:open="showCreate" :title="t('studio.tenants.new')">
    <template #body>
      <div class="space-y-3">
        <UFormField :label="t('studio.tenants.name')" :help="t('studio.tenants.nameHelp')">
          <UInput v-model="form.name" :placeholder="t('studio.tenants.namePlaceholder')" class="w-full" autofocus />
        </UFormField>
        <UFormField :label="t('studio.tenants.host')" :help="t('studio.tenants.hostHelp')">
          <UInput v-model="form.host" placeholder="kunde-a.pukalani.app" class="w-full font-mono" @input="() => { hostTouched = true }" />
        </UFormField>

        <UButton
          color="neutral"
          variant="ghost"
          size="sm"
          :icon="showAdvanced ? 'i-ph-caret-up' : 'i-ph-caret-down'"
          :label="t('studio.tenants.advanced')"
          @click="() => { showAdvanced = !showAdvanced }"
        />
        <div v-if="showAdvanced" class="space-y-3 rounded-md border border-default p-3">
          <UFormField :label="t('studio.tenants.modeLabel')" :help="t('studio.tenants.modeHelp')">
            <USelect v-model="form.mode" :items="modeItems" class="w-full" />
          </UFormField>
          <UFormField :label="t('studio.tenants.project')" :help="t('studio.tenants.projectHelp')">
            <UInput v-model="form.projectId" :placeholder="t('studio.tenants.projectPlaceholder')" class="w-full font-mono" />
          </UFormField>
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" :label="t('ui.cancel')" @click="() => { showCreate = false }" />
        <UButton
          :loading="saving"
          :disabled="!form.name || !form.host || (form.mode === 'silo' && !form.projectId)"
          data-tenants-save
          :label="t('studio.tenants.create')"
          @click="createTenant"
        />
      </div>
    </template>
  </UModal>
</template>
