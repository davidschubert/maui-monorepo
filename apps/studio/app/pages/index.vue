<script setup lang="ts">
const { t } = useI18n()

useSeoMeta({
  title: () => t('app.tagline'),
})
</script>

<template>
  <section class="mx-auto max-w-2xl py-16 text-center">
    <h1 class="text-3xl font-bold tracking-tight">{{ t('app.tagline') }}</h1>
    <p class="mt-4 text-muted">{{ t('home.subtitle') }}</p>

    <!-- Beispiel: Kommentar-Thread aus dem comments-Layer einbinden -->
    <!-- <CommentSection target-id="landing" target-type="page" class="mt-12 text-left" /> -->
  </section>
</template>
