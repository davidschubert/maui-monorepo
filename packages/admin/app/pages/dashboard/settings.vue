<script setup lang="ts">
// Settings-Hülle nach Template-Vorbild: Panel + Navbar + horizontale Sub-Nav
// (General/Security), Kind-Seiten rendern via <NuxtPage/>.
import type { NavigationMenuItem } from '@nuxt/ui'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'] })

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()

const links = computed<NavigationMenuItem[]>(() => [
  { label: t('dashboard.settings.general'), icon: 'i-ph-user', to: localePath('/dashboard/settings'), exact: true },
  { label: t('dashboard.settings.notifications'), icon: 'i-ph-bell', to: localePath('/dashboard/settings/notifications') },
  { label: t('dashboard.settings.sessions'), icon: 'i-ph-devices', to: localePath('/dashboard/settings/sessions') },
  { label: t('dashboard.settings.security'), icon: 'i-ph-shield', to: localePath('/dashboard/settings/security') },
])

// Die Sessions-Tabelle braucht mehr Breite (5 Spalten) — Formularseiten bleiben
// schmal. Daher den Container nur auf der Sessions-Route weiter aufziehen.
const containerWidth = computed(() =>
  route.path.endsWith('/settings/sessions') ? 'lg:max-w-4xl' : 'lg:max-w-2xl')
</script>

<template>
  <UDashboardPanel id="settings" :ui="{ body: 'lg:py-12' }">
    <template #header>
      <UDashboardNavbar :title="t('dashboard.settings.title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <UNavigationMenu :items="links" highlight class="-mx-1 flex-1" />
      </UDashboardToolbar>
    </template>

    <template #body>
      <div class="mx-auto flex w-full flex-col gap-4 sm:gap-6 lg:gap-12" :class="containerWidth">
        <NuxtPage />
      </div>
    </template>
  </UDashboardPanel>
</template>
