<script setup lang="ts">
/**
 * Default-Seite des Layers — öffentlich (Gäste lesen, Mitglieder posten).
 * Apps überschreiben diese Seite, um den #comments-Slot mit ihrem
 * comments-Layer zu füllen (A14-Komposition, siehe comments).
 */
const { t } = useI18n()

useHead({ title: () => t('posts.feed.title') })
</script>

<template>
  <UContainer class="max-w-2xl py-8">
    <h1 class="text-2xl font-bold">{{ t('posts.feed.title') }}</h1>
    <p class="mt-1 text-sm text-muted">{{ t('posts.feed.description') }}</p>

    <PostFeed class="mt-6" />
  </UContainer>
</template>
