<script setup lang="ts">
const { t } = useI18n()

// Demo-Target — echte Posts/Spaces liefert später die Community-Plattform
const DEMO_TARGET = { id: 'demo-post', type: 'post' } as const
</script>

<template>
  <main class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold">Reddit Comments</h1>
      <p class="text-muted">{{ t('app.tagline') }}</p>
    </div>
    <CommentSection :target-id="DEMO_TARGET.id" :target-type="DEMO_TARGET.type" />
  </main>
</template>
