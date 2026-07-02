<script setup lang="ts">
// Admin-Bereich: bündelt Aktivitätsprotokoll + Konfiguration als Tabs (wie Settings).
import type { NavigationMenuItem } from '@nuxt/ui'

definePageMeta({ layout: 'dashboard', middleware: ['auth', 'admin'] })

const { t } = useI18n()
const localePath = useLocalePath()
const auth = useAuthStore()

// Tabs nach Capability filtern (audit.read / changelog.manage / system.manage)
const links = computed<NavigationMenuItem[]>(() => {
  const u = auth.user
  const items: NavigationMenuItem[] = []
  if (userHasCapability(u, 'audit.read')) items.push({ label: t('admin.audit.title'), icon: 'i-ph-scroll', to: localePath('/dashboard/admin'), exact: true })
  if (userHasCapability(u, 'changelog.manage')) items.push({ label: t('admin.changelog.title'), icon: 'i-ph-megaphone', to: localePath('/dashboard/admin/changelog') })
  if (userHasCapability(u, 'system.manage')) items.push({ label: t('admin.config.title'), icon: 'i-ph-toggle-left', to: localePath('/dashboard/admin/config') })
  if (userHasCapability(u, 'users.manage')) items.push({ label: t('admin.gdprExports.title'), icon: 'i-ph-file-lock', to: localePath('/dashboard/admin/gdpr-exports') })
  return items
})
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
