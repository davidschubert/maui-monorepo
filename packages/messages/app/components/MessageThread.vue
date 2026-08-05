<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { AppwriteRow } from '../../../core/shared/types/appwrite'
import { MESSAGE_REPORT_REASONS } from '../../shared/messageReport'
import { MESSAGE_REPORT_TARGET, type ConversationThread } from '../../shared/types/message'
import { messageErrorReason, MESSAGE_RATE_CODE } from '../../shared/messageErrors'

/**
 * DER LESEBEREICH — zweite Spalte des Inbox-Musters (Konzept § 5).
 *
 * Er trägt alles, was das Template NICHT mitbringt und wegen dessen es dieses
 * Konzept gibt: MELDEN und BLOCKIEREN im Kopf-Menü, beide an echten Routen.
 * Der Anhang-Knopf des Templates ist bewusst NICHT übernommen — er sähe wie
 * ein Versprechen aus, und Anhänge sind ausgesetzt, bis es dafür ein eigenes
 * Sicherheitskonzept gibt (Konzept § 1, § 7).
 *
 * Ebenfalls nicht übernommen: „Archivieren" und „Markieren" (Dekoration ohne
 * Ziel) und die Lesebestätigung „gesehen um 14:03" — das Produkt ist kein
 * Messenger.
 */
const props = defineProps<{
  conversationId: string
}>()

const emit = defineEmits<{ sent: [], closed: [], back: [] }>()

const { t } = useI18n()
const toast = useToast()
const confirm = useConfirm()
const { formatRelativeTime } = useFormatRelativeTime()

const body = ref('')
const sending = ref(false)
const blockOpen = ref(false)

const { data, status, refresh } = await useFetch<ConversationThread>(
  () => `/api/messages/${props.conversationId}`,
  { lazy: true, server: false },
)

const thread = computed(() => data.value)
const partnerId = computed(() => thread.value?.partnerId ?? '')
const partnerLabel = computed(() => thread.value?.partnerName
  || (thread.value?.partnerHandle ? `@${thread.value.partnerHandle}` : t('messages.thread.deletedAccount')))

/**
 * „Tippt gerade" über die bestehende Presence, mit der Milderung gegen das
 * Scope-Leck (Empfänger-Id im Scope) — Begründung in
 * `shared/messagePresence.ts`.
 */
const conversationRef = computed(() => props.conversationId)
const { partnerTyping, setTyping } = useMessageTyping(conversationRef, partnerId)

/**
 * LIVE: der Verlauf läuft nach. Gefiltert auf GENAU diese Konversation — die
 * Row-Permissions sind hier die eigentliche Sicherung (der Socket liefert nur,
 * was dieser Mensch lesen darf), der `where`-Filter ist das Netz darunter.
 */
const { public: publicConfig } = useRuntimeConfig()
onMounted(() => {
  const stop = useRealtimeRows<AppwriteRow & { conversationId: string }>(
    publicConfig.appwriteDatabaseId,
    'messages',
    () => {
      void refresh()
      // Eine live eingetroffene Nachricht ist gelesen, sobald sie hier steht —
      // ohne diesen Aufruf bliebe der fettgedruckte Punkt in der Liste stehen,
      // bis jemand die Seite wechselt.
      void $fetch<{ ok: boolean }>(`/api/messages/${props.conversationId}/read`, { method: 'POST' }).catch(() => {})
    },
    { where: payload => payload.conversationId === props.conversationId },
  )
  onScopeDispose(stop)
})

const reportReasons = computed(() => MESSAGE_REPORT_REASONS.map(value => ({
  value,
  label: t(`messages.reasons.${value}`),
})))

const menuItems = computed<DropdownMenuItem[][]>(() => ([[
  {
    label: t('messages.thread.block'),
    icon: 'i-ph-prohibit',
    onSelect: () => { blockOpen.value = true },
  },
  {
    label: t('messages.thread.remove'),
    icon: 'i-ph-trash',
    onSelect: () => { void removeConversation() },
  },
]]))

async function send() {
  if (!body.value.trim() || sending.value) return
  sending.value = true
  try {
    await $fetch<{ messageId: string }>(`/api/messages/${props.conversationId}`, { method: 'POST', body: { body: body.value } })
    body.value = ''
    setTyping(false)
    await refresh()
    emit('sent')
  }
  catch (error) {
    /**
     * DIE TATSACHE, NICHT DER GRUND (Konzept § 2.3): Sperre, fehlende
     * Vertrauensstufe und abgeschalteter Empfang tragen DENSELBEN Code. Die
     * Oberfläche sagt deshalb für alle drei denselben Satz — drei
     * unterscheidbare Meldungen wären ein Auskunftsdienst darüber, wer wen
     * gesperrt hat.
     */
    const reason = messageErrorReason(error)
    toast.add({
      title: reason === MESSAGE_RATE_CODE ? t('messages.thread.rateLimited') : t('messages.thread.unavailable'),
      color: 'error',
      icon: 'i-ph-warning',
    })
  }
  finally {
    sending.value = false
  }
}

async function removeConversation() {
  if (!(await confirm({ title: t('messages.thread.remove'), description: t('messages.thread.removeConfirm') }))) return
  try {
    await $fetch<{ deleted: boolean }>(`/api/messages/${props.conversationId}`, { method: 'DELETE' })
    toast.add({ title: t('messages.thread.removed'), color: 'success', icon: 'i-ph-check' })
    emit('closed')
  }
  catch {
    toast.add({ title: t('messages.thread.removeFailed'), color: 'error', icon: 'i-ph-warning' })
  }
}
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="flex items-center gap-3 border-b border-default px-4 py-3">
      <UButton
        icon="i-ph-arrow-left"
        color="neutral"
        variant="ghost"
        class="lg:hidden"
        :aria-label="t('messages.thread.close')"
        @click="emit('back')"
      />
      <UserAvatar :user="{ name: thread?.partnerName }" size="sm" />
      <div class="min-w-0 flex-1">
        <p class="truncate text-sm font-medium">
          {{ partnerLabel }}
        </p>
        <p v-if="partnerTyping" class="text-xs text-primary">
          {{ t('messages.thread.typing') }}
        </p>
      </div>
      <UDropdownMenu :items="menuItems">
        <UButton icon="i-ph-dots-three-vertical" color="neutral" variant="ghost" />
      </UDropdownMenu>
    </div>

    <div class="flex-1 space-y-3 overflow-y-auto px-4 py-4">
      <div v-if="status === 'pending'" class="space-y-3">
        <USkeleton v-for="i in 4" :key="i" class="h-12 w-2/3" />
      </div>

      <div
        v-for="message in thread?.messages ?? []"
        :key="message.id"
        class="flex"
        :class="message.mine ? 'justify-end' : 'justify-start'"
      >
        <div
          class="max-w-[80%] rounded-lg px-3 py-2"
          :class="message.mine ? 'bg-primary/10' : 'bg-elevated'"
        >
          <!-- Derselbe Renderer wie überall: KEIN v-html, dieselbe
               Sicherheitsgrenze, dasselbe Markdown-Subset, das der Editor
               schreiben darf. -->
          <MarkdownContent :source="message.body" class="text-sm" />
          <div class="mt-1 flex items-center gap-2 text-xs text-muted">
            <span>{{ formatRelativeTime(message.createdAt) }}</span>
            <!-- MELDEN sitzt an der EINZELNEN Nachricht, nicht am Gespräch:
                 gemeldet und eingefroren wird genau eine (Davids
                 Entscheidung 2). Nur fremde — die eigene zu melden ergäbe
                 nichts. -->
            <ReportButton
              v-if="!message.mine"
              :target-type="MESSAGE_REPORT_TARGET"
              :target-id="message.id"
              :reasons="reportReasons"
              size="xs"
            />
          </div>
        </div>
      </div>
    </div>

    <div class="border-t border-default p-3">
      <UAlert
        v-if="thread?.blocked"
        icon="i-ph-prohibit"
        color="neutral"
        variant="subtle"
        :description="t('messages.thread.blocked')"
      />
      <div v-else class="space-y-2">
        <MessageBodyField
          v-model="body"
          :placeholder="t('messages.thread.placeholder')"
          :rows="2"
          @typing="setTyping(true)"
        />
        <div class="flex justify-end">
          <UButton
            icon="i-ph-paper-plane-tilt"
            :label="t('messages.thread.send')"
            :loading="sending"
            :disabled="!body.trim()"
            @click="send"
          />
        </div>
      </div>
    </div>

    <MessageBlockModal
      v-model:open="blockOpen"
      :user-id="partnerId"
      :name="partnerLabel"
      @blocked="refresh()"
    />
  </div>
</template>
