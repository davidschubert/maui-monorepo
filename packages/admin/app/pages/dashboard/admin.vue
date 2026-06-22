<script setup lang="ts">
// Admin-Bereich: bündelt Aktivitätsprotokoll + Konfiguration als Tabs (wie Settings).
import type { NavigationMenuItem } from '@nuxt/ui'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'] })

const { t } = useI18n()
const localePath = useLocalePath()

const links = computed<NavigationMenuItem[]>(() => [
  { label: t('admin.audit.title'), icon: 'i-ph-scroll', to: localePath('/dashboard/admin'), exact: true },
  { label: t('admin.changelog.title'), icon: 'i-ph-megaphone', to: localePath('/dashboard/admin/changelog') },
  { label: t('admin.config.title'), icon: 'i-ph-toggle-left', to: localePath('/dashboard/admin/config') },
])
</script>

<template>
  <UDashboardPanel id="admin">
    <template #header>
      <UDashboardNavbar :title="t('admin.nav.admin')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <UNavigationMenu :items="links" highlight class="-mx-1 flex-1" />
      </UDashboardToolbar>
    </template>

    <template #body>
      <NuxtPage />
    </template>
  </UDashboardPanel>
</template>
