<script setup lang="ts">
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'system.manage' })

interface AppConfig {
  registrationEnabled: boolean
  commentsEnabled: boolean
  maintenanceMode: boolean
  /** Core-KI-Gate (maui.ai) aktiv? → Model-Override-Feld einblenden */
  aiEnabled?: boolean
  /** Laufzeit-Override fürs KI-Modell (app_config.aiModel) — leer = Build-Default */
  aiModel?: string
  /** Build-Default (maui.ai.model) als Placeholder */
  aiDefaultModel?: string
}

const { t } = useI18n()
const toast = useToast()

const { data } = await useFetch<AppConfig>('/api/admin/config')

// Edit-Awareness: warnt, wenn ein anderer Admin dieses Formular ebenfalls offen hat.
const { editors } = useEditAwareness('config')

const state = reactive<AppConfig>({ registrationEnabled: true, commentsEnabled: true, maintenanceMode: false, aiModel: '' })
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
    // Nur die patchbaren Felder senden (aiEnabled/aiDefaultModel sind reine Anzeige)
    await $fetch('/api/admin/config', {
      method: 'PATCH',
      body: {
        registrationEnabled: state.registrationEnabled,
        commentsEnabled: state.commentsEnabled,
        maintenanceMode: state.maintenanceMode,
        aiModel: state.aiModel ?? '',
      },
    })
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
  <div class="mx-auto w-full lg:max-w-2xl">
    <UPageCard :title="t('admin.config.title')" :description="t('admin.config.description')" variant="subtle">
      <UAlert
        v-if="editors.length"
        color="warning"
        variant="subtle"
        icon="i-ph-users-three"
        class="mb-4"
        :title="t('admin.presence.alsoEditing', { names: editors.join(', ') })"
        :description="t('admin.presence.alsoEditingHint')"
      />
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

      <div v-if="data?.aiEnabled" class="mt-4 border-t border-default pt-4" data-config-ai>
        <div class="flex items-start gap-3">
          <UIcon name="i-ph-sparkle" class="mt-0.5 size-5 shrink-0 text-muted" />
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium">{{ t('admin.config.aiModel') }}</p>
            <p class="text-sm text-muted">{{ t('admin.config.aiModelDesc', { model: data?.aiDefaultModel ?? '' }) }}</p>
            <UInput
              v-model="state.aiModel"
              class="mt-2 w-full"
              :placeholder="data?.aiDefaultModel"
              data-config-ai-model
            />
          </div>
        </div>
      </div>

      <div class="mt-6 flex justify-end">
        <UButton :loading="loading" @click="save">{{ t('admin.config.save') }}</UButton>
      </div>
    </UPageCard>
  </div>
</template>
