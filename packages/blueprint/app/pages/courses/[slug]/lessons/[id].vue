<script setup lang="ts">
/**
 * BAUPLAN-Komposition Lektion + Kommentare (umgezogen aus apps/comments,
 * 2026-07-31 — OPEN-ITEMS C3): füllt den #comments-Slot der LessonView des
 * courses-Layers mit dem comments-Layer (targetType 'lesson'). Muster
 * events/[id]; vorher nur in der comments-App, im Pool fehlte sie
 * (PRODUKT-BILANZ.md).
 */
definePageMeta({ middleware: ['auth'] })

const route = useRoute()
</script>

<template>
  <LessonView>
    <template #comments="{ lesson }">
      <CommentSection
        :target-id="lesson.$id"
        target-type="lesson"
        :target-url="`/courses/${route.params.slug}/lessons/${lesson.$id}`"
      />
    </template>
  </LessonView>
</template>
