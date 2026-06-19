<script setup lang="ts">
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'] })

interface AppConfig {
  registrationEnabled: boolean
  commentsEnabled: boolean
  maintenanceMode: boolean
}

const { t } = useI18n()
const toast = useToast()

const { data } = await useFetch<AppConfig>('/api/admin/config')

const state = reactive<AppConfig>({ registrationEnabled: true, commentsEnabled: true, maintenanceMode: false })
watchEffect(() => {
  if (data.value) Object.assign(state, data.value)
})

const flags = computed(() => [
  { key: 'registrationEnabled' as const, icon: 'i-ph-user-plus' },
  { key: 'commentsEnabled' as const, icon: 'i-ph-chat-circle' },
  { key: 'maintenanceMode' as const, icon: 'i-ph-wrench', warning: true },
])

const loading = ref(false)
async function save() {
  loading.value = true
  try {
    await $fetch('/api/admin/config', { method: 'PATCH', body: { ...state } })
    toast.add({ title: t('admin.config.saved'), color: 'success' })
  }
  catch {
    toast.add({ title: t('admin.users.actionFailed'), color: 'error' })
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <UDashboardPanel id="config" :ui="{ body: 'lg:py-12' }">
    <template #header>
      <UDashboardNavbar :title="t('admin.config.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full lg:max-w-2xl">
        <UPageCard :title="t('admin.config.title')" :description="t('admin.config.description')" variant="subtle">
          <div class="divide-y divide-default">
            <div v-for="flag in flags" :key="flag.key" class="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
              <div class="flex items-start gap-3">
                <UIcon :name="flag.icon" class="mt-0.5 size-5 shrink-0" :class="flag.warning ? 'text-warning' : 'text-muted'" />
                <div>
                  <p class="text-sm font-medium">{{ t(`admin.config.${flag.key}`) }}</p>
                  <p class="text-sm text-muted">{{ t(`admin.config.${flag.key}Desc`) }}</p>
                </div>
              </div>
              <USwitch v-model="state[flag.key]" :color="flag.warning ? 'warning' : 'primary'" />
            </div>
          </div>

          <div class="mt-6 flex justify-end">
            <UButton :loading="loading" @click="save">{{ t('admin.config.save') }}</UButton>
          </div>
        </UPageCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
