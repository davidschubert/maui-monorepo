<script setup lang="ts">
// Demo-Hinweis (umgezogen aus apps/platform, Layout-Konsolidierung S9):
// Besucher einer Demo-Site sollen jederzeit sehen, dass Inhalte Beispiel-
// Material sind. Host-basiert über das Config-Gate maui.demo.hosts (leer =
// Banner existiert nicht) — bewusst KEIN Tenant-Feld: der Demo-Status ist
// eine Deployment-Aussage der App, kein Datenmodell des Control Plane.
//
// Optik: offizielles UBanner (Audit K1) — wie CoreAuthEmailVerifyBanner.
// BEWUSST kein close/keine UBanner-id: der Hinweis ist eine Eigenschaft des
// Hosts und darf nicht per localStorage dauerhaft wegklickbar sein.
const { t } = useI18n()
const appConfig = useAppConfig()
const host = useRequestURL().host
const demo = computed(() => (appConfig.maui as { demo?: { hosts?: string[], ctaUrl?: string } }).demo)
const isDemo = computed(() => (demo.value?.hosts ?? []).includes(host))

// CTA in den Self-Service-Trichter (absolute URL → ULink rendert ein
// externes <a>, gleiches Verhalten wie der frühere handgebaute Link).
const actions = computed(() => (demo.value?.ctaUrl
  ? [{ label: t('demo.cta'), to: demo.value.ctaUrl, variant: 'subtle' as const }]
  : undefined))
</script>

<template>
  <UBanner
    v-if="isDemo"
    icon="i-ph-sun-horizon"
    color="primary"
    :title="t('demo.banner')"
    :actions="actions"
    data-testid="demo-banner"
  />
</template>
