<script setup lang="ts">
/**
 * App-Override der events-Layer-Detailseite: füllt den #comments-Slot mit
 * dem comments-Layer (targetType 'event') — genau die A14-Komposition, für
 * die beide Layer gebaut sind (die App darf beide kennen, sie sich nicht).
 */
import type { EventDetailResponse } from '../../../../../packages/events/shared/types/event'

const route = useRoute()

const { data: initial, error } = await useFetch<EventDetailResponse>(`/api/events/${route.params.id}`)
if (error.value || !initial.value) {
  throw createError({ status: 404, statusText: 'Event not found' })
}

useHead({ title: () => initial.value?.title ?? '' })
</script>

<template>
  <UContainer class="max-w-2xl py-8">
    <EventDetail :initial="initial!">
      <template #comments="{ event }">
        <CommentSection :target-id="event.$id" target-type="event" :target-url="`/events/${event.$id}`" />
      </template>
    </EventDetail>
  </UContainer>
</template>
