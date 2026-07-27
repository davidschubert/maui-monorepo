<script setup lang="ts">
const { t } = useI18n()
const year = new Date().getFullYear()
</script>

<template>
  <UFooter>
    <template #left>
      <span class="text-sm text-muted">{{ t('docs.footer.credits', { year }) }}</span>
    </template>

    <template #right>
      <UButton
        to="https://pukalani.app"
        color="neutral"
        variant="ghost"
        size="sm"
      >
        {{ t('docs.footer.website') }}
      </UButton>
      <UButton
        to="https://pukalani.app/impressum"
        color="neutral"
        variant="ghost"
        size="sm"
      >
        {{ t('docs.footer.imprint') }}
      </UButton>
      <UButton
        to="https://pukalani.app/datenschutz"
        color="neutral"
        variant="ghost"
        size="sm"
      >
        {{ t('docs.footer.privacy') }}
      </UButton>
    </template>
  </UFooter>
</template>
