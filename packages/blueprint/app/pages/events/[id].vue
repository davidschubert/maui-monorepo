<script setup lang="ts">
/**
 * BAUPLAN-Komposition Event + Kommentare (umgezogen aus apps/comments,
 * 2026-07-31 — OPEN-ITEMS C3): füllt den #comments-Slot des events-Layers mit
 * dem comments-Layer (targetType 'event'). Vorher lag diese Verdrahtung nur in
 * der comments-App — die Pool-Sites (platform) zeigten dasselbe Event OHNE
 * Kommentare. Muster: pages/feed.vue (PRODUKT-BILANZ.md).
 *
 * TICKET-KAUF bleibt APP-Sache und kommt deshalb aus der Config: der
 * Checkout-Endpunkt gehört der App, die events + billing komponiert
 * (apps/comments/server/api/events/[id]/checkout.post.ts). blueprint hat kein
 * server/ und darf keinen Pfad erfinden — im Pool gibt es die Route nicht (D1,
 * bezahlte Events sind dort gesperrt), ein fest verdrahteter Pfad hätte dort
 * einen aktiven Kauf-Knopf in einen 404 laufen lassen. Leeres Template = der
 * CTA bleibt fail-closed „Bald verfügbar" (EventDetail).
 */
import type { EventDetailResponse } from '../../../../events/shared/types/event'
import { eventIsRedacted } from '../../../../events/shared/eventModerationPolicy'

const route = useRoute()
const { t } = useI18n()

/**
 * MELDEN (F15, 2026-08-03): `ReportButton` gehört dem moderation-Layer,
 * `EventDetail` dem events-Layer — die beiden dürfen einander nicht kennen (A14).
 * blueprint ist der EINE Layer, der beide kennen darf, also wird die Verdrahtung
 * genau hier gemacht, exakt wie beim `#comments`-Slot darunter.
 *
 * Der Reason-Katalog kommt vom Konsumenten (Muster CommentItem.vue) — die
 * Moderation bleibt domänen-agnostisch. `scam` steht bewusst als eigener Grund
 * darin und nicht unter „Etwas anderes": bei einem TERMIN ist „das gibt es gar
 * nicht" der häufigste echte Missbrauch, und ein Grund, den der Meldende selbst
 * eintippen muss, wird seltener gemeldet und schlechter sortiert.
 *
 * KEIN lokaler `reported`-Zustand über den Seitenwechsel hinaus: anders als eine
 * Kommentarliste (die ihren Store hat) ist das hier EIN Ziel auf EINER Seite. Der
 * Knopf schaltet nach dem Absenden auf „Zurückziehen" um; nach einem Reload steht
 * er wieder auf „Melden" und ein zweiter Versuch läuft in das 409
 * `already_reported`, das ReportButton bereits als Erfolg behandelt (Befund 3).
 * Eine eigene „habe ich schon gemeldet?"-Route dafür wäre ein Request pro
 * Seitenaufruf für eine Kosmetik.
 */
const reported = ref(false)
const reportReasons = computed(() => [
  { value: 'spam', label: t('events.report.reasons.spam') },
  { value: 'scam', label: t('events.report.reasons.scam') },
  { value: 'harassment', label: t('events.report.reasons.harassment') },
  { value: 'offtopic', label: t('events.report.reasons.offtopic') },
  { value: 'other', label: t('events.report.reasons.other') },
])

const { data: initial, error } = await useFetch<EventDetailResponse>(`/api/events/${route.params.id}`)
if (error.value || !initial.value) {
  throw createError({ status: 404, statusText: 'Event not found' })
}

/**
 * GESCHWÄRZT (F46): der Titel ist leer, und ein leerer `<title>` lässt den Tab
 * die URL anzeigen — ausgerechnet auf der Seite, deren Text gerade entfernt
 * wurde. Der Platzhalter kommt aus derselben i18n-Quelle wie die Überschrift.
 */
useHead({
  title: () => eventIsRedacted(initial.value?.redactedAt)
    ? t('events.redacted.title')
    : initial.value?.title ?? '',
})

// Cast wie im blueprint-Layout: die AppConfig-Typen entstehen erst im
// Merge der jeweiligen App, der Layer liest sie bewusst defensiv.
const appConfig = useAppConfig()
const checkoutTemplate = computed(() =>
  (appConfig.pukalani as { events?: { ticketCheckoutPath?: string } }).events?.ticketCheckoutPath ?? '')
const ticketCheckoutPath = computed(() =>
  checkoutTemplate.value ? checkoutTemplate.value.replace('{id}', initial.value!.$id) : undefined)
</script>

<template>
  <UContainer class="max-w-2xl py-8">
    <EventDetail :initial="initial!" :ticket-checkout-path="ticketCheckoutPath">
      <template #actions="{ event }">
        <ReportButton
          target-type="event"
          :target-id="event.$id"
          :reasons="reportReasons"
          :reported="reported"
          size="sm"
          @update:reported="(v: boolean) => { reported = v }"
        />
      </template>
      <template #comments="{ event }">
        <CommentSection :target-id="event.$id" target-type="event" :target-url="`/events/${event.$id}`" />
      </template>
    </EventDetail>
  </UContainer>
</template>
