<script setup lang="ts">
/**
 * Dünne Layer-Seite — Apps überschreiben sie, um den #comments-Slot der
 * LessonView mit ihrem comments-Layer zu füllen (A14-Komposition,
 * Muster events/[id]).
 */
definePageMeta({ middleware: ['auth'] })
</script>

<template>
  <LessonView />
</template>
