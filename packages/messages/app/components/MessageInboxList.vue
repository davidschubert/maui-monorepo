<script setup lang="ts">
import type { ConversationSummary } from '../../shared/types/message'

/**
 * Die Listen-Spalte des Posteingangs — Anordnung nach dem Inbox-Muster des
 * offiziellen Nuxt-UI-Dashboard-Templates (Konzept § 5): scrollende Liste,
 * Zeile = Absender + Zeit + Vorschau, `UChip` als Ungelesen-Punkt, der
 * ausgewählte Eintrag über eine farbige linke Kante.
 *
 * BEWUSST HANDGEBAUT statt `UTable` (Davids Regel B6 verlangt für DATENLISTEN
 * eine Tabelle, und der Grund gehört an die Stelle geschrieben): das hier ist
 * keine Datenliste, sondern eine Navigationsspalte. Es gibt nichts zu
 * sortieren, nichts auszuwählen und nichts zu blättern — eine Tabelle brächte
 * Kopfzeile, Spaltenbreiten und Auswahlkästchen mit, die alle keinen Zweck
 * hätten. Die MODERATIONS-Warteschlange nebenan ist eine Datenliste und
 * benutzt deshalb `UTable`.
 */
const props = defineProps<{
  conversations: ConversationSummary[]
  selectedId: string
  loading: boolean
}>()

const emit = defineEmits<{ select: [id: string] }>()

const { t } = useI18n()
const { formatRelativeTime } = useFormatRelativeTime()

function label(conversation: ConversationSummary): string {
  // Der Handle ist der Name, den ein Mensch in dieser Community tippt; der
  // Anzeigename ist der, den er sich gegeben hat. Fehlt beides, ist das Konto
  // gelöscht — dann sagen wir das, statt eine rohe Id zu zeigen.
  return conversation.partnerName || (conversation.partnerHandle ? `@${conversation.partnerHandle}` : t('messages.thread.deletedAccount'))
}
</script>

<template>
  <div class="flex h-full flex-col">
    <div v-if="props.loading" class="space-y-2 p-4">
      <USkeleton v-for="i in 5" :key="i" class="h-14 w-full" />
    </div>

    <CoreEmptyState
      v-else-if="props.conversations.length === 0"
      icon="i-ph-envelope-simple"
      :title="t('messages.inbox.empty')"
      :description="t('messages.inbox.emptyHint')"
    />

    <div v-else class="divide-y divide-default overflow-y-auto">
      <button
        v-for="conversation in props.conversations"
        :key="conversation.id"
        type="button"
        class="flex w-full items-start gap-3 border-l-2 px-4 py-3 text-left transition-colors hover:bg-elevated/50"
        :class="conversation.id === props.selectedId ? 'border-l-primary bg-elevated/50' : 'border-l-transparent'"
        @click="emit('select', conversation.id)"
      >
        <UChip :show="conversation.unread > 0" color="primary" size="sm" position="top-left">
          <!-- `UserAvatar` nimmt eine Nutzer-FORM, keine Id: das Bild steckt
               in den Account-prefs, die eine Liste nicht auflöst. Ohne Bild
               rechnet es Initialen aus dem Namen — genau der Fall hier. -->
          <UserAvatar :user="{ name: conversation.partnerName }" size="sm" />
        </UChip>

        <div class="min-w-0 flex-1">
          <div class="flex items-baseline justify-between gap-2">
            <span class="truncate text-sm font-medium" :class="conversation.unread > 0 ? 'text-highlighted' : ''">
              {{ label(conversation) }}
            </span>
            <span class="shrink-0 text-xs text-muted">
              {{ conversation.lastMessageAt ? formatRelativeTime(conversation.lastMessageAt) : '' }}
            </span>
          </div>
          <p class="truncate text-sm text-muted">
            {{ conversation.lastMessagePreview }}
          </p>
        </div>
      </button>
    </div>
  </div>
</template>
