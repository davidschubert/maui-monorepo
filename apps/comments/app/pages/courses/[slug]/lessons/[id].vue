<script setup lang="ts">
/**
 * App-Override der courses-Lektionsseite: füllt den #comments-Slot der
 * LessonView mit dem comments-Layer (targetType 'lesson') — A14-Komposition,
 * Muster events/[id].
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
