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

const route = useRoute()

const { data: initial, error } = await useFetch<EventDetailResponse>(`/api/events/${route.params.id}`)
if (error.value || !initial.value) {
  throw createError({ status: 404, statusText: 'Event not found' })
}

useHead({ title: () => initial.value?.title ?? '' })

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
      <template #comments="{ event }">
        <CommentSection :target-id="event.$id" target-type="event" :target-url="`/events/${event.$id}`" />
      </template>
    </EventDetail>
  </UContainer>
</template>
