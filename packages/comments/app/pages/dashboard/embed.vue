<script setup lang="ts">
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'system.manage' })

const { t } = useI18n()
const toast = useToast()
useHead({ title: () => t('comments.embedAdmin.title') })

interface EmbedSiteDto { id: string, host: string, label: string, targetTypes: string[], active: boolean }

const { data, refresh } = await useFetch<{ total: number, sites: EmbedSiteDto[] }>('/api/admin/embed-sites', { lazy: true, server: false })
const sites = computed(() => data.value?.sites ?? [])

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
    toast.add({ title: t('comments.embedAdmin.created'), color: 'success' })
    showCreate.value = false
    await refresh()
  }
  catch (error) {
    toast.add({ title: t('comments.embedAdmin.createFailed'), description: (error as { statusMessage?: string })?.statusMessage, color: 'error' })
  }
  finally {
    saving.value = false
  }
}

async function toggleActive(site: EmbedSiteDto) {
  try {
    await $fetch(`/api/admin/embed-sites/${site.id}`, { method: 'PATCH', body: { active: !site.active } })
    toast.add({ title: t(site.active ? 'comments.embedAdmin.disabled' : 'comments.embedAdmin.enabled'), color: 'success' })
    await refresh()
  }
  catch {
    toast.add({ title: t('comments.embedAdmin.updateFailed'), color: 'error' })
  }
}

async function removeSite(site: EmbedSiteDto) {
  try {
    await $fetch(`/api/admin/embed-sites/${site.id}`, { method: 'DELETE' })
    toast.add({ title: t('comments.embedAdmin.deleted'), color: 'success' })
    await refresh()
  }
  catch {
    toast.add({ title: t('comments.embedAdmin.deleteFailed'), color: 'error' })
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

      <p v-if="!sites.length" class="py-12 text-center text-sm text-muted" data-embed-sites-empty>
        {{ t('comments.embedAdmin.empty') }}
      </p>
      <div v-else class="divide-y divide-default" data-embed-sites-list>
        <div v-for="site in sites" :key="site.id" class="flex flex-wrap items-center justify-between gap-3 py-4" :data-embed-site="site.host">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <p class="font-medium font-mono">{{ site.host }}</p>
              <UBadge :color="site.active ? 'success' : 'neutral'" variant="subtle" size="sm">
                {{ site.active ? t('comments.embedAdmin.activeBadge') : t('comments.embedAdmin.inactiveBadge') }}
              </UBadge>
            </div>
            <p class="mt-0.5 truncate text-sm text-muted">
              <template v-if="site.label">{{ site.label }} · </template>
              {{ site.targetTypes.length ? site.targetTypes.join(', ') : t('comments.embedAdmin.allTargetTypes') }}
            </p>
          </div>
          <div class="flex items-center gap-2">
            <UButton
              color="neutral"
              variant="outline"
              size="sm"
              :label="site.active ? t('comments.embedAdmin.disable') : t('comments.embedAdmin.enable')"
              @click="() => toggleActive(site)"
            />
            <UButton color="error" variant="soft" size="sm" icon="i-ph-trash" :aria-label="t('comments.embedAdmin.delete')" @click="() => removeSite(site)" />
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>

  <UModal v-model:open="showCreate" :title="t('comments.embedAdmin.new')">
    <template #body>
      <div class="space-y-3">
        <UFormField :label="t('comments.embedAdmin.host')" :help="t('comments.embedAdmin.hostHelp')">
          <UInput v-model="form.host" placeholder="blog.kunde.de" class="w-full font-mono" autofocus />
        </UFormField>
        <UFormField :label="t('comments.embedAdmin.label')">
          <UInput v-model="form.label" class="w-full" />
        </UFormField>
        <UFormField :label="t('comments.embedAdmin.targetTypes')" :help="t('comments.embedAdmin.targetTypesHelp')">
          <UInput v-model="form.targetTypes" placeholder="blog, page" class="w-full font-mono" />
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
