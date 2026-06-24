<script setup lang="ts">
const { t } = useI18n()
const appConfig = useAppConfig()
const { needsDecision, accept, decline } = useCookieConsent()

// Rendert nur wenn die App das Consent-Gate aktiviert hat UND noch keine Entscheidung vorliegt
const visible = computed(() => appConfig.maui?.consent?.enabled === true && needsDecision.value)
</script>

<template>
  <div
    v-if="visible"
    role="region"
    :aria-label="t('ui.consent.title')"
    data-marker="MAUI-CONSENT"
    class="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-xl rounded-lg border border-default bg-default p-4 shadow-lg"
  >
    <p class="text-sm text-muted">
      {{ t('ui.consent.message') }}
    </p>
    <div class="mt-3 flex justify-end gap-2">
      <UButton color="neutral" variant="ghost" size="sm" @click="decline">{{ t('ui.consent.decline') }}</UButton>
      <UButton size="sm" @click="accept">{{ t('ui.consent.accept') }}</UButton>
    </div>
  </div>
</template>
