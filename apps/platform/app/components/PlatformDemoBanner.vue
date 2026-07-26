<script setup lang="ts">
// Demo-Hinweis (Morgenlicht, Tagesliste #2): Besucher der Demo-Community
// sollen jederzeit sehen, dass Inhalte Beispiel-Material sind. Host-basiert
// über das Config-Gate maui.demo.hosts (leer = Banner existiert nicht) —
// bewusst KEIN Tenant-Feld: der Demo-Status ist eine Deployment-Aussage
// dieser App, kein Datenmodell des Control Plane.
const appConfig = useAppConfig()
const host = useRequestURL().host
const demo = computed(() => (appConfig.maui as { demo?: { hosts?: string[], ctaUrl?: string } }).demo)
const isDemo = computed(() => (demo.value?.hosts ?? []).includes(host))
</script>

<template>
  <div
    v-if="isDemo"
    class="bg-primary-100 dark:bg-primary-950 text-primary-900 dark:text-primary-100 text-sm text-center px-4 py-1.5"
  >
    <UIcon name="i-ph-sun-horizon" class="inline-block size-4 align-text-bottom" aria-hidden="true" />
    {{ $t('demo.banner') }}
    <a
      v-if="demo?.ctaUrl"
      :href="demo.ctaUrl"
      class="underline underline-offset-2 font-medium"
    >{{ $t('demo.cta') }}</a>
  </div>
</template>
