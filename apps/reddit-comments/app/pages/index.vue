<script setup lang="ts">
const { t } = useI18n()

// Demo-Post bis Phase 11 echte Posts bringt
const DEMO_POST_ID = 'demo-post'
</script>

<template>
  <main class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold">Reddit Comments</h1>
      <p class="text-muted">{{ t('app.tagline') }}</p>
    </div>
    <CommentThread :post-id="DEMO_POST_ID" />
  </main>
</template>
