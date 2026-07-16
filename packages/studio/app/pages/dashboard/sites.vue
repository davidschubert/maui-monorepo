<script setup lang="ts">
// Sites-Register (Control Plane, M6-T1): Übersicht aller Sites mit
// Lifecycle-Status + Health, manuelle Registrierung bestehender Sites.
// Der Site-Erstellungs-Flow (create-site hinter der UI) folgt in M6-T2.
import type { SiteRow } from '../../../shared/types/site'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'sites.manage' })

const { t } = useI18n()
const toast = useToast()

const { data, refresh } = await useFetch<{ sites: SiteRow[] }>('/api/studio/sites')

const showRegister = ref(false)
const form = reactive({ name: '', slug: '', projectId: '', endpoint: 'http://localhost/v1', appUrl: '' })

async function register() {
  try {
    await $fetch('/api/studio/sites', { method: 'POST', body: { ...form, appUrl: form.appUrl || undefined } })
    toast.add({ title: t('studio.sites.registered', { name: form.name }), color: 'success' })
    showRegister.value = false
    Object.assign(form, { name: '', slug: '', projectId: '', endpoint: 'http://localhost/v1', appUrl: '' })
  }
  catch (error) {
    toast.add({ title: t('studio.sites.registerFailed'), description: (error as { statusMessage?: string })?.statusMessage, color: 'error' })
  }
  await refresh()
}

const checking = ref<string | null>(null)
async function checkHealth(site: SiteRow) {
  checking.value = site.$id
  try {
    await $fetch(`/api/studio/sites/${site.$id}/health`, { method: 'POST' })
  }
  catch {
    toast.add({ title: t('studio.sites.healthFailed'), color: 'error' })
  }
  finally {
    checking.value = null
    await refresh()
  }
}

async function deregister(site: SiteRow) {
  if (!confirm(t('studio.sites.deregisterConfirm', { name: site.name }))) return
  await $fetch(`/api/studio/sites/${site.$id}`, { method: 'DELETE' }).catch(() => {
    toast.add({ title: t('studio.sites.deregisterFailed'), color: 'error' })
  })
  await refresh()
}

const healthColor = (s: string) => (s === 'ok' ? 'success' : s === 'degraded' ? 'warning' : s === 'down' ? 'error' : 'neutral') as 'success' | 'warning' | 'error' | 'neutral'
const statusColor = (s: string) => (s === 'active' ? 'success' : s === 'provisioning' ? 'info' : s === 'error' || s === 'deletion_failed' ? 'error' : 'warning') as 'success' | 'info' | 'error' | 'warning'
</script>

<template>
  <UDashboardPanel id="sites">
    <template #header>
      <UDashboardNavbar :title="t('studio.sites.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton icon="i-ph-plus" data-sites-register @click="showRegister = true">
            {{ t('studio.sites.register') }}
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <p v-if="!data?.sites.length" class="py-12 text-center text-sm text-muted" data-sites-empty>
        {{ t('studio.sites.empty') }}
      </p>

      <div v-else class="divide-y divide-default" data-sites-list>
        <div v-for="site in data.sites" :key="site.$id" class="flex flex-wrap items-center justify-between gap-3 py-4" :data-site="site.slug">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <p class="font-medium">{{ site.name }}</p>
              <UBadge :color="statusColor(site.status)" variant="subtle" size="sm">{{ site.status }}</UBadge>
              <UBadge :color="healthColor(site.healthStatus)" variant="subtle" size="sm" :data-site-health="site.healthStatus">
                {{ site.healthStatus }}
              </UBadge>
            </div>
            <p class="mt-0.5 truncate text-sm text-muted">
              {{ site.projectId }} · {{ site.endpoint }}
              <template v-if="site.appUrl"> · <a :href="site.appUrl" target="_blank" rel="noopener" class="underline">{{ site.appUrl }}</a></template>
            </p>
            <p v-if="site.healthCheckedAt" class="text-xs text-muted">
              {{ t('studio.sites.lastCheck', { at: new Date(site.healthCheckedAt).toLocaleString() }) }}
            </p>
          </div>
          <div class="flex items-center gap-1">
            <UButton icon="i-ph-heartbeat" size="sm" color="neutral" variant="ghost" :loading="checking === site.$id" :data-site-check="site.slug" @click="checkHealth(site)">
              {{ t('studio.sites.check') }}
            </UButton>
            <UButton icon="i-ph-trash" size="sm" color="error" variant="ghost" :aria-label="t('studio.sites.deregister')" @click="deregister(site)" />
          </div>
        </div>
      </div>

      <UModal :open="showRegister" :title="t('studio.sites.registerTitle')" @update:open="showRegister = false">
        <template #body>
          <div class="space-y-4">
            <UFormField :label="t('studio.sites.fieldName')"><UInput v-model="form.name" class="w-full" /></UFormField>
            <UFormField :label="t('studio.sites.fieldSlug')"><UInput v-model="form.slug" class="w-full" placeholder="photos" /></UFormField>
            <UFormField :label="t('studio.sites.fieldProjectId')" :hint="t('studio.sites.fieldProjectIdHint')"><UInput v-model="form.projectId" class="w-full" placeholder="photos-qgry" /></UFormField>
            <UFormField :label="t('studio.sites.fieldEndpoint')"><UInput v-model="form.endpoint" class="w-full" /></UFormField>
            <UFormField :label="t('studio.sites.fieldAppUrl')"><UInput v-model="form.appUrl" class="w-full" placeholder="http://localhost:3003" /></UFormField>
          </div>
        </template>
        <template #footer>
          <div class="flex w-full justify-end gap-2">
            <UButton color="neutral" variant="ghost" @click="showRegister = false">{{ t('studio.sites.cancel') }}</UButton>
            <UButton data-sites-save @click="register">{{ t('studio.sites.save') }}</UButton>
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
