<script setup lang="ts">
import { normalizeHandle } from '../../../core/shared/handles'
import { messageErrorReason, MESSAGE_RATE_CODE } from '../../shared/messageErrors'

/**
 * „NEUE NACHRICHT" — der Einstieg über den NAMEN.
 *
 * Angesprochen wird über den Handle, nicht über eine User-Id: Handles sind je
 * Community eindeutig, sie sind das, was ein Mensch tippt, und die Suche
 * dahinter (`GET /api/handles/search`) antwortet ohnehin nur Mitgliedern. Eine
 * Auswahl aus einer Nutzerliste wäre ein Adressbuch der Community.
 *
 * Der zweite Einstieg — „Nachricht schreiben" NEBEN dem Autorennamen — ist
 * `MessageWriteButton` und führt in dieselbe Route. Davids Regel gilt:
 * geteilt wird der MECHANISMUS, nie der Einstieg.
 */
const emit = defineEmits<{ sent: [conversationId: string] }>()

const open = defineModel<boolean>('open', { required: true })

const { t } = useI18n()
const toast = useToast()

const handle = ref('')
const body = ref('')
const pending = ref(false)

/** Vorschläge aus der Handle-Suche des Cores — dieselbe Quelle wie im Editor. */
const query = computed(() => normalizeHandle(handle.value))
const { data: suggestions } = await useFetch<{ id: string, label: string }[]>('/api/handles/search', {
  query: { q: query },
  lazy: true,
  server: false,
  default: () => [],
})

async function submit() {
  if (!handle.value.trim() || !body.value.trim() || pending.value) return
  pending.value = true
  try {
    const result = await $fetch<{ conversationId: string }>('/api/messages', {
      method: 'POST',
      body: { handle: handle.value, body: body.value },
    })
    toast.add({ title: t('messages.thread.sent'), color: 'success', icon: 'i-ph-paper-plane-tilt' })
    open.value = false
    handle.value = ''
    body.value = ''
    emit('sent', result.conversationId)
  }
  catch (error) {
    // Ein unbekannter Name und eine Sperre enden im GLEICHEN Satz — sonst
    // wäre das Formular ein Verzeichnisdienst für die Mitgliederliste
    // (Konzept § 2.3).
    const reason = messageErrorReason(error)
    toast.add({
      title: reason === MESSAGE_RATE_CODE ? t('messages.thread.rateLimited') : t('messages.thread.unavailable'),
      color: 'error',
      icon: 'i-ph-warning',
    })
  }
  finally {
    pending.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" :title="t('messages.compose.title')">
    <template #body>
      <div class="space-y-4">
        <UFormField :label="t('messages.compose.recipient')" :help="t('messages.compose.recipientHint')">
          <UInput
            v-model="handle"
            :placeholder="t('messages.compose.recipientPlaceholder')"
            icon="i-ph-at"
            class="w-full"
          />
          <div v-if="suggestions.length" class="mt-2 flex flex-wrap gap-1">
            <UButton
              v-for="item in suggestions"
              :key="item.id"
              size="xs"
              color="neutral"
              variant="soft"
              :label="`@${item.label}`"
              @click="handle = item.id"
            />
          </div>
        </UFormField>

        <UFormField :label="t('messages.compose.body')">
          <!-- `immediate`: der Dialog wurde gerade geöffnet, die Absicht zu
               schreiben steht fest — der Zwischenschritt über die Textfläche
               wäre hier nur ein Flackern. -->
          <MessageBodyField
            v-model="body"
            :placeholder="t('messages.thread.placeholder')"
            immediate
          />
        </UFormField>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" :label="t('messages.compose.cancel')" @click="open = false" />
        <UButton
          :label="t('messages.compose.submit')"
          icon="i-ph-paper-plane-tilt"
          :loading="pending"
          :disabled="!handle.trim() || !body.trim()"
          @click="submit"
        />
      </div>
    </template>
  </UModal>
</template>
