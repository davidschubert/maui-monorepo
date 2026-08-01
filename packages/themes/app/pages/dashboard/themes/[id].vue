<script setup lang="ts">
/** Theme-Editor: bestehendes Custom Theme bearbeiten (Row-ID in der Route). */
definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'], requiredCapability: 'system.manage' })

const { t } = useI18n()
const route = useRoute()
const themeId = computed(() => String(route.params.id ?? ''))

useHead({ title: () => t('themes.customize.edit') })
</script>

<template>
  <CustomizeEditor :theme-id="themeId" />
</template>
