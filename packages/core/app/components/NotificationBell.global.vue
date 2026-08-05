<script setup lang="ts">
import type { Models } from 'node-appwrite'
import { notificationAudienceFor, notificationVisibleFor } from '../../shared/notificationScope'
import type { NotificationListResponse, UserNotification } from '../../shared/types/notification'

const { t, te } = useI18n()
const localePath = useLocalePath()
const auth = useAuthStore()
const config = useRuntimeConfig()
const { formatRelativeTime } = useFormatRelativeTime()

/**
 * In WELCHER Welt hängt diese Glocke (C15/Audit S6)? Dieselbe pure Rechnung wie
 * die Leseroute — sonst blendet Realtime etwas ein, das der nächste Reload
 * wieder wegnimmt. `useTenantId()` ist hier legitim (Spiegel-Inventar in
 * app/plugins/tenant-brand.server.ts): der Realtime-Strom kommt DIREKT von
 * Appwrite, ohne Server-Route, und muss deshalb selbst aussortieren. Wer in
 * zwei Communities Mitglied ist, bekommt beide Ströme zugestellt.
 */
const tenantId = useTenantId()
const isControlCenter = useIsControlCenter()
const audience = computed(() => notificationAudienceFor(tenantId.value, isControlCenter))

const notifications = ref<UserNotification[]>([])
const unread = ref(0)
const open = ref(false)

async function load() {
  try {
    const res = await $fetch<NotificationListResponse>('/api/notifications')
    notifications.value = res.notifications
    unread.value = res.unread
  }
  catch {
    // ignorieren — Bell bleibt leer
  }
}

// Realtime: neue Benachrichtigung für mich → sofort einblenden. Einmal abonniert;
// der where-Filter liest die User-ID dynamisch, damit auch ein Login NACH Mount
// greift (uid beim Subscribe zu fixieren würde sonst leer bleiben).
let stop: (() => void) | undefined
onMounted(() => {
  // communityId liegt an der ROW (system-025), aber nicht im ausgelieferten DTO —
  // die Leseroute filtert ja schon serverseitig. Der Realtime-Strom bringt die
  // rohe Zeile, deshalb hier explizit dazugetypt statt das DTO aufzuweiten.
  stop = useRealtimeRows<Models.Row & UserNotification & { communityId?: string }>(
    config.public.appwriteDatabaseId,
    'notifications',
    (ev) => {
      if (ev.type !== 'create') return
      // Dedupe gegen das parallel laufende load(): enthielt dessen Antwort den
      // Eintrag schon, würde er sonst doppelt gelistet UND doppelt gezählt.
      if (notifications.value.some(n => n.$id === ev.payload.$id)) return
      notifications.value = [ev.payload, ...notifications.value]
      unread.value++
    },
    {
      where: payload => payload.recipientId === auth.user?.$id
        && notificationVisibleFor(audience.value, payload),
    },
  )
})
onBeforeUnmount(() => stop?.())

// Bei (Re-)Login Notifications laden, bei Logout leeren — deckt auch den Fall ab,
// dass der Login erst nach dem Mount der Bell passiert.
watch(() => auth.user?.$id, (uid) => {
  if (uid) {
    load()
  }
  else {
    notifications.value = []
    unread.value = 0
  }
}, { immediate: true })

async function markAllRead() {
  if (unread.value === 0) return
  unread.value = 0
  notifications.value = notifications.value.map(n => ({ ...n, read: true }))
  try {
    await $fetch('/api/notifications/read', { method: 'POST' })
  }
  catch {
    // optimistisch — nächster Load korrigiert
  }
}

function onToggle(value: boolean) {
  open.value = value
  if (value) markAllRead()
}

// Defense-in-depth gegen Open-Redirect: nur interne absolute Pfade durchlassen
// (gleicher Guard wie das targetUrl-Schema), sonst auf '/' zurückfallen. Schützt
// auch vor evtl. alt gespeicherten/vergifteten Notification-Links.
function safeLink(link?: string): string {
  return link && /^\/(?![/\\%])[^\s\\]*$/.test(link) ? link : '/'
}

// Nachrichtentext je Notification-Typ; unbekannte Typen fallen auf 'replied'
// zurück (alt gespeicherte Rows / künftige Typen brechen die Bell nicht).
// 'reminder' ist generisch (Termin-/Fristen-Erinnerung, {name} = Betreff) —
// erster Konsument: events (Phase 27). 'ticket' = Board-Updates (tickets),
// 'billing' = Zahlungsprobleme (billing) — je {name} = Ticket-/Plan-Titel.
function messageKey(type: string): string {
  if (type === 'mention') return 'notifications.mentioned'
  if (type === 'reminder') return 'notifications.reminder'
  if (type === 'ticket') return 'notifications.ticket'
  if (type === 'billing') return 'notifications.billing'
  // 'siteInvite' = Einladung in eine Community ({name} = deren Anzeigename);
  // der Link führt auf /join, wo die offene Einladung mit EINEM Klick
  // angenommen wird (Davids Entscheidung 2 vom 2026-07-29).
  if (type === 'siteInvite') return 'notifications.siteInvite'
  // 'invite.request' = Early-Access-Anfrage ans Control Plane ({name} = die
  // anfragende Adresse). Ohne diesen Zweig fiel der Typ auf 'replied' zurück
  // und die Betreiber-Glocke behauptete „hat auf deinen Kommentar geantwortet"
  // (C17) — der Absender existiert seit control-017, der Lesetext nicht.
  if (type === 'invite.request') return 'notifications.inviteRequest'
  // 'abuse.report' = Missbrauchsmeldung aus dem öffentlichen Formular (M13,
  // control-034) — {name} = der gemeldete Host. Empfänger sind ausschließlich
  // Betreiber-Konten (scope 'account'), gelesen wird sie also in apps/control.
  if (type === 'abuse.report') return 'notifications.abuseReport'
  // 'badge.awarded' = ein verdientes Abzeichen (F1 Teilpaket 2) — {name} ist
  // sein NAME, und der steht in der Zeile als i18n-Schlüssel (siehe
  // `displayText`). Der Link führt in die Abzeichen-Galerie.
  if (type === 'badge.awarded') return 'notifications.badgeAwarded'
  // 'post.mention' = jemand hat dich in einem BEITRAG erwähnt ({name} = der
  // Absender). Ein eigener Typ neben 'mention', weil dessen Text „in einem
  // Kommentar" sagt — derselbe Schlüssel wäre für einen Beitrag schlicht
  // falsch, und der Rückfall auf 'replied' wäre noch falscher.
  if (type === 'post.mention') return 'notifications.mentionedInPost'
  // 'message.received' = eine neue PRIVATE Nachricht ({name} = der Absender).
  // Der TEXT steht bewusst nicht in der Meldung und nicht in der Mail
  // (PN-Konzept § 4): das Postfach ist ein dritter Ort, an dem der Inhalt
  // landet, und dieser Ort ist nicht der, den der Absender gewählt hat. Wer
  // den Text will, klickt — der Link führt in den Posteingang mit
  // vorgewählter Konversation.
  if (type === 'message.received') return 'notifications.messageReceived'
  return 'notifications.replied'
}

/**
 * Titel und Text einer Meldung — übersetzt, WENN dort ein Schlüssel steht.
 *
 * Fast alle Meldungen tragen rohe Inhalte (ein Absendername, ein Zitat); die
 * bleiben unverändert, weil `te()` sie nicht kennt. Abzeichen tragen dagegen
 * einen Schlüssel, denn ihr Name ist ein Produktwort und muss in der Sprache
 * DES BETRACHTERS erscheinen — nicht in der dessen, der ihn verliehen hat.
 * Der Server-Zweig für Mails macht dasselbe über eine eigene Registry
 * (core/server/utils/notificationText.ts).
 */
function displayText(value: string): string {
  return value && te(value) ? t(value) : value
}
</script>

<template>
  <UPopover :open="open" @update:open="onToggle">
    <UChip :show="unread > 0" :text="unread > 9 ? '9+' : unread" color="error" size="3xl">
      <UButton
        icon="i-ph-bell"
        color="neutral"
        variant="ghost"
        data-testid="notification-bell"
        :aria-label="t('notifications.title')"
      />
    </UChip>

    <template #content>
      <div class="max-h-96 w-80 overflow-y-auto p-1">
        <p class="px-2 py-1.5 text-sm font-semibold">{{ t('notifications.title') }}</p>

        <p v-if="notifications.length === 0" class="px-2 py-8 text-center text-sm text-muted">
          {{ t('notifications.empty') }}
        </p>

        <NuxtLink
          v-for="n in notifications"
          :key="n.$id"
          :to="localePath(safeLink(n.link))"
          class="block rounded-md px-2 py-2 transition-colors hover:bg-elevated"
          @click="() => { open = false }"
        >
          <div class="flex items-center gap-1.5">
            <span class="size-1.5 shrink-0 rounded-full" :class="n.read ? 'bg-transparent' : 'bg-primary'" />
            <i18n-t :keypath="messageKey(n.type)" tag="p" scope="global" class="truncate text-sm text-muted">
              <template #name><span class="font-medium text-default">{{ displayText(n.title) }}</span></template>
            </i18n-t>
          </div>
          <p class="truncate pl-3 text-xs text-muted">{{ displayText(n.body) }}</p>
          <p class="pl-3 text-xs text-dimmed">{{ formatRelativeTime(n.$createdAt) }}</p>
        </NuxtLink>
      </div>
    </template>
  </UPopover>
</template>
