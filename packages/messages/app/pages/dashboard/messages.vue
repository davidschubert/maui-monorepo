<script setup lang="ts">
import type { ConversationSummary } from '../../../shared/types/message'
import { messageErrorReason, MESSAGES_DISABLED_CODE } from '../../../shared/messageErrors'

/**
 * DER POSTEINGANG — Anordnung nach dem Inbox-Muster des offiziellen
 * Nuxt-UI-Dashboard-Templates (Konzept § 5, dort nachgemessen):
 * `UDashboardPanel` als resizable Listen-Spalte, daneben der Lesebereich;
 * unter `lg` wandert der Lesebereich in einen `USlideover`.
 *
 * Das Template ist eine ATTRAPPE mit Beispieldaten — kein Backend, kein
 * Zustand, kein Melden, kein Blockieren, kein Realtime, keine i18n. Was es
 * spart, ist die Anordnung und der Feinschliff der Liste; alles andere steht
 * hier und in `server/`.
 *
 * ── `dashboard.access`, NICHT `messages.write` ──────────────────────────
 * Die Seite steht JEDEM Mitglied offen. EMPFANGEN geht ab Vertrauensstufe 0
 * (Konzept § 2.4, Folge 1) — wer angeschrieben wurde, muss lesen und antworten
 * können. Das Gate fürs ERÖFFNEN sitzt an der Route und zeigt sich hier nur
 * als Fehlermeldung, wenn jemand es doch versucht.
 */
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'dashboard.access' })

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

useHead({ title: () => t('messages.inbox.title') })

const selectedId = ref(String(route.query.c ?? ''))
const composeOpen = ref(false)
const showUnreadOnly = ref(false)

const { data, status, error, refresh } = await useFetch<{ conversations: ConversationSummary[] }>(
  '/api/messages',
  { lazy: true, server: false, default: () => ({ conversations: [] }) },
)

/**
 * Der Owner-Schalter schlägt bis hierher durch: ist das Produkt aus, antwortet
 * die Route 403 mit `messages_disabled`. Das ist die EINE Ablehnung, die dem
 * Menschen ihren Grund nennen darf — es ist eine Eigenschaft der Community,
 * keine Aussage über ihn (Konzept § 2.6 gegenüber § 2.3).
 */
const disabled = computed(() => messageErrorReason(error.value) === MESSAGES_DISABLED_CODE)

const conversations = computed(() => {
  const rows = data.value?.conversations ?? []
  return showUnreadOnly.value ? rows.filter(row => row.unread > 0) : rows
})

const unreadTotal = computed(() =>
  (data.value?.conversations ?? []).reduce((sum, row) => sum + row.unread, 0))

/**
 * Unter `lg` gibt es keine zweite Spalte — der Lesebereich wird zum Slideover
 * (dasselbe Verhalten wie im Template).
 *
 * MIT `matchMedia` STATT `useBreakpoints`: `@vueuse/core` steht weder in den
 * Abhängigkeiten dieses Layers noch im Katalog, und CLAUDE.md verlangt für
 * eine neue Abhängigkeit einen eigenen, bewussten Schnitt — für vier Zeilen
 * Browser-API lohnt er nicht.
 *
 * DER STARTWERT IST `false`, UND ZWAR IN BEIDEN WELTEN: der Server rendert die
 * Zwei-Spalten-Ansicht, der erste Client-Durchlauf ebenfalls (`onMounted`
 * läuft danach). Damit gibt es keinen SSR/Client-Zweigwechsel und keinen
 * Hydration-Bruch — die Ansicht klappt erst NACH der Hydration um, wenn das
 * Gerät schmal ist.
 */
const isMobile = ref(false)
onMounted(() => {
  // 1024px ist Tailwinds `lg` — dieselbe Grenze, die die Klassen im Markup
  // benutzen.
  const query = window.matchMedia('(max-width: 1023.98px)')
  const apply = () => { isMobile.value = query.matches }
  apply()
  query.addEventListener('change', apply)
  onScopeDispose(() => query.removeEventListener('change', apply))
})

function select(id: string) {
  selectedId.value = id
  // Die Auswahl steht in der URL: ein Link aus der Glocke führt genau hierher
  // (`?c=<id>`), und ein Neuladen verliert sie nicht.
  void router.replace({ query: { ...route.query, c: id } })
}

function clearSelection() {
  selectedId.value = ''
  const { c: _dropped, ...rest } = route.query
  void router.replace({ query: rest })
}

async function afterChange(conversationId?: string) {
  await refresh()
  if (conversationId) select(conversationId)
}
</script>

<template>
  <UDashboardPanel
    id="messages-list"
    :default-size="28"
    :min-size="22"
    :max-size="36"
    resizable
  >
    <template #header>
      <UDashboardNavbar :title="t('messages.inbox.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #trailing>
          <UBadge v-if="unreadTotal > 0" :label="String(unreadTotal)" variant="subtle" />
        </template>
        <template #right>
          <UButton
            icon="i-ph-plus"
            size="sm"
            :label="t('messages.inbox.new')"
            @click="composeOpen = true"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div v-if="disabled" class="p-4">
        <CoreEmptyState
          icon="i-ph-envelope-simple-open"
          :title="t('messages.inbox.disabled')"
          :description="t('messages.inbox.disabledHint')"
        />
      </div>

      <template v-else>
        <div class="flex items-center gap-1 border-b border-default px-3 py-2">
          <UButton
            size="xs"
            :variant="showUnreadOnly ? 'ghost' : 'soft'"
            color="neutral"
            :label="t('messages.inbox.allFilter')"
            @click="showUnreadOnly = false"
          />
          <UButton
            size="xs"
            :variant="showUnreadOnly ? 'soft' : 'ghost'"
            color="neutral"
            :label="t('messages.inbox.unreadFilter')"
            @click="showUnreadOnly = true"
          />
        </div>

        <MessageInboxList
          :conversations="conversations"
          :selected-id="selectedId"
          :loading="status === 'pending'"
          @select="select"
        />
      </template>
    </template>
  </UDashboardPanel>

  <!-- Der Lesebereich als ZWEITES Panel (Template-Muster) — ab `lg`. -->
  <UDashboardPanel v-if="!isMobile && !disabled" id="messages-thread">
    <template #body>
      <MessageThread
        v-if="selectedId"
        :key="selectedId"
        :conversation-id="selectedId"
        @sent="afterChange()"
        @closed="clearSelection(); refresh()"
        @back="clearSelection"
      />
      <div v-else class="flex h-full items-center justify-center text-sm text-muted">
        {{ t('messages.inbox.select') }}
      </div>
    </template>
  </UDashboardPanel>

  <!-- Unter `lg`: derselbe Lesebereich im Slideover. `ClientOnly`, weil die
       Breakpoint-Abfrage erst im Browser eine Antwort hat — ein Wechsel
       zwischen SSR- und Client-Zweig wäre ein Hydration-Bruch. -->
  <ClientOnly>
    <USlideover
      v-if="isMobile"
      :open="!!selectedId && !disabled"
      side="right"
      @update:open="value => { if (!value) clearSelection() }"
    >
      <template #content>
        <MessageThread
          v-if="selectedId"
          :key="selectedId"
          :conversation-id="selectedId"
          @sent="afterChange()"
          @closed="clearSelection(); refresh()"
          @back="clearSelection"
        />
      </template>
    </USlideover>
  </ClientOnly>

  <MessageComposeModal
    v-model:open="composeOpen"
    @sent="afterChange"
  />
</template>
