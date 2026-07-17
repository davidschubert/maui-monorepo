<script setup lang="ts">
/**
 * Detailseite des Layers. Apps überschreiben diese Seite, um den
 * #comments-Slot mit ihrem comments-Layer zu füllen (A14-Komposition,
 * siehe comments) — der Layer selbst kennt comments nicht.
 */
import type { EventDetailResponse } from '../../../shared/types/event'

const route = useRoute()

const { data: initial, error } = await useFetch<EventDetailResponse>(`/api/events/${route.params.id}`)
if (error.value || !initial.value) {
  throw createError({ status: 404, statusText: 'Event not found' })
}

useHead({ title: () => initial.value?.title ?? '' })
</script>

<template>
  <UContainer class="max-w-2xl py-8">
    <EventDetail :initial="initial!" />
  </UContainer>
</template>
