<script setup lang="ts">
const appConfig = useAppConfig()
const { needsDecision, accept, decline } = useCookieConsent()

// Rendert nur wenn die App das Consent-Gate aktiviert hat UND noch keine Entscheidung vorliegt
const visible = computed(() => appConfig.maui?.consent?.enabled === true && needsDecision.value)
</script>

<template>
  <div
    v-if="visible"
    data-marker="MAUI-CONSENT"
    class="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-xl rounded-lg border border-default bg-default p-4 shadow-lg"
  >
    <p class="text-sm text-muted">
      Wir verwenden Cookies für anonyme Nutzungsstatistiken. Analytics lädt erst nach deiner Zustimmung.
    </p>
    <div class="mt-3 flex justify-end gap-2">
      <UButton color="neutral" variant="ghost" size="sm" @click="decline">Ablehnen</UButton>
      <UButton size="sm" @click="accept">Akzeptieren</UButton>
    </div>
  </div>
</template>
