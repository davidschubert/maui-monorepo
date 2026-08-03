<script setup lang="ts">
/**
 * Board-Einstellungen (Modal): KI-Modell für die Triage zur Laufzeit
 * wechseln — kuratierte OpenRouter-Auswahl + frei eintippbare Modell-Id
 * (create-item). Leeren/Zurücksetzen = Build-Default aus pukalani.tickets.ai.
 * Persistenz: app_config.ticketsAiModel (system-015) über die
 * tickets-Settings-Routen.
 *
 * ZWEI HÜRDEN (Paritäts-Audit 2026-08-02): das Modal ÖFFNEN/lesen darf jeder
 * mit `tickets.manage` (also auch ein Moderator), das INSTANZ-Modell umstellen
 * nur `system.manage`. Die Route ist die Autorität — `canEditModel` aus der
 * GET-Antwort sorgt nur dafür, dass niemand erst nach dem Klick einen 403
 * sieht.
 */
const open = defineModel<boolean>('open', { required: true })

const { t } = useI18n()
const toast = useToast()

interface BoardSettings { aiEnabled: boolean, model: string, defaultModel: string, canEditModel: boolean }
const settings = ref<BoardSettings | null>(null)
const model = ref('')
const saving = ref(false)

// Kuratierte Auswahl (OpenRouter-Ids) — eigene Ids per Eintippen (create-item)
const KNOWN_MODELS = [
  'anthropic/claude-haiku-4.5',
  'anthropic/claude-sonnet-4.5',
  'anthropic/claude-opus-4.1',
  'openai/gpt-4o-mini',
  'openai/gpt-4o',
  'google/gemini-2.5-flash',
  'google/gemini-2.5-pro',
  'meta-llama/llama-3.3-70b-instruct',
  'deepseek/deepseek-chat',
]
const items = ref<string[]>([...KNOWN_MODELS])

/** Vor dem ersten Laden nichts anbieten — die Route entscheidet, nicht die UI. */
const canEdit = computed(() => settings.value?.canEditModel === true)

watch(open, async (value) => {
  if (!value) return
  try {
    settings.value = await $fetch<BoardSettings>('/api/tickets/settings')
    model.value = settings.value.model
    if (model.value && !items.value.includes(model.value)) items.value.unshift(model.value)
  }
  catch {
    toast.add({ title: t('tickets.errors.action'), description: t('tickets.settings.loadFailed'), color: 'error' })
    open.value = false
  }
})

function onCreate(value: string) {
  const id = value.trim()
  if (!id) return
  if (!items.value.includes(id)) items.value.unshift(id)
  model.value = id
}

async function save(resetToDefault = false) {
  saving.value = true
  try {
    const res = await $fetch<{ model: string }>('/api/tickets/settings', {
      method: 'PATCH',
      body: { model: resetToDefault ? '' : model.value },
    })
    model.value = res.model
    toast.add({
      title: t('tickets.settings.saved', { model: res.model }),
      description: t('tickets.settings.savedHint'),
      color: 'success',
      icon: 'i-ph-sparkle',
    })
    open.value = false
  }
  catch {
    toast.add({ title: t('tickets.settings.invalid'), description: t('tickets.settings.invalidHint'), color: 'error' })
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" :title="t('tickets.settings.title')" :description="t('tickets.settings.description')">
    <template #body>
      <div v-if="settings" class="space-y-4" data-testid="board-settings">
        <UAlert
          v-if="!settings.aiEnabled"
          color="warning"
          variant="subtle"
          icon="i-ph-warning"
          :title="t('tickets.settings.aiDisabled')"
        />

        <UAlert
          v-if="!canEdit"
          color="neutral"
          variant="subtle"
          icon="i-ph-lock-simple"
          :title="t('tickets.settings.readOnly')"
          :description="t('tickets.settings.readOnlyHint')"
          data-testid="settings-readonly"
        />

        <UFormField :label="t('tickets.settings.model')" :help="t('tickets.settings.modelHelp')">
          <USelectMenu
            v-model="model"
            :items="items"
            create-item
            :disabled="!canEdit"
            :placeholder="t('tickets.settings.modelPlaceholder')"
            class="w-full"
            data-testid="model-select"
            @create="onCreate"
          />
        </UFormField>

        <p class="text-xs text-muted">
          {{ t('tickets.settings.defaultHint', { model: settings.defaultModel }) }}
        </p>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full items-center justify-between gap-2">
        <UButton v-if="canEdit" color="neutral" variant="ghost" size="sm" :disabled="saving" @click="save(true)">
          {{ t('tickets.settings.reset') }}
        </UButton>
        <span v-else />
        <div class="flex gap-2">
          <UButton color="neutral" variant="ghost" size="sm" @click="() => { open = false }">{{ t('ui.cancel') }}</UButton>
          <UButton v-if="canEdit" color="primary" size="sm" :loading="saving" data-testid="settings-save" @click="save()">
            {{ t('ui.save') }}
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
