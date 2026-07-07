<script setup lang="ts">
/**
 * App-Override der posts-Layer-Seite: füllt den #comments-Slot mit dem
 * comments-Layer (targetType 'post') — genau die A14-Komposition, für die
 * beide Layer gebaut sind (die App darf beide kennen, sie sich nicht).
 */
const { t } = useI18n()

useHead({ title: () => t('posts.feed.title') })
</script>

<template>
  <UContainer class="max-w-2xl py-8">
    <h1 class="text-2xl font-bold">{{ t('posts.feed.title') }}</h1>
    <p class="mt-1 text-sm text-muted">{{ t('posts.feed.description') }}</p>

    <PostFeed class="mt-6">
      <template #comments="{ post }">
        <CommentSection :target-id="post.$id" target-type="post" target-url="/community" />
      </template>
    </PostFeed>
  </UContainer>
</template>
